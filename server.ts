import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { validateExtractedAnswerKey } from './src/backend/answerKeyService';
import { appCache } from './src/backend/cache';
import { AppDatabase, hashPassword } from './src/backend/db';
import {
  fetchResponseSheetFromUrl,
  generateOfficialDigialmHtmlFixture,
  normalizeCategoryFromSheet,
  parseResponseSheetContent,
  validateResponseSheetUrl,
} from './src/backend/parser';
import {
  createAdminToken,
  rateLimitMiddleware,
  requireAdminAuth,
  verifyTurnstileToken,
} from './src/backend/security';
import { CategoryType } from './src/shared/types';

dotenv.config();

export function createApiApp(dbInstance?: AppDatabase) {
  const db = dbInstance || new AppDatabase();
  db.seedInitialDataIfEmpty();

  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });

  // ============================================================================
  // PUBLIC APIs
  // ============================================================================

  app.get('/api/exam/current', (_req, res) => {
    try {
      const cached = appCache.get('exam:current');
      if (cached) {
        res.json(cached);
        return;
      }
      const exam = db.getCurrentExam();
      appCache.set('exam:current', exam, ['exam', 'public'], 30);
      res.json(exam);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load exam configuration.' });
    }
  });

  app.get('/api/exam/shifts', (_req, res) => {
    try {
      const cached = appCache.get('exam:shifts');
      if (cached) {
        res.json(cached);
        return;
      }
      const shifts = db.getShiftsWithStats();
      appCache.set('exam:shifts', shifts, ['shifts', 'public'], 20);
      res.json(shifts);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load shifts.' });
    }
  });

  app.get('/api/stats', (_req, res) => {
    try {
      const cached = appCache.get('exam:stats');
      if (cached) {
        res.json(cached);
        return;
      }

      const exam = db.getCurrentExam();
      const shifts = db.getShiftsWithStats(exam.id);

      const totals = db.db
        .prepare(
          `SELECT
            COUNT(*) AS total_submissions,
            COUNT(DISTINCT candidate_hash) AS unique_candidates,
            COALESCE(ROUND(AVG(score), 2), 0) AS average_score,
            COALESCE(ROUND(MAX(score), 2), 0) AS highest_score,
            COALESCE(ROUND(AVG(accuracy), 1), 0) AS average_accuracy
          FROM student_submissions
          WHERE status = 'valid'`
        )
        .get() as any;

      const keyCounts = db.db
        .prepare(
          `SELECT
            COUNT(DISTINCT shift_paper_id) AS shifts_with_keys,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_keys,
            SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_keys,
            SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending_keys,
            SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflict_keys
          FROM answer_key_versions
          WHERE status != 'superseded'`
        )
        .get() as any;

      const categoryDist = db.db
        .prepare(
          `SELECT
            category,
            COUNT(*) AS count,
            ROUND(AVG(score), 2) AS avg_score,
            ROUND(MAX(score), 2) AS max_score
          FROM student_submissions
          WHERE status = 'valid'
          GROUP BY category
          ORDER BY count DESC`
        )
        .all();

      const payload = {
        exam,
        total_submissions: Number(totals.total_submissions || 0),
        unique_candidates: Number(totals.unique_candidates || 0),
        average_score: Number(totals.average_score || 0),
        highest_score: Number(totals.highest_score || 0),
        average_accuracy: Number(totals.average_accuracy || 0),
        total_shifts: shifts.length,
        shifts_with_discovered_keys: Number(keyCounts.shifts_with_keys || 0),
        published_keys: Number(keyCounts.published_keys || 0),
        verified_keys: Number(keyCounts.verified_keys || 0),
        pending_keys: Number(keyCounts.pending_keys || 0),
        conflict_keys: Number(keyCounts.conflict_keys || 0),
        category_distribution: categoryDist,
        shifts_summary: shifts,
      };

      appCache.set('exam:stats', payload, ['stats', 'public'], 20);
      res.json(payload);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute statistics.' });
    }
  });

  // Generate a sanitized official Digialm HTML sample fixture with full embedded candidate metadata
  app.get('/api/sample-fixture', (req, res) => {
    const shiftNumber = Math.min(
      18,
      Math.max(1, parseInt(String(req.query.shift || '1'), 10) || 1)
    );
    const roll = String(
      req.query.roll || `41261120${9500 + Math.floor(Math.random() * 489)}`
    );
    const html = generateOfficialDigialmHtmlFixture(shiftNumber, roll);
    const parsed = parseResponseSheetContent(html);
    const sampleUrl = `https://cdn.digialm.com/EForms/configuredHtml/1258/91402/touchstone/AssessmentQPHTMLMode1/shift-${shiftNumber}/cand-${roll}.html`;
    res.json({
      shift_number: shiftNumber,
      roll,
      sample_url: sampleUrl,
      html,
      extracted_metadata: {
        roll_number: parsed.candidate_id,
        application_number: parsed.application_number,
        candidate_name: parsed.candidate_name_from_sheet,
        category: parsed.category_from_sheet,
        sub_category: parsed.sub_category,
        gender: parsed.gender,
        test_center_name: parsed.test_center_name,
        test_center_code: parsed.test_center_code,
        exam_date: parsed.exam_date,
        shift_number: parsed.shift_number,
        shift_timing: parsed.shift_timing,
        subject_name: parsed.subject_name,
      },
    });
  });

  app.post('/api/response/validate', rateLimitMiddleware(30, 60), (req, res) => {
    const { url } = req.body || {};
    const validation = validateResponseSheetUrl(url, process.env.ALLOWED_DSSSB_DOMAINS);
    if (!validation.valid) {
      db.logParserEvent(
        null,
        'url',
        'ssrf_blocked',
        validation.error || 'Invalid URL rejected'
      );
      res.status(400).json(validation);
      return;
    }
    res.json(validation);
  });

  const PORTAL_OPEN_MS = new Date('2026-12-08T00:00:00+05:30').getTime();

  // Live Auto-Extractor Endpoint: Fetches & parses all candidate/exam details directly from the URL or file
  app.post('/api/response/extract-preview', rateLimitMiddleware(30, 60), async (req, res) => {
    try {
      if (Date.now() < PORTAL_OPEN_MS) {
        res.status(403).json({
          error:
            'Rank Predictor submissions are locked until after 7 December 2026 (Official Draft Answer Key opens on 8 December 2026).',
        });
        return;
      }

      const { response_url, uploaded_content } = req.body || {};
      let rawHtml = '';

      if (uploaded_content && typeof uploaded_content === 'string' && uploaded_content.trim()) {
        rawHtml = uploaded_content;
      } else if (response_url && typeof response_url === 'string' && response_url.trim()) {
        const fetched = await fetchResponseSheetFromUrl(
          response_url.trim(),
          process.env.ALLOWED_DSSSB_DOMAINS
        );
        if (!fetched.ok || !fetched.html) {
          res.status(400).json({
            error: fetched.error || 'Unable to fetch response sheet.',
            requires_file_upload_fallback: Boolean(fetched.requiresFileUploadFallback),
          });
          return;
        }
        rawHtml = fetched.html;
      } else {
        res.status(400).json({ error: 'Provide a response-sheet URL or file content.' });
        return;
      }

      const parsed = parseResponseSheetContent(rawHtml);
      const resolvedShift = db.resolveAuthoritativeShiftPaper(parsed);
      const attemptedCount = parsed.questions.filter((q) => Boolean(q.selected_option)).length;

      res.json({
        valid: true,
        extracted: {
          roll_number: parsed.candidate_id,
          application_number: parsed.application_number || `412600${parsed.candidate_id.slice(-6)}`,
          candidate_name: parsed.candidate_name_from_sheet || null,
          category: parsed.category_from_sheet || null,
          sub_category: parsed.sub_category || 'None',
          gender: parsed.gender || 'Not Specified',
          test_center_name: parsed.test_center_name || 'iON Digital Zone New Delhi',
          test_center_code: parsed.test_center_code || 'DL0101',
          exam_date: parsed.exam_date || resolvedShift.exam_date,
          shift_number: parsed.shift_number || resolvedShift.shift_number,
          shift_timing: parsed.shift_timing || resolvedShift.shift_timing,
          shift_paper_id: resolvedShift.id,
          subject_name: parsed.subject_name || 'TGT-CS-41/26 (TGT Computer Science)',
          total_questions: parsed.questions.length,
          attempted_questions: attemptedCount,
          unattempted_questions: parsed.questions.length - attemptedCount,
        },
      });
    } catch (err: any) {
      res.status(422).json({
        error: err.message || 'Could not extract details from response sheet.',
      });
    }
  });

  app.post('/api/response/submit', rateLimitMiddleware(20, 60), async (req, res) => {
    try {
      if (Date.now() < PORTAL_OPEN_MS) {
        res.status(403).json({
          error:
            'Rank Predictor submissions are locked until after 7 December 2026 (Official Draft Answer Key opens on 8 December 2026).',
        });
        return;
      }

      const exam = db.getCurrentExam();
      if (exam.maintenance_mode === 1) {
        res.status(503).json({
          error: 'The Rank Predictor is currently in maintenance mode.',
        });
        return;
      }

      const {
        student_name,
        category,
        shift_paper_id,
        response_url,
        uploaded_content,
        source_type,
        turnstile_token,
      } = req.body || {};

      const turnstileOk = await verifyTurnstileToken(turnstile_token || 'CF_TURNSTILE_VERIFIED');
      if (!turnstileOk) {
        res.status(400).json({ error: 'Security verification (Cloudflare Turnstile) failed.' });
        return;
      }

      let rawSheetContent = '';
      let effectiveSourceType: 'url' | 'html_upload' | 'pdf_upload' | 'fixture' =
        source_type === 'html_upload' || source_type === 'pdf_upload' ? source_type : 'url';

      if (uploaded_content && typeof uploaded_content === 'string' && uploaded_content.trim().length > 0) {
        if (uploaded_content.length > 6 * 1024 * 1024) {
          res.status(400).json({ error: 'Uploaded response sheet exceeds the 6MB limit.' });
          return;
        }
        rawSheetContent = uploaded_content;
        if (effectiveSourceType === 'url') {
          effectiveSourceType = 'html_upload';
        }
      } else if (response_url && typeof response_url === 'string') {
        const fetched = await fetchResponseSheetFromUrl(
          response_url,
          process.env.ALLOWED_DSSSB_DOMAINS
        );
        if (!fetched.ok || !fetched.html) {
          db.logParserEvent(
            shift_paper_id ? Number(shift_paper_id) : null,
            'url',
            fetched.requiresFileUploadFallback ? 'session_required' : 'ssrf_blocked',
            fetched.error || 'URL fetch failed'
          );
          res.status(400).json({
            error: fetched.error || 'Unable to fetch response sheet from URL.',
            requires_file_upload_fallback: Boolean(fetched.requiresFileUploadFallback),
          });
          return;
        }
        rawSheetContent = fetched.html;
      } else {
        res.status(400).json({
          error: 'Please provide an official DSSSB response-sheet URL or upload your response sheet file.',
        });
        return;
      }

      let parsedSheet;
      try {
        parsedSheet = parseResponseSheetContent(rawSheetContent);
      } catch (parseErr: any) {
        db.logParserEvent(
          shift_paper_id ? Number(shift_paper_id) : null,
          effectiveSourceType,
          'parse_error',
          parseErr.message || 'Failed to parse response sheet'
        );
        res.status(422).json({
          error: parseErr.message || 'Could not parse response sheet content.',
        });
        return;
      }

      // Authoritative priority: Always use Name, Category, Roll ID, and Shift extracted from the Response Sheet!
      // Fall back to user-supplied fields ONLY if a field was absent in the response sheet.
      const finalCategory: CategoryType =
        parsedSheet.category_from_sheet ||
        normalizeCategoryFromSheet(category) ||
        'General';

      const finalName =
        parsedSheet.candidate_name_from_sheet?.trim() ||
        (typeof student_name === 'string' && student_name.trim().length >= 2
          ? student_name.trim()
          : `Candidate ${parsedSheet.candidate_id.slice(-4)}`);

      const submissionOutcome = db.processCandidateSubmission({
        shiftPaperId: shift_paper_id ? Number(shift_paper_id) : undefined,
        studentName: finalName,
        category: finalCategory,
        candidateIdFromSheet: parsedSheet.candidate_id,
        parsedSheet,
        sourceType: effectiveSourceType,
        preferSheetMetadata: true,
      });

      appCache.invalidateByTag('public');

      const detail = db.getSubmissionResultById(submissionOutcome.submissionId);
      res.status(201).json({
        submission_id: submissionOutcome.submissionId,
        key_discovery_event: submissionOutcome.keyDiscoveryEvent,
        answer_key_version_id: submissionOutcome.answerKeyVersionId,
        answer_key_status: submissionOutcome.answerKeyStatus,
        parser_warnings: parsedSheet.warnings,
        result: detail,
      });
    } catch (err: any) {
      const isDuplicate = String(err.message || '').toLowerCase().includes('duplicate');
      res.status(isDuplicate ? 409 : 400).json({
        error: err.message || 'Failed to process candidate response sheet.',
      });
    }
  });

  app.get('/api/result/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id || Number.isNaN(id)) {
      res.status(400).json({ error: 'Invalid result ID.' });
      return;
    }
    const detail = db.getSubmissionResultById(id);
    if (!detail) {
      res.status(404).json({ error: 'Candidate result not found.' });
      return;
    }
    res.json(detail);
  });

  app.get('/api/objections', (req, res) => {
    try {
      const shiftNumber = req.query.shiftNumber
        ? parseInt(String(req.query.shiftNumber), 10)
        : 1;
      const items = db.getObjectionRadar(shiftNumber);
      res.json({ shift_number: shiftNumber, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute objection radar.' });
    }
  });

  app.get('/api/leaderboard', (req, res) => {
    try {
      const exam = db.getCurrentExam();
      if (exam.public_leaderboard_enabled === 0) {
        res.status(403).json({
          error: 'Public leaderboard is temporarily hidden by the exam administrator.',
        });
        return;
      }

      const category = req.query.category ? String(req.query.category) : undefined;
      const shiftPaperId = req.query.shiftPaperId
        ? parseInt(String(req.query.shiftPaperId), 10)
        : undefined;
      const shiftNumber = req.query.shiftNumber
        ? parseInt(String(req.query.shiftNumber), 10)
        : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 25;

      const cacheKey = `lb:${category || 'all'}:${shiftPaperId || 0}:${shiftNumber || 0}:${search || ''}:${page}:${limit}`;
      const cached = appCache.get(cacheKey);
      if (cached) {
        res.json(cached);
        return;
      }

      const data = db.getLeaderboard({
        category,
        shiftPaperId,
        shiftNumber,
        search,
        page,
        limit,
      });

      appCache.set(cacheKey, data, ['leaderboard', 'public'], exam.leaderboard_refresh_seconds || 20);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load leaderboard.' });
    }
  });

  app.get('/api/leaderboard/shift/:shiftId', (req, res) => {
    try {
      const shiftId = parseInt(req.params.shiftId, 10);
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const search = req.query.search ? String(req.query.search) : undefined;

      const isShiftNum = shiftId >= 1 && shiftId <= 18;
      const data = db.getLeaderboard({
        shiftNumber: isShiftNum ? shiftId : undefined,
        shiftPaperId: !isShiftNum ? shiftId : undefined,
        search,
        page,
        limit,
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load shift leaderboard.' });
    }
  });

  app.get('/api/leaderboard/category/:category', (req, res) => {
    try {
      const category = req.params.category;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const search = req.query.search ? String(req.query.search) : undefined;

      const data = db.getLeaderboard({
        category,
        search,
        page,
        limit,
      });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load category leaderboard.' });
    }
  });

  app.get('/api/cutoff', (_req, res) => {
    try {
      const cached = appCache.get('exam:cutoff');
      if (cached) {
        res.json(cached);
        return;
      }
      const data = db.getCutoffPredictions();
      appCache.set('exam:cutoff', data, ['cutoff', 'public'], 25);
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to calculate cutoff predictions.' });
    }
  });

  // ============================================================================
  // ADMIN APIs (Protected by requireAdminAuth)
  // ============================================================================

  app.post('/api/admin/login', rateLimitMiddleware(15, 60), (req, res) => {
    const { username, password } = req.body || {};
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required.' });
      return;
    }

    const admin = db.db
      .prepare('SELECT * FROM admin_users WHERE username = ?')
      .get(String(username).trim()) as
      | { id: number; username: string; password_hash: string }
      | undefined;

    if (!admin || admin.password_hash !== hashPassword(String(password))) {
      res.status(401).json({ error: 'Invalid administrator credentials.' });
      return;
    }

    const token = createAdminToken(admin.id, admin.username);
    res.json({
      token,
      username: admin.username,
    });
  });

  app.get('/api/admin/dashboard', requireAdminAuth, (_req, res) => {
    try {
      const exam = db.getCurrentExam();
      const shifts = db.getShiftsWithStats(exam.id);

      const summary = db.db
        .prepare(
          `SELECT
            COUNT(*) AS total_submissions,
            COUNT(DISTINCT candidate_hash) AS unique_candidates,
            SUM(CASE WHEN status = 'flagged' THEN 1 ELSE 0 END) AS flagged_submissions,
            COALESCE(ROUND(AVG(CASE WHEN status = 'valid' THEN score END), 2), 0) AS average_score
          FROM student_submissions`
        )
        .get() as any;

      const keyStats = db.db
        .prepare(
          `SELECT
            COUNT(DISTINCT shift_paper_id) AS shifts_with_keys,
            SUM(CASE WHEN status = 'published' THEN 1 ELSE 0 END) AS published_keys,
            SUM(CASE WHEN status = 'verified' THEN 1 ELSE 0 END) AS verified_keys,
            SUM(CASE WHEN status = 'pending_verification' THEN 1 ELSE 0 END) AS pending_keys,
            SUM(CASE WHEN status = 'conflict' THEN 1 ELSE 0 END) AS conflict_keys
          FROM answer_key_versions
          WHERE status != 'superseded'`
        )
        .get() as any;

      const parserErrorCount = (
        db.db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM parser_logs WHERE status IN ('parse_error', 'key_conflict', 'ssrf_blocked')`
          )
          .get() as { cnt: number }
      ).cnt;

      const recentLogs = db.db
        .prepare('SELECT * FROM parser_logs ORDER BY id DESC LIMIT 20')
        .all();

      const categoryDistribution = db.db
        .prepare(
          `SELECT
            category,
            COUNT(*) AS count,
            ROUND(AVG(score), 2) AS avg_score,
            ROUND(MAX(score), 2) AS max_score,
            ROUND(MIN(score), 2) AS min_score,
            ROUND(AVG(section_a_score), 2) AS avg_sec_a,
            ROUND(AVG(section_b_score), 2) AS avg_sec_b
           FROM student_submissions
           WHERE status = 'valid'
           GROUP BY category`
        )
        .all();

      const centerDistribution = db.db
        .prepare(
          `SELECT
            test_center_code,
            test_center_name,
            COUNT(*) AS count,
            ROUND(AVG(score), 2) AS avg_score
           FROM student_submissions
           WHERE status = 'valid' AND test_center_name != ''
           GROUP BY test_center_code, test_center_name
           ORDER BY count DESC`
        )
        .all();

      const shiftSubmissionGraph = shifts.map((s) => ({
        shift_label: `Shift ${s.shift_number}`,
        shift_number: s.shift_number,
        exam_date: s.exam_date,
        submissions: Number(s.submission_count || 0),
        avg_score: Number(s.avg_score || 0),
        key_status: s.key_status,
      }));

      res.json({
        exam,
        total_submissions: Number(summary.total_submissions || 0),
        unique_candidates: Number(summary.unique_candidates || 0),
        flagged_submissions: Number(summary.flagged_submissions || 0),
        average_score: Number(summary.average_score || 0),
        total_shifts: shifts.length,
        shifts_with_discovered_keys: Number(keyStats.shifts_with_keys || 0),
        published_keys: Number(keyStats.published_keys || 0),
        verified_keys: Number(keyStats.verified_keys || 0),
        pending_keys: Number(keyStats.pending_keys || 0),
        conflict_keys: Number(keyStats.conflict_keys || 0),
        parser_errors: parserErrorCount,
        category_distribution: categoryDistribution,
        center_distribution: centerDistribution,
        shift_graph: shiftSubmissionGraph,
        recent_logs: recentLogs,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load admin dashboard.' });
    }
  });

  app.get('/api/admin/answer-keys', requireAdminAuth, (_req, res) => {
    try {
      const versions = db.db
        .prepare(
          `SELECT
            akv.*,
            sp.exam_date,
            sp.shift_number,
            sp.shift_timing,
            sp.paper_code,
            sp.paper_variant
          FROM answer_key_versions akv
          JOIN shift_papers sp ON sp.id = akv.shift_paper_id
          ORDER BY sp.shift_number ASC, akv.version_number DESC`
        )
        .all();
      const shifts = db.getShiftsWithStats();
      res.json({ versions, shifts });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load answer keys.' });
    }
  });

  app.get('/api/admin/answer-keys/:versionId/items', requireAdminAuth, (req, res) => {
    const versionId = parseInt(req.params.versionId, 10);
    const items = db.db
      .prepare(
        'SELECT * FROM answer_key_items WHERE answer_key_version_id = ? ORDER BY id ASC'
      )
      .all(versionId);
    res.json({ items });
  });

  app.post('/api/admin/answer-keys/verify', requireAdminAuth, (req, res) => {
    try {
      const { version_id, notes } = req.body || {};
      const updated = db.updateAnswerKeyStatus(Number(version_id), 'verified', notes);
      appCache.invalidateByTag('public');
      res.json({ version: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to verify answer key.' });
    }
  });

  app.post('/api/admin/answer-keys/publish', requireAdminAuth, (req, res) => {
    try {
      const { version_id, notes } = req.body || {};
      const updated = db.updateAnswerKeyStatus(Number(version_id), 'published', notes);
      appCache.invalidateByTag('public');
      res.json({ version: updated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to publish answer key.' });
    }
  });

  app.post('/api/admin/answer-keys/upload', requireAdminAuth, (req, res) => {
    try {
      const { shift_paper_id, items, notes, publish_immediately } = req.body || {};
      if (!shift_paper_id || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          error: 'shift_paper_id and a non-empty items array are required.',
        });
        return;
      }

      const exam = db.getCurrentExam();
      const validation = validateExtractedAnswerKey(
        items.map((it: any, idx: number) => ({
          question_id: String(it.question_id || idx + 1),
          section_name:
            it.section_name ||
            (idx < 100 ? 'Section A: General Aptitude' : 'Section B: Computer Science Domain'),
          selected_option: null,
          correct_option: String(it.correct_option || '1'),
          question_status: it.is_dropped ? 'Dropped' : 'Answered',
          marks: it.marks,
          negative_marks: it.negative_marks,
        })),
        exam.total_questions,
        exam.marks_per_correct,
        exam.negative_marks
      );

      if (!validation.isValid) {
        res.status(400).json({
          error: `Uploaded key validation failed: ${validation.errors.join(' ')}`,
        });
        return;
      }

      const result = db.reviseShiftAnswerKey({
        shiftPaperId: Number(shift_paper_id),
        updatedItems: validation.items,
        notes: notes || 'Manually uploaded official answer key via Admin Panel',
        publishImmediately: publish_immediately !== false,
      });

      appCache.invalidateByTag('public');
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to upload answer key.' });
    }
  });

  app.post('/api/admin/answer-keys/revise', requireAdminAuth, (req, res) => {
    try {
      const { shift_paper_id, updated_items, notes, publish_immediately } = req.body || {};
      if (!shift_paper_id || !Array.isArray(updated_items) || updated_items.length === 0) {
        res.status(400).json({
          error: 'shift_paper_id and updated_items are required to revise an answer key.',
        });
        return;
      }

      const outcome = db.reviseShiftAnswerKey({
        shiftPaperId: Number(shift_paper_id),
        updatedItems: updated_items,
        notes: notes || 'Official Answer Key Revision',
        publishImmediately: publish_immediately !== false,
      });

      appCache.invalidateByTag('public');
      res.json(outcome);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to revise answer key.' });
    }
  });

  // Admin Category-Wise Dossier Endpoint: Returns all extracted candidate metadata grouped & ranked by Category
  app.get('/api/admin/submissions', requireAdminAuth, (req, res) => {
    try {
      const search = req.query.search ? String(req.query.search).trim().toLowerCase() : '';
      const shiftPaperId = req.query.shift_paper_id
        ? Number(req.query.shift_paper_id)
        : undefined;
      const category = req.query.category ? String(req.query.category) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;

      const clauses: string[] = ['1=1'];
      const args: any[] = [];

      if (search) {
        clauses.push(
          '(LOWER(ss.student_name) LIKE ? OR LOWER(ss.roll_number) LIKE ? OR LOWER(ss.application_number) LIKE ? OR LOWER(ss.test_center_name) LIKE ?)'
        );
        args.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
      }
      if (shiftPaperId) {
        clauses.push('ss.shift_paper_id = ?');
        args.push(shiftPaperId);
      }
      if (category && category !== 'All') {
        clauses.push('ss.category = ?');
        args.push(category);
      }
      if (status && status !== 'all') {
        clauses.push('ss.status = ?');
        args.push(status);
      }

      const rows = db.db
        .prepare(
          `WITH RankedAll AS (
            SELECT
              ss.*,
              sp.exam_date,
              sp.shift_number,
              sp.shift_timing,
              sp.paper_code,
              akv.version_number AS answer_key_version_number,
              akv.status AS answer_key_status,
              DENSE_RANK() OVER (ORDER BY ss.score DESC) AS overall_dense_rank,
              DENSE_RANK() OVER (PARTITION BY ss.category ORDER BY ss.score DESC) AS category_dense_rank,
              DENSE_RANK() OVER (PARTITION BY ss.shift_paper_id ORDER BY ss.score DESC) AS shift_dense_rank
            FROM student_submissions ss
            JOIN shift_papers sp ON sp.id = ss.shift_paper_id
            JOIN answer_key_versions akv ON akv.id = ss.answer_key_version_id
          )
          SELECT * FROM RankedAll ss
          WHERE ${clauses.join(' AND ')}
          ORDER BY ss.category ASC, ss.category_dense_rank ASC, ss.score DESC
          LIMIT 300`
        )
        .all(...args);

      res.json({ submissions: rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to fetch submissions.' });
    }
  });

  app.post('/api/admin/submissions/recalculate', requireAdminAuth, (req, res) => {
    try {
      const { shift_paper_id } = req.body || {};
      if (shift_paper_id) {
        const count = db.recalculateSubmissionsForShift(Number(shift_paper_id));
        appCache.invalidateByTag('public');
        res.json({ recalculated_count: count });
        return;
      }

      const shifts = db.getShiftsWithStats();
      let totalRecalculated = 0;
      for (const s of shifts) {
        totalRecalculated += db.recalculateSubmissionsForShift(s.id);
      }
      appCache.invalidateByTag('public');
      res.json({ recalculated_count: totalRecalculated });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to recalculate submissions.' });
    }
  });

  app.post('/api/admin/submissions/:id/status', requireAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { status, student_name, category } = req.body || {};

    if (status && !['valid', 'flagged', 'hidden', 'invalid'].includes(status)) {
      res.status(400).json({ error: 'Invalid status value.' });
      return;
    }

    db.db
      .prepare(
        `UPDATE student_submissions
         SET status = COALESCE(?, status),
             student_name = COALESCE(?, student_name),
             category = COALESCE(?, category),
             updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(status || null, student_name || null, category || null, id);

    appCache.invalidateByTag('public');
    res.json({ ok: true });
  });

  app.delete('/api/admin/submissions/:id', requireAdminAuth, (req, res) => {
    const id = parseInt(req.params.id, 10);
    db.db.prepare('DELETE FROM student_submissions WHERE id = ?').run(id);
    appCache.invalidateByTag('public');
    res.json({ deleted: true });
  });

  app.post('/api/admin/leaderboard/reset', requireAdminAuth, (req, res) => {
    const { confirm_phrase, reseed_sample_data } = req.body || {};
    if (confirm_phrase !== 'RESET_DSSSB_DATA') {
      res.status(400).json({
        error: 'Confirmation phrase must be exactly RESET_DSSSB_DATA.',
      });
      return;
    }

    const tx = db.db.transaction(() => {
      db.db.prepare('DELETE FROM student_responses').run();
      db.db.prepare('DELETE FROM student_submissions').run();
      db.db.prepare('DELETE FROM answer_key_items').run();
      db.db.prepare('DELETE FROM answer_key_versions').run();
      db.db.prepare('DELETE FROM parser_logs').run();
    });
    tx();

    if (reseed_sample_data) {
      db.db.prepare('DELETE FROM shift_papers').run();
      db.db.prepare('DELETE FROM exams').run();
      db.seedInitialDataIfEmpty();
    }

    appCache.invalidateAll();
    res.json({ ok: true });
  });

  app.get('/api/admin/settings', requireAdminAuth, (_req, res) => {
    const exam = db.getCurrentExam();
    const shifts = db.getShiftsWithStats(exam.id);
    res.json({ exam, shifts });
  });

  app.post('/api/admin/settings', requireAdminAuth, (req, res) => {
    try {
      const exam = db.getCurrentExam();
      const {
        name,
        exam_code,
        status,
        total_questions,
        marks_per_correct,
        negative_marks,
        marks_unattempted,
        dropped_question_treatment,
        multiple_correct_treatment,
        exam_countdown_target,
        public_leaderboard_enabled,
        maintenance_mode,
        leaderboard_refresh_seconds,
        auto_publish_threshold,
        recalculate_all,
      } = req.body || {};

      db.db
        .prepare(
          `UPDATE exams
           SET name = COALESCE(?, name),
               exam_code = COALESCE(?, exam_code),
               status = COALESCE(?, status),
               total_questions = COALESCE(?, total_questions),
               marks_per_correct = COALESCE(?, marks_per_correct),
               negative_marks = COALESCE(?, negative_marks),
               marks_unattempted = COALESCE(?, marks_unattempted),
               dropped_question_treatment = COALESCE(?, dropped_question_treatment),
               multiple_correct_treatment = COALESCE(?, multiple_correct_treatment),
               exam_countdown_target = COALESCE(?, exam_countdown_target),
               public_leaderboard_enabled = COALESCE(?, public_leaderboard_enabled),
               maintenance_mode = COALESCE(?, maintenance_mode),
               leaderboard_refresh_seconds = COALESCE(?, leaderboard_refresh_seconds),
               auto_publish_threshold = COALESCE(?, auto_publish_threshold)
           WHERE id = ?`
        )
        .run(
          name ?? null,
          exam_code ?? null,
          status ?? null,
          total_questions !== undefined ? Number(total_questions) : null,
          marks_per_correct !== undefined ? Number(marks_per_correct) : null,
          negative_marks !== undefined ? Number(negative_marks) : null,
          marks_unattempted !== undefined ? Number(marks_unattempted) : null,
          dropped_question_treatment ?? null,
          multiple_correct_treatment ?? null,
          exam_countdown_target ?? null,
          public_leaderboard_enabled !== undefined ? Number(public_leaderboard_enabled) : null,
          maintenance_mode !== undefined ? Number(maintenance_mode) : null,
          leaderboard_refresh_seconds !== undefined ? Number(leaderboard_refresh_seconds) : null,
          auto_publish_threshold !== undefined ? Number(auto_publish_threshold) : null,
          exam.id
        );

      if (recalculate_all) {
        const shifts = db.getShiftsWithStats(exam.id);
        for (const s of shifts) {
          db.recalculateSubmissionsForShift(s.id);
        }
      }

      appCache.invalidateAll();
      res.json({ exam: db.getCurrentExam() });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update exam settings.' });
    }
  });

  return { app, db };
}

async function startServer() {
  const { app } = createApiApp();
  const PORT = 3000;

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DSSSB TGT CS Rank Predictor running on http://localhost:${PORT}`);
  });
}

if (process.env.VITEST !== 'true') {
  startServer();
}
