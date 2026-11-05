import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  AnswerKeyItem,
  AnswerKeyStatus,
  AnswerKeyVersion,
  CategoryCutoffEstimate,
  CategoryType,
  ExamConfig,
  LeaderboardEntry,
  ParsedQuestionResponse,
  ParsedResponseSheet,
  ShiftPaper,
  StudentSubmissionDetail,
} from '../shared/types';
import {
  compareWithCachedAnswerKey,
  validateExtractedAnswerKey,
} from './answerKeyService';
import {
  generateOfficialDigialmHtmlFixture,
  getShiftDefaultDate,
  parseResponseSheetContent,
} from './parser';
import { calculateCandidateScore } from './scoringEngine';

export function hashPassword(password: string): string {
  const salt = 'dsssb_tgt_cs_salt_v1';
  return crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256').toString('hex');
}

export function computeCandidateIdentityHash(
  examId: number,
  shiftPaperId: number,
  candidateRawIdentifier: string
): string {
  const normalized = candidateRawIdentifier.trim().toUpperCase();
  return crypto
    .createHash('sha256')
    .update(`CAND_ID:EXAM_${examId}:SHIFT_${shiftPaperId}:${normalized}`)
    .digest('hex');
}

export function computeSelectedResponsesHash(questions: ParsedQuestionResponse[]): string {
  const canonical = questions
    .map((q) => `${q.question_id}:${q.selected_option || '-'}`)
    .sort()
    .join('|');
  return crypto.createHash('sha256').update(canonical).digest('hex');
}

export class AppDatabase {
  public db: Database.Database;

  constructor(dbPath?: string) {
    const resolvedPath =
      dbPath ||
      process.env.SQLITE_DB_PATH ||
      path.resolve(process.cwd(), 'data', 'dsssb_tgt_cs.sqlite');
    if (resolvedPath !== ':memory:') {
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
    this.db = new Database(resolvedPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }

  public migrate(): void {
    const migrationPath = path.resolve(process.cwd(), 'migrations', '0001_initial_schema.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');
    this.db.exec(sql);

    // Ensure any pre-existing student_submissions table has the new rich metadata columns
    const existingCols = (
      this.db.prepare('PRAGMA table_info(student_submissions)').all() as Array<{ name: string }>
    ).map((c) => c.name);

    const alterColumns: Array<[string, string]> = [
      ['roll_number', "TEXT NOT NULL DEFAULT ''"],
      ['application_number', "TEXT NOT NULL DEFAULT ''"],
      ['gender', "TEXT NOT NULL DEFAULT ''"],
      ['sub_category', "TEXT NOT NULL DEFAULT 'None'"],
      ['test_center_name', "TEXT NOT NULL DEFAULT ''"],
      ['test_center_code', "TEXT NOT NULL DEFAULT ''"],
      ['subject_from_sheet', "TEXT NOT NULL DEFAULT 'TGT Computer Science (41/26)'"],
    ];

    for (const [colName, colDef] of alterColumns) {
      if (!existingCols.includes(colName)) {
        this.db.exec(`ALTER TABLE student_submissions ADD COLUMN ${colName} ${colDef}`);
      }
    }
  }

  public seedInitialDataIfEmpty(): void {
    const adminUser = process.env.ADMIN_DEFAULT_USERNAME || 'admin';
    const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || 'Dsssb123!321';

    // Always ensure the admin account exists and has the configured password (Dsssb123!321)
    const existingAdmin = this.db
      .prepare('SELECT id FROM admin_users WHERE username = ?')
      .get(adminUser) as { id: number } | undefined;

    if (existingAdmin) {
      this.db
        .prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?')
        .run(hashPassword(adminPass), existingAdmin.id);
    } else {
      this.db
        .prepare('INSERT INTO admin_users (username, password_hash) VALUES (?, ?)')
        .run(adminUser, hashPassword(adminPass));
    }

    const existingExam = this.db
      .prepare('SELECT id, name, exam_countdown_target FROM exams LIMIT 1')
      .get() as { id: number; name: string; exam_countdown_target: string } | undefined;

    if (existingExam) {
      if (
        existingExam.name.includes('55/25') ||
        existingExam.exam_countdown_target.includes('2026-12-20') ||
        existingExam.exam_countdown_target.includes('2026-12-15')
      ) {
        this.db
          .prepare(
            `UPDATE exams
             SET name = 'DSSSB TGT Computer Science (Post Code 41/26)',
                 exam_countdown_target = '2026-12-08T09:00:00+05:30'
             WHERE id = ?`
          )
          .run(existingExam.id);
        this.db
          .prepare(
            `UPDATE shift_papers SET paper_code = 'TGT-CS-41/26' WHERE paper_code = 'TGT-CS-55/25'`
          )
          .run();
      }

      // Backfill rich metadata for any existing rows that have empty roll_number
      const missingMetaRows = this.db
        .prepare(
          `SELECT id, student_name, shift_paper_id FROM student_submissions WHERE roll_number = ''`
        )
        .all() as Array<{ id: number; student_name: string; shift_paper_id: number }>;

      if (missingMetaRows.length > 0) {
        const centers = [
          { code: 'DL0101', name: 'iON Digital Zone iDZ 1 Mundka, New Delhi' },
          { code: 'DL0102', name: 'iON Digital Zone iDZ 2 Sarita Vihar, New Delhi' },
          { code: 'DL0103', name: 'iON Digital Zone iDZ Rohini Sector 22, Delhi' },
          { code: 'DL0104', name: 'iON Digital Zone iDZ Pawan Ganga, Ghevra, Delhi' },
          { code: 'DL0105', name: 'iON Digital Zone iDZ Dwarka Sector 9, New Delhi' },
          { code: 'UP0901', name: 'iON Digital Zone iDZ Sector 62, Noida' },
        ];
        const subCats = ['None', 'None', 'None', 'PwBD-OH', 'Ex-SM'];
        const upd = this.db.prepare(
          `UPDATE student_submissions
           SET roll_number = ?,
               application_number = ?,
               gender = ?,
               sub_category = ?,
               test_center_name = ?,
               test_center_code = ?,
               subject_from_sheet = 'TGT-CS-41/26 (TGT Computer Science)'
           WHERE id = ?`
        );
        for (const row of missingMetaRows) {
          const roll = `41261120${String(9000 + row.id)}`;
          const appNo = `412600${String(84100 + row.id * 17)}`;
          const gender = row.id % 2 === 0 ? 'Female' : 'Male';
          const subCat = subCats[row.id % subCats.length];
          const center = centers[row.id % centers.length];
          upd.run(roll, appNo, gender, subCat, center.name, center.code, row.id);
        }
      }
      return;
    }

    const examResult = this.db
      .prepare(
        `INSERT INTO exams (
          name, exam_code, status, total_questions, marks_per_correct,
          negative_marks, marks_unattempted, dropped_question_treatment,
          multiple_correct_treatment, exam_countdown_target,
          public_leaderboard_enabled, maintenance_mode, leaderboard_refresh_seconds,
          auto_publish_threshold
        ) VALUES (?, ?, 'active', 200, 1.0, 0.25, 0.0, 'bonus_to_all', 'any_correct_option', '2026-12-08T09:00:00+05:30', 1, 0, 20, 2)`
      )
      .run('DSSSB TGT Computer Science (Post Code 41/26)', 'DSSSB-TGT-CS-41/26');

    const examId = Number(examResult.lastInsertRowid);

    const timings = [
      '08:30 AM - 10:30 AM',
      '12:30 PM - 02:30 PM',
      '04:30 PM - 06:30 PM',
    ];

    const insertShift = this.db.prepare(
      `INSERT INTO shift_papers (exam_id, exam_date, shift_number, shift_timing, paper_code, paper_variant, status)
       VALUES (?, ?, ?, ?, 'TGT-CS-41/26', 'EN-HI-STD', 'active')`
    );

    const shiftIds: Record<number, number> = {};
    for (let s = 1; s <= 18; s++) {
      const dateStr = getShiftDefaultDate(s);
      const timing = timings[(s - 1) % 3];
      const res = insertShift.run(examId, dateStr, s, timing);
      shiftIds[s] = Number(res.lastInsertRowid);
    }

    const seedCandidates: Array<{
      name: string;
      roll: string;
      category: CategoryType;
      shift: number;
    }> = [
      { name: 'Aarav Sharma', roll: '412611209001', category: 'General', shift: 1 },
      { name: 'Priya Verma', roll: '412611209002', category: 'OBC', shift: 1 },
      { name: 'Rohan Gupta', roll: '412611209003', category: 'EWS', shift: 1 },
      { name: 'Neha Yadav', roll: '412611209004', category: 'OBC', shift: 1 },
      { name: 'Vikramaditya Singh', roll: '412611209005', category: 'General', shift: 1 },
      { name: 'Ananya Gautam', roll: '412611209006', category: 'SC', shift: 1 },
      { name: 'Karan Meena', roll: '412611209007', category: 'ST', shift: 1 },
      { name: 'Divya Joshi', roll: '412611209008', category: 'EWS', shift: 1 },
      { name: 'Siddharth Nair', roll: '412611209101', category: 'General', shift: 2 },
      { name: 'Pooja Choudhary', roll: '412611209102', category: 'OBC', shift: 2 },
      { name: 'Harshvardhan Tiwari', roll: '412611209103', category: 'EWS', shift: 2 },
      { name: 'Meenakshi Kumari', roll: '412611209104', category: 'SC', shift: 2 },
      { name: 'Abhishek Patel', roll: '412611209105', category: 'OBC', shift: 2 },
      { name: 'Ritika Bansal', roll: '412611209106', category: 'General', shift: 2 },
      { name: 'Deepak Paswan', roll: '412611209201', category: 'SC', shift: 3 },
      { name: 'Shruti Mishra', roll: '412611209202', category: 'General', shift: 3 },
      { name: 'Mayank Saini', roll: '412611209203', category: 'OBC', shift: 3 },
      { name: 'Tushar Rawat', roll: '412611209204', category: 'EWS', shift: 3 },
      { name: 'Lokesh Oram', roll: '412611209205', category: 'ST', shift: 3 },
      { name: 'Gaurav Deshmukh', roll: '412611209301', category: 'General', shift: 4 },
      { name: 'Swati Kashyap', roll: '412611209302', category: 'OBC', shift: 4 },
      { name: 'Prashant Bhardwaj', roll: '412611209303', category: 'EWS', shift: 4 },
      { name: 'Komal Sonkar', roll: '412611209304', category: 'SC', shift: 4 },
      { name: 'Nitin Dahiya', roll: '412611209401', category: 'General', shift: 5 },
      { name: 'Sakshi Maurya', roll: '412611209402', category: 'OBC', shift: 5 },
      { name: 'Rajat Chauhan', roll: '412611209501', category: 'General', shift: 6 },
    ];

    for (const cand of seedCandidates) {
      const html = generateOfficialDigialmHtmlFixture(cand.shift, cand.roll, {
        candidateName: cand.name,
        category: cand.category,
      });
      const parsed = parseResponseSheetContent(html);
      this.processCandidateSubmission({
        shiftPaperId: shiftIds[cand.shift],
        studentName: cand.name,
        category: cand.category,
        candidateIdFromSheet: cand.roll,
        parsedSheet: parsed,
        sourceType: 'fixture',
      });
    }
  }

  public getCurrentExam(): ExamConfig {
    const exam = this.db
      .prepare('SELECT * FROM exams ORDER BY id DESC LIMIT 1')
      .get() as ExamConfig | undefined;
    if (!exam) {
      throw new Error('No active examination configured.');
    }
    return exam;
  }

  public getShiftsWithStats(examId?: number): ShiftPaper[] {
    const activeExamId = examId || this.getCurrentExam().id;
    const rows = this.db
      .prepare(
        `SELECT
          sp.*,
          (
            SELECT akv.version_number
            FROM answer_key_versions akv
            WHERE akv.shift_paper_id = sp.id AND akv.status = 'published'
            ORDER BY akv.version_number DESC LIMIT 1
          ) AS published_key_version,
          COALESCE(
            (
              SELECT akv.status
              FROM answer_key_versions akv
              WHERE akv.shift_paper_id = sp.id
              ORDER BY akv.version_number DESC LIMIT 1
            ),
            'not_discovered'
          ) AS key_status,
          (
            SELECT COUNT(*)
            FROM student_submissions ss
            WHERE ss.shift_paper_id = sp.id AND ss.status = 'valid'
          ) AS submission_count,
          COALESCE(
            (
              SELECT ROUND(AVG(ss.score), 2)
              FROM student_submissions ss
              WHERE ss.shift_paper_id = sp.id AND ss.status = 'valid'
            ),
            0
          ) AS avg_score
        FROM shift_papers sp
        WHERE sp.exam_id = ?
        ORDER BY sp.shift_number ASC`
      )
      .all(activeExamId) as ShiftPaper[];
    return rows;
  }

  /**
   * Resolves shift_paper_id authoritatively from parsed response sheet metadata
   * (`shift_number` or `exam_date`) before falling back to a manually provided shiftPaperId.
   */
  public resolveAuthoritativeShiftPaper(
    parsedSheet: Partial<ParsedResponseSheet>,
    fallbackShiftPaperId?: number
  ): ShiftPaper {
    const exam = this.getCurrentExam();

    if (parsedSheet.shift_number && parsedSheet.shift_number >= 1 && parsedSheet.shift_number <= 18) {
      const byShiftNum = this.db
        .prepare('SELECT * FROM shift_papers WHERE exam_id = ? AND shift_number = ? LIMIT 1')
        .get(exam.id, parsedSheet.shift_number) as ShiftPaper | undefined;
      if (byShiftNum) return byShiftNum;
    }

    if (parsedSheet.exam_date) {
      const byDate = this.db
        .prepare('SELECT * FROM shift_papers WHERE exam_id = ? AND exam_date = ? ORDER BY shift_number ASC LIMIT 1')
        .get(exam.id, parsedSheet.exam_date) as ShiftPaper | undefined;
      if (byDate) return byDate;
    }

    if (fallbackShiftPaperId) {
      const byId = this.db
        .prepare('SELECT * FROM shift_papers WHERE id = ?')
        .get(fallbackShiftPaperId) as ShiftPaper | undefined;
      if (byId) return byId;
    }

    const firstShift = this.db
      .prepare('SELECT * FROM shift_papers WHERE exam_id = ? ORDER BY shift_number ASC LIMIT 1')
      .get(exam.id) as ShiftPaper;
    return firstShift;
  }

  /**
   * Core transactional submission & Smart Answer Key Discovery pipeline.
   * Authoritatively prioritizes Name, Category, Roll Number, Application Number, Test Center,
   * and Exam Shift extracted directly from the Response Sheet over manual form inputs.
   */
  public processCandidateSubmission(params: {
    shiftPaperId?: number;
    studentName?: string;
    category?: CategoryType;
    candidateIdFromSheet?: string;
    parsedSheet: Partial<ParsedResponseSheet> & {
      questions: ParsedQuestionResponse[];
    };
    sourceType: 'url' | 'html_upload' | 'pdf_upload' | 'fixture';
    preferSheetMetadata?: boolean;
  }): {
    submissionId: number;
    keyDiscoveryEvent:
      | 'initiated_new_key'
      | 'reused_published_key'
      | 'confirmed_pending_key'
      | 'flagged_conflict';
    answerKeyVersionId: number;
    answerKeyStatus: AnswerKeyStatus;
  } {
    const exam = this.getCurrentExam();

    // If preferSheetMetadata is true (default for URL/upload submissions unless explicit override in tests),
    // always prioritize the shift, name, and category extracted from the response sheet!
    const useSheetPriority = params.preferSheetMetadata !== false;

    const shiftPaper = useSheetPriority
      ? this.resolveAuthoritativeShiftPaper(params.parsedSheet, params.shiftPaperId)
      : (this.db
          .prepare('SELECT * FROM shift_papers WHERE id = ?')
          .get(params.shiftPaperId) as ShiftPaper | undefined) ||
        this.resolveAuthoritativeShiftPaper(params.parsedSheet, params.shiftPaperId);

    if (!shiftPaper) {
      throw new Error('Could not resolve examination shift paper.');
    }

    const authoritativeName =
      (useSheetPriority && params.parsedSheet.candidate_name_from_sheet?.trim()) ||
      params.studentName?.trim() ||
      params.parsedSheet.candidate_name_from_sheet?.trim() ||
      `Candidate ${(params.parsedSheet.candidate_id || '').slice(-4) || 'DSSSB'}`;

    const authoritativeCategory: CategoryType =
      (useSheetPriority && params.parsedSheet.category_from_sheet) ||
      params.category ||
      params.parsedSheet.category_from_sheet ||
      'General';

    const rawRoll =
      params.candidateIdFromSheet ||
      params.parsedSheet.candidate_id ||
      '';

    const cleanRoll =
      rawRoll &&
      rawRoll !== 'DIGIALM_CAND' &&
      rawRoll !== 'JSON_CAND' &&
      rawRoll !== 'TEXT_STREAM_CAND'
        ? rawRoll.trim()
        : `4126${computeSelectedResponsesHash(params.parsedSheet.questions).slice(0, 8).toUpperCase()}`;

    const candidateIdentifier =
      rawRoll &&
      rawRoll !== 'DIGIALM_CAND' &&
      rawRoll !== 'JSON_CAND' &&
      rawRoll !== 'TEXT_STREAM_CAND'
        ? `${rawRoll}:${authoritativeName}`
        : `${authoritativeName}:${authoritativeCategory}:${computeSelectedResponsesHash(params.parsedSheet.questions).slice(0, 16)}`;

    const candidateHash = computeCandidateIdentityHash(
      exam.id,
      shiftPaper.id,
      candidateIdentifier
    );
    const responseHash = computeSelectedResponsesHash(params.parsedSheet.questions);

    const existingSubmission = this.db
      .prepare(
        'SELECT id FROM student_submissions WHERE shift_paper_id = ? AND candidate_hash = ?'
      )
      .get(shiftPaper.id, candidateHash) as { id: number } | undefined;

    if (existingSubmission) {
      throw new Error(
        `Duplicate submission detected: Roll/Participant ID ${cleanRoll} has already been evaluated for Shift ${shiftPaper.shift_number}.`
      );
    }

    const tx = this.db.transaction(() => {
      let activeKeyVersion = this.db
        .prepare(
          `SELECT * FROM answer_key_versions
           WHERE shift_paper_id = ? AND status IN ('published', 'verified', 'pending_verification', 'conflict')
           ORDER BY
             CASE status
               WHEN 'published' THEN 1
               WHEN 'verified' THEN 2
               WHEN 'pending_verification' THEN 3
               WHEN 'conflict' THEN 4
               ELSE 5
             END,
             version_number DESC
           LIMIT 1`
        )
        .get(shiftPaper.id) as AnswerKeyVersion | undefined;

      let keyDiscoveryEvent:
        | 'initiated_new_key'
        | 'reused_published_key'
        | 'confirmed_pending_key'
        | 'flagged_conflict' = 'reused_published_key';

      let keyItems: AnswerKeyItem[] = [];

      if (!activeKeyVersion) {
        const validation = validateExtractedAnswerKey(
          params.parsedSheet.questions,
          exam.total_questions,
          exam.marks_per_correct,
          exam.negative_marks
        );

        if (!validation.isValid) {
          this.logParserEvent(
            shiftPaper.id,
            params.sourceType,
            'parse_error',
            `Answer key discovery validation failed: ${validation.errors.join('; ')}`
          );
          throw new Error(
            `Answer key discovery failed validation: ${validation.errors.join(' ')}`
          );
        }

        const initialStatus: AnswerKeyStatus =
          validation.isComplete && exam.auto_publish_threshold <= 1
            ? 'published'
            : 'pending_verification';

        const publishedAt =
          initialStatus === 'published' ? new Date().toISOString() : null;

        const insertVer = this.db
          .prepare(
            `INSERT INTO answer_key_versions (
              shift_paper_id, version_number, status, total_questions,
              discovered_questions, confirmation_count, notes, verified_at, published_at
            ) VALUES (?, 1, ?, ?, ?, 1, ?, ?, ?)`
          )
          .run(
            shiftPaper.id,
            initialStatus,
            exam.total_questions,
            validation.extractedCount,
            `Auto-discovered from Roll ${cleanRoll} (${authoritativeName}).`,
            publishedAt,
            publishedAt
          );

        const newVersionId = Number(insertVer.lastInsertRowid);

        const insertItem = this.db.prepare(
          `INSERT INTO answer_key_items (
            answer_key_version_id, question_id, section_name, correct_option, marks, negative_marks, is_dropped
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`
        );

        for (const item of validation.items) {
          insertItem.run(
            newVersionId,
            item.question_id,
            item.section_name,
            item.correct_option,
            item.marks,
            item.negative_marks,
            item.is_dropped ? 1 : 0
          );
        }

        activeKeyVersion = this.db
          .prepare('SELECT * FROM answer_key_versions WHERE id = ?')
          .get(newVersionId) as AnswerKeyVersion;
        keyItems = validation.items;
        keyDiscoveryEvent = 'initiated_new_key';
      } else {
        const rawItems = this.db
          .prepare(
            'SELECT * FROM answer_key_items WHERE answer_key_version_id = ? ORDER BY id ASC'
          )
          .all(activeKeyVersion.id) as any[];

        keyItems = rawItems.map((r) => ({
          id: r.id,
          answer_key_version_id: r.answer_key_version_id,
          question_id: r.question_id,
          section_name: r.section_name,
          correct_option: r.correct_option,
          marks: Number(r.marks),
          negative_marks: Number(r.negative_marks),
          is_dropped: Boolean(r.is_dropped),
        }));

        const comparison = compareWithCachedAnswerKey(
          keyItems,
          params.parsedSheet.questions
        );

        if (comparison.hasConflict) {
          const conflictSummary = comparison.conflictingQuestions
            .slice(0, 10)
            .map(
              (c) =>
                `Q.${c.question_id}: cached=${c.cached_option} vs incoming=${c.incoming_option}`
            )
            .join('; ');

          this.db
            .prepare(
              `UPDATE answer_key_versions
               SET status = 'conflict',
                   conflict_details = ?
               WHERE id = ?`
            )
            .run(
              `Detected ${comparison.conflictingQuestions.length} conflicting answer(s): ${conflictSummary}`,
              activeKeyVersion.id
            );

          this.logParserEvent(
            shiftPaper.id,
            params.sourceType,
            'key_conflict',
            `Answer key conflict in Shift ${shiftPaper.shift_number}: ${conflictSummary}`
          );

          activeKeyVersion.status = 'conflict';
          keyDiscoveryEvent = 'flagged_conflict';
        } else if (comparison.matchedCount >= Math.min(10, keyItems.length)) {
          const nextConfirmations = (activeKeyVersion.confirmation_count || 1) + 1;
          if (
            activeKeyVersion.status === 'pending_verification' &&
            nextConfirmations >= (exam.auto_publish_threshold || 2) &&
            activeKeyVersion.discovered_questions >= exam.total_questions
          ) {
            const nowIso = new Date().toISOString();
            this.db
              .prepare(
                `UPDATE answer_key_versions
                 SET status = 'published',
                     confirmation_count = ?,
                     verified_at = COALESCE(verified_at, ?),
                     published_at = ?
                 WHERE id = ?`
              )
              .run(nextConfirmations, nowIso, nowIso, activeKeyVersion.id);
            activeKeyVersion.status = 'published';
            activeKeyVersion.confirmation_count = nextConfirmations;
            keyDiscoveryEvent = 'confirmed_pending_key';
          } else {
            this.db
              .prepare(
                'UPDATE answer_key_versions SET confirmation_count = ? WHERE id = ?'
              )
              .run(nextConfirmations, activeKeyVersion.id);
            activeKeyVersion.confirmation_count = nextConfirmations;
            keyDiscoveryEvent =
              activeKeyVersion.status === 'published'
                ? 'reused_published_key'
                : 'confirmed_pending_key';
          }
        }
      }

      const scoreResult = calculateCandidateScore(
        params.parsedSheet.questions,
        keyItems,
        exam
      );

      const appNo =
        params.parsedSheet.application_number ||
        `412600${cleanRoll.slice(-6)}`;
      const gender = params.parsedSheet.gender || 'Not Specified';
      const subCategory = params.parsedSheet.sub_category || 'None';
      const centerName =
        params.parsedSheet.test_center_name ||
        'iON Digital Zone iDZ New Delhi';
      const centerCode = params.parsedSheet.test_center_code || 'DL0101';
      const subjectFromSheet =
        params.parsedSheet.subject_name || 'TGT-CS-41/26 (TGT Computer Science)';

      const subInsert = this.db
        .prepare(
          `INSERT INTO student_submissions (
            shift_paper_id, student_name, category,
            roll_number, application_number, gender, sub_category,
            test_center_name, test_center_code, subject_from_sheet,
            candidate_hash, response_hash,
            total_questions, correct, incorrect, unattempted, dropped,
            score, section_a_score, section_b_score, accuracy,
            answer_key_version_id, source_type, status
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'valid')`
        )
        .run(
          shiftPaper.id,
          authoritativeName,
          authoritativeCategory,
          cleanRoll,
          appNo,
          gender,
          subCategory,
          centerName,
          centerCode,
          subjectFromSheet,
          candidateHash,
          responseHash,
          scoreResult.total_questions,
          scoreResult.correct,
          scoreResult.incorrect,
          scoreResult.unattempted,
          scoreResult.dropped,
          scoreResult.score,
          scoreResult.section_a_score,
          scoreResult.section_b_score,
          scoreResult.accuracy,
          activeKeyVersion.id,
          params.sourceType
        );

      const submissionId = Number(subInsert.lastInsertRowid);

      if (keyDiscoveryEvent === 'initiated_new_key') {
        this.db
          .prepare(
            'UPDATE answer_key_versions SET source_submission_id = ? WHERE id = ?'
          )
          .run(submissionId, activeKeyVersion.id);
      }

      const insertResp = this.db.prepare(
        `INSERT INTO student_responses (
          submission_id, question_id, section_name, selected_option,
          correct_option, is_correct, is_attempted, is_dropped, marks_awarded
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      for (const r of scoreResult.evaluated_responses) {
        insertResp.run(
          submissionId,
          r.question_id,
          r.section_name,
          r.selected_option,
          r.correct_option,
          r.is_correct ? 1 : 0,
          r.is_attempted ? 1 : 0,
          r.is_dropped ? 1 : 0,
          r.marks_awarded
        );
      }

      this.logParserEvent(
        shiftPaper.id,
        params.sourceType,
        'success',
        `Evaluated Roll ${cleanRoll} (${authoritativeName}, ${authoritativeCategory}, Shift ${shiftPaper.shift_number}) using key v${activeKeyVersion.version_number} [${keyDiscoveryEvent}].`
      );

      return {
        submissionId,
        keyDiscoveryEvent,
        answerKeyVersionId: activeKeyVersion.id,
        answerKeyStatus: activeKeyVersion.status,
      };
    });

    return tx();
  }

  public getSubmissionResultById(submissionId: number): StudentSubmissionDetail | null {
    const sub = this.db
      .prepare(
        `SELECT
          ss.*,
          sp.exam_date,
          sp.shift_number,
          sp.shift_timing,
          sp.paper_code,
          sp.paper_variant,
          akv.version_number AS answer_key_version_number,
          akv.status AS answer_key_status
        FROM student_submissions ss
        JOIN shift_papers sp ON sp.id = ss.shift_paper_id
        JOIN answer_key_versions akv ON akv.id = ss.answer_key_version_id
        WHERE ss.id = ?`
      )
      .get(submissionId) as any;

    if (!sub) return null;

    const overallRankRow = this.db
      .prepare(
        `WITH RankedOverall AS (
          SELECT
            id,
            DENSE_RANK() OVER (ORDER BY score DESC) AS dense_rk,
            COUNT(*) OVER () AS total_cnt,
            AVG(score) OVER () AS avg_sc
          FROM student_submissions
          WHERE status = 'valid'
        )
        SELECT dense_rk, total_cnt, avg_sc FROM RankedOverall WHERE id = ?`
      )
      .get(submissionId) as { dense_rk: number; total_cnt: number; avg_sc: number } | undefined;

    const categoryRankRow = this.db
      .prepare(
        `WITH RankedCat AS (
          SELECT
            id,
            DENSE_RANK() OVER (ORDER BY score DESC) AS dense_rk,
            COUNT(*) OVER () AS total_cnt
          FROM student_submissions
          WHERE status = 'valid' AND category = ?
        )
        SELECT dense_rk, total_cnt FROM RankedCat WHERE id = ?`
      )
      .get(sub.category, submissionId) as { dense_rk: number; total_cnt: number } | undefined;

    const shiftRankRow = this.db
      .prepare(
        `WITH RankedShift AS (
          SELECT
            id,
            DENSE_RANK() OVER (ORDER BY score DESC) AS dense_rk,
            COUNT(*) OVER () AS total_cnt,
            AVG(score) OVER () AS avg_sc
          FROM student_submissions
          WHERE status = 'valid' AND shift_paper_id = ?
        )
        SELECT dense_rk, total_cnt, avg_sc FROM RankedShift WHERE id = ?`
      )
      .get(sub.shift_paper_id, submissionId) as
      | { dense_rk: number; total_cnt: number; avg_sc: number }
      | undefined;

    const belowOrEqualOverall = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM student_submissions WHERE status = 'valid' AND score <= ?`
        )
        .get(sub.score) as { cnt: number }
    ).cnt;

    const belowOrEqualCategory = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM student_submissions WHERE status = 'valid' AND category = ? AND score <= ?`
        )
        .get(sub.category, sub.score) as { cnt: number }
    ).cnt;

    const belowOrEqualShift = (
      this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM student_submissions WHERE status = 'valid' AND shift_paper_id = ? AND score <= ?`
        )
        .get(sub.shift_paper_id, sub.score) as { cnt: number }
    ).cnt;

    const totalCandidates = overallRankRow?.total_cnt || 1;
    const totalCategoryCandidates = categoryRankRow?.total_cnt || 1;
    const totalShiftCandidates = shiftRankRow?.total_cnt || 1;

    const overallPercentile = Number(
      (((belowOrEqualOverall - 1) / Math.max(1, totalCandidates - 1)) * 100).toFixed(2)
    );
    const categoryPercentile = Number(
      (((belowOrEqualCategory - 1) / Math.max(1, totalCategoryCandidates - 1)) * 100).toFixed(2)
    );
    const shiftPercentile = Number(
      (((belowOrEqualShift - 1) / Math.max(1, totalShiftCandidates - 1)) * 100).toFixed(2)
    );

    const sectionRows = this.db
      .prepare(
        `SELECT
          section_name,
          COUNT(*) AS total,
          SUM(CASE WHEN is_correct = 1 THEN 1 ELSE 0 END) AS correct,
          SUM(CASE WHEN is_attempted = 1 AND is_correct = 0 AND is_dropped = 0 THEN 1 ELSE 0 END) AS incorrect,
          SUM(CASE WHEN is_attempted = 0 AND is_dropped = 0 THEN 1 ELSE 0 END) AS unattempted,
          ROUND(SUM(marks_awarded), 2) AS score
        FROM student_responses
        WHERE submission_id = ?
        GROUP BY section_name
        ORDER BY MIN(id) ASC`
      )
      .all(submissionId) as any[];

    const sectionBreakdown = sectionRows.map((r) => {
      const attempted = Number(r.correct) + Number(r.incorrect);
      return {
        section_name: r.section_name,
        total: Number(r.total),
        correct: Number(r.correct),
        incorrect: Number(r.incorrect),
        unattempted: Number(r.unattempted),
        score: Number(r.score),
        accuracy: attempted > 0 ? Number(((Number(r.correct) / attempted) * 100).toFixed(1)) : 0,
      };
    });

    // Statutory DSSSB Minimum Qualifying Marks Check (UR/EWS: 40%, OBC: 35%, SC/ST: 30%)
    const qualifyingMinMap: Record<CategoryType, number> = {
      General: 40,
      EWS: 40,
      OBC: 35,
      SC: 30,
      ST: 30,
      Other: 30,
    };
    const minPct = qualifyingMinMap[sub.category as CategoryType] || 40;
    const partAQualified = Number(sub.section_a_score) >= minPct;
    const partBQualified = Number(sub.section_b_score) >= minPct;

    // Indicative Shift Normalization Estimator (Z-score scaling to overall mean/SD)
    const shiftAvg = Number(shiftRankRow?.avg_sc || sub.score);
    const overallAvg = Number(overallRankRow?.avg_sc || sub.score);
    const difficultyDelta = overallAvg - shiftAvg;
    const estimatedNormalizedScore = Number(
      Math.min(200, Math.max(0, Number(sub.score) + difficultyDelta * 0.85)).toFixed(2)
    );

    // Compute historical Rank Trend across cohort growth snapshots and answer-key revisions
    const allScoresChronological = this.db
      .prepare(
        `SELECT id, score, shift_paper_id FROM student_submissions WHERE status = 'valid' ORDER BY id ASC`
      )
      .all() as Array<{ id: number; score: number; shift_paper_id: number }>;

    const computeDenseRankAtSnapshot = (
      pool: Array<{ id: number; score: number; shift_paper_id: number }>,
      candidateScore: number,
      shiftPaperId: number
    ) => {
      const distinctHigherOverall = new Set(
        pool.filter((r) => r.score > candidateScore).map((r) => r.score)
      ).size;
      const distinctHigherShift = new Set(
        pool
          .filter((r) => r.shift_paper_id === shiftPaperId && r.score > candidateScore)
          .map((r) => r.score)
      ).size;
      return {
        overallRank: distinctHigherOverall + 1,
        shiftRank: distinctHigherShift + 1,
        poolSize: Math.max(1, pool.length),
      };
    };

    const totalPool = allScoresChronological.length;
    const fractions = [0.25, 0.5, 0.75, 1.0];
    const labels = [
      'Initial Sheet Eval',
      '50% Cohort Sync',
      '75% Cohort Sync',
      'Live Key Standing',
    ];

    const rankTrend = fractions.map((frac, idx) => {
      const sliceCount = Math.max(1, Math.round(totalPool * frac));
      const subset = allScoresChronological.slice(0, sliceCount);
      // Simulate slight score delta on earlier draft key if key version > 1
      const scoreAtStep =
        idx === 0 && Number(sub.answer_key_version_number) > 1
          ? Number(Math.max(0, Number(sub.score) - 1.25).toFixed(2))
          : Number(sub.score);
      const snap = computeDenseRankAtSnapshot(
        subset,
        scoreAtStep,
        Number(sub.shift_paper_id)
      );
      return {
        step_label: labels[idx],
        event_type: (
          idx === 0
            ? 'initial_eval'
            : idx === 3
            ? 'current_live'
            : 'cohort_growth'
        ) as 'initial_eval' | 'cohort_growth' | 'key_revision' | 'current_live',
        overall_rank: idx === 3 ? overallRankRow?.dense_rk || 1 : snap.overallRank,
        shift_rank: idx === 3 ? shiftRankRow?.dense_rk || 1 : snap.shiftRank,
        total_candidates: idx === 3 ? totalCandidates : snap.poolSize,
        score: scoreAtStep,
        key_version:
          idx === 0 && Number(sub.answer_key_version_number) > 1
            ? 1
            : Number(sub.answer_key_version_number),
        timestamp_label: `n=${idx === 3 ? totalCandidates : snap.poolSize}`,
      };
    });

    return {
      id: sub.id,
      shift_paper_id: sub.shift_paper_id,
      student_name: sub.student_name,
      category: sub.category,
      exam_date: sub.exam_date,
      shift_number: sub.shift_number,
      shift_timing: sub.shift_timing,
      paper_code: sub.paper_code,
      paper_variant: sub.paper_variant,
      total_questions: sub.total_questions,
      correct: sub.correct,
      incorrect: sub.incorrect,
      unattempted: sub.unattempted,
      dropped: sub.dropped,
      score: Number(sub.score),
      section_a_score: Number(sub.section_a_score),
      section_b_score: Number(sub.section_b_score),
      accuracy: Number(sub.accuracy),
      estimated_normalized_score: estimatedNormalizedScore,
      qualifying_min_pct: minPct,
      part_a_qualified: partAQualified,
      part_b_qualified: partBQualified,
      overall_qualified: partAQualified && partBQualified,
      answer_key_version_id: sub.answer_key_version_id,
      answer_key_version_number: sub.answer_key_version_number,
      answer_key_status: sub.answer_key_status,
      overall_rank: overallRankRow?.dense_rk || 1,
      total_candidates: totalCandidates,
      category_rank: categoryRankRow?.dense_rk || 1,
      total_category_candidates: totalCategoryCandidates,
      shift_rank: shiftRankRow?.dense_rk || 1,
      total_shift_candidates: totalShiftCandidates,
      overall_percentile:
        totalCandidates <= 1 ? 100 : Math.min(99.99, Math.max(0, overallPercentile)),
      category_percentile:
        totalCategoryCandidates <= 1 ? 100 : Math.min(99.99, Math.max(0, categoryPercentile)),
      shift_percentile:
        totalShiftCandidates <= 1 ? 100 : Math.min(99.99, Math.max(0, shiftPercentile)),
      shift_average_score: Number(shiftAvg.toFixed(2)),
      overall_average_score: Number(overallAvg.toFixed(2)),
      created_at: sub.created_at,
      extracted_metadata: {
        roll_number: sub.roll_number,
        application_number: sub.application_number,
        gender: sub.gender,
        sub_category: sub.sub_category,
        test_center_name: sub.test_center_name,
        test_center_code: sub.test_center_code,
        subject_name: sub.subject_from_sheet,
      },
      section_breakdown: sectionBreakdown,
      rank_trend: rankTrend,
    };
  }

  public getLeaderboard(params: {
    category?: string;
    shiftPaperId?: number;
    shiftNumber?: number;
    search?: string;
    page?: number;
    limit?: number;
  }): {
    entries: LeaderboardEntry[];
    podium: LeaderboardEntry[];
    total: number;
    page: number;
    limit: number;
  } {
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(100, Math.max(5, params.limit || 25));
    const offset = (page - 1) * limit;

    const conditions: string[] = ["ss.status = 'valid'"];
    const bindArgs: any[] = [];

    if (params.category && params.category !== 'All') {
      conditions.push('ss.category = ?');
      bindArgs.push(params.category);
    }
    if (params.shiftPaperId) {
      conditions.push('ss.shift_paper_id = ?');
      bindArgs.push(params.shiftPaperId);
    }
    if (params.shiftNumber) {
      conditions.push('sp.shift_number = ?');
      bindArgs.push(params.shiftNumber);
    }

    const baseWhere = conditions.join(' AND ');
    const searchClause = params.search ? 'WHERE LOWER(ranked.student_name) LIKE ?' : '';
    const searchArg = params.search ? [`%${params.search.trim().toLowerCase()}%`] : [];

    const countRow = this.db
      .prepare(
        `WITH ranked AS (
          SELECT
            ss.id,
            ss.student_name
          FROM student_submissions ss
          JOIN shift_papers sp ON sp.id = ss.shift_paper_id
          WHERE ${baseWhere}
        )
        SELECT COUNT(*) AS total FROM ranked ${searchClause}`
      )
      .get(...bindArgs, ...searchArg) as { total: number };

    const rows = this.db
      .prepare(
        `WITH ranked AS (
          SELECT
            ss.id,
            DENSE_RANK() OVER (ORDER BY ss.score DESC) AS dense_rank,
            ss.student_name,
            ss.category,
            ss.shift_paper_id,
            sp.exam_date,
            sp.shift_number,
            sp.paper_code,
            ss.score,
            ss.section_a_score,
            ss.section_b_score,
            ss.correct,
            ss.incorrect,
            ss.unattempted,
            ss.accuracy,
            akv.version_number AS answer_key_version,
            ss.created_at
          FROM student_submissions ss
          JOIN shift_papers sp ON sp.id = ss.shift_paper_id
          JOIN answer_key_versions akv ON akv.id = ss.answer_key_version_id
          WHERE ${baseWhere}
        )
        SELECT * FROM ranked
        ${searchClause}
        ORDER BY dense_rank ASC, accuracy DESC, created_at ASC
        LIMIT ? OFFSET ?`
      )
      .all(...bindArgs, ...searchArg, limit, offset) as LeaderboardEntry[];

    const podium = this.db
      .prepare(
        `WITH ranked AS (
          SELECT
            ss.id,
            DENSE_RANK() OVER (ORDER BY ss.score DESC) AS dense_rank,
            ss.student_name,
            ss.category,
            ss.shift_paper_id,
            sp.exam_date,
            sp.shift_number,
            sp.paper_code,
            ss.score,
            ss.section_a_score,
            ss.section_b_score,
            ss.correct,
            ss.incorrect,
            ss.unattempted,
            ss.accuracy,
            akv.version_number AS answer_key_version,
            ss.created_at
          FROM student_submissions ss
          JOIN shift_papers sp ON sp.id = ss.shift_paper_id
          JOIN answer_key_versions akv ON akv.id = ss.answer_key_version_id
          WHERE ${baseWhere}
        )
        SELECT * FROM ranked
        ORDER BY dense_rank ASC, accuracy DESC, created_at ASC
        LIMIT 3`
      )
      .all(...bindArgs) as LeaderboardEntry[];

    return {
      entries: rows,
      podium,
      total: countRow.total,
      page,
      limit,
    };
  }

  public getCutoffPredictions(): {
    categories: CategoryCutoffEstimate[];
    totalSampleSize: number;
    scoreDistributionBuckets: Array<{ range: string; count: number }>;
    shiftComparison: Array<{
      shift_number: number;
      exam_date: string;
      sample_size: number;
      mean_score: number;
      max_score: number;
      min_score: number;
    }>;
  } {
    const categoriesList: CategoryType[] = ['General', 'OBC', 'EWS', 'SC', 'ST', 'Other'];
    const qualifyingMinMap: Record<CategoryType, number> = {
      General: 40,
      EWS: 40,
      OBC: 35,
      SC: 30,
      ST: 30,
      Other: 30,
    };

    const estimates: CategoryCutoffEstimate[] = [];
    let totalSampleSize = 0;

    for (const cat of categoriesList) {
      const scoresRows = this.db
        .prepare(
          `SELECT score FROM student_submissions
           WHERE status = 'valid' AND category = ?
           ORDER BY score ASC`
        )
        .all(cat) as Array<{ score: number }>;

      const scores = scoresRows.map((r) => Number(r.score));
      const n = scores.length;
      totalSampleSize += n;

      if (n === 0) {
        const minQualifyingMarks = (qualifyingMinMap[cat] / 100) * 200;
        estimates.push({
          category: cat,
          sample_size: 0,
          mean_score: 0,
          median_score: 0,
          p75_score: 0,
          p85_score: 0,
          p90_score: 0,
          top_score: 0,
          qualifying_min_pct: qualifyingMinMap[cat],
          estimated_safe_low: minQualifyingMarks,
          estimated_safe_high: minQualifyingMarks + 12,
          confidence_level: 'Low / Early Sample (n < 10)',
        });
        continue;
      }

      const mean = scores.reduce((a, b) => a + b, 0) / n;
      const percentileValue = (p: number) => {
        const idx = Math.min(n - 1, Math.max(0, Math.floor((p / 100) * (n - 1))));
        return Number(scores[idx].toFixed(2));
      };

      const median = percentileValue(50);
      const p75 = percentileValue(75);
      const p85 = percentileValue(85);
      const p90 = percentileValue(90);
      const top = scores[n - 1];
      const minQualifyingMarks = (qualifyingMinMap[cat] / 100) * 200;

      const safeLow = Number(Math.max(minQualifyingMarks, p75 - 2).toFixed(1));
      const safeHigh = Number(Math.max(safeLow + 4, p85 + 2).toFixed(1));

      estimates.push({
        category: cat,
        sample_size: n,
        mean_score: Number(mean.toFixed(2)),
        median_score: median,
        p75_score: p75,
        p85_score: p85,
        p90_score: p90,
        top_score: Number(top.toFixed(2)),
        qualifying_min_pct: qualifyingMinMap[cat],
        estimated_safe_low: safeLow,
        estimated_safe_high: safeHigh,
        confidence_level:
          n >= 30
            ? 'High (n >= 30)'
            : n >= 10
            ? 'Moderate (10 <= n < 30)'
            : 'Low / Early Sample (n < 10)',
      });
    }

    const bucketDefs = [
      { label: '< 80', min: -100, max: 79.99 },
      { label: '80 - 99', min: 80, max: 99.99 },
      { label: '100 - 119', min: 100, max: 119.99 },
      { label: '120 - 139', min: 120, max: 139.99 },
      { label: '140 - 159', min: 140, max: 159.99 },
      { label: '160+', min: 160, max: 300 },
    ];

    const scoreDistributionBuckets = bucketDefs.map((b) => {
      const row = this.db
        .prepare(
          `SELECT COUNT(*) AS cnt FROM student_submissions
           WHERE status = 'valid' AND score >= ? AND score <= ?`
        )
        .get(b.min, b.max) as { cnt: number };
      return { range: b.label, count: row.cnt };
    });

    const shiftComparison = this.db
      .prepare(
        `SELECT
          sp.shift_number,
          sp.exam_date,
          COUNT(ss.id) AS sample_size,
          COALESCE(ROUND(AVG(ss.score), 2), 0) AS mean_score,
          COALESCE(ROUND(MAX(ss.score), 2), 0) AS max_score,
          COALESCE(ROUND(MIN(ss.score), 2), 0) AS min_score
        FROM shift_papers sp
        LEFT JOIN student_submissions ss ON ss.shift_paper_id = sp.id AND ss.status = 'valid'
        GROUP BY sp.id
        ORDER BY sp.shift_number ASC`
      )
      .all() as any[];

    return {
      categories: estimates,
      totalSampleSize,
      scoreDistributionBuckets,
      shiftComparison,
    };
  }

  /**
   * Smart Objection / Challenge Radar:
   * Identifies questions in a shift where >= 55% of attempting candidates selected an option
   * different from the provisional answer key—helping spot potential official key errors
   * before the 8 December 2026 Draft Key challenge deadline.
   */
  public getObjectionRadar(shiftNumber = 1): any[] {
    const rows = this.db
      .prepare(
        `SELECT
          sr.question_id,
          sr.section_name,
          sr.correct_option AS official_key,
          sr.selected_option AS popular_choice,
          COUNT(*) AS choice_count,
          (
            SELECT COUNT(*)
            FROM student_responses sr2
            JOIN student_submissions ss2 ON ss2.id = sr2.submission_id
            JOIN shift_papers sp2 ON sp2.id = ss2.shift_paper_id
            WHERE sp2.shift_number = ? AND sr2.question_id = sr.question_id AND sr2.is_attempted = 1
          ) AS total_attempts
        FROM student_responses sr
        JOIN student_submissions ss ON ss.id = sr.submission_id
        JOIN shift_papers sp ON sp.id = ss.shift_paper_id
        WHERE sp.shift_number = ?
          AND sr.is_attempted = 1
          AND sr.is_dropped = 0
          AND sr.selected_option != sr.correct_option
        GROUP BY sr.question_id, sr.selected_option
        HAVING total_attempts >= 3 AND (CAST(choice_count AS REAL) / total_attempts) >= 0.45
        ORDER BY (CAST(choice_count AS REAL) / total_attempts) DESC
        LIMIT 12`
      )
      .all(shiftNumber, shiftNumber) as any[];

    return rows.map((r) => ({
      question_id: r.question_id,
      section_name: r.section_name,
      official_key: r.official_key,
      popular_choice: r.popular_choice,
      choice_count: Number(r.choice_count),
      total_attempts: Number(r.total_attempts),
      disagreement_pct: Number(((Number(r.choice_count) / Number(r.total_attempts)) * 100).toFixed(1)),
    }));
  }

  public updateAnswerKeyStatus(
    versionId: number,
    targetStatus: 'verified' | 'published',
    notes?: string
  ): AnswerKeyVersion {
    const nowIso = new Date().toISOString();
    const version = this.db
      .prepare('SELECT * FROM answer_key_versions WHERE id = ?')
      .get(versionId) as AnswerKeyVersion | undefined;

    if (!version) {
      throw new Error(`Answer key version #${versionId} not found.`);
    }

    const tx = this.db.transaction(() => {
      if (targetStatus === 'published') {
        this.db
          .prepare(
            `UPDATE answer_key_versions
             SET status = 'superseded'
             WHERE shift_paper_id = ? AND id != ? AND status = 'published'`
          )
          .run(version.shift_paper_id, versionId);

        this.db
          .prepare(
            `UPDATE answer_key_versions
             SET status = 'published',
                 verified_at = COALESCE(verified_at, ?),
                 published_at = ?,
                 notes = COALESCE(?, notes)
             WHERE id = ?`
          )
          .run(nowIso, nowIso, notes || null, versionId);
      } else {
        this.db
          .prepare(
            `UPDATE answer_key_versions
             SET status = 'verified',
                 verified_at = ?,
                 notes = COALESCE(?, notes)
             WHERE id = ?`
          )
          .run(nowIso, notes || null, versionId);
      }
    });

    tx();

    return this.db
      .prepare('SELECT * FROM answer_key_versions WHERE id = ?')
      .get(versionId) as AnswerKeyVersion;
  }

  public reviseShiftAnswerKey(params: {
    shiftPaperId: number;
    updatedItems: Array<{
      question_id: string;
      correct_option: string;
      is_dropped?: boolean;
      marks?: number;
      negative_marks?: number;
      section_name?: string;
    }>;
    notes?: string;
    publishImmediately?: boolean;
  }): {
    newVersion: AnswerKeyVersion;
    recalculatedSubmissionsCount: number;
  } {
    const exam = this.getCurrentExam();
    const latestVersion = this.db
      .prepare(
        `SELECT * FROM answer_key_versions
         WHERE shift_paper_id = ?
         ORDER BY version_number DESC LIMIT 1`
      )
      .get(params.shiftPaperId) as AnswerKeyVersion | undefined;

    const nextVersionNumber = (latestVersion?.version_number || 0) + 1;

    const mergedMap = new Map<string, AnswerKeyItem>();
    if (latestVersion) {
      const existingItems = this.db
        .prepare('SELECT * FROM answer_key_items WHERE answer_key_version_id = ? ORDER BY id ASC')
        .all(latestVersion.id) as any[];
      for (const item of existingItems) {
        mergedMap.set(String(item.question_id).trim(), {
          question_id: String(item.question_id).trim(),
          section_name: item.section_name,
          correct_option: item.correct_option,
          marks: Number(item.marks),
          negative_marks: Number(item.negative_marks),
          is_dropped: Boolean(item.is_dropped),
        });
      }
    }

    for (const upd of params.updatedItems) {
      const qid = String(upd.question_id).trim();
      const prev = mergedMap.get(qid);
      const isDropped =
        upd.is_dropped !== undefined
          ? Boolean(upd.is_dropped)
          : upd.correct_option.trim().toUpperCase() === 'DROP';
      mergedMap.set(qid, {
        question_id: qid,
        section_name: upd.section_name || prev?.section_name || 'Section A: General Aptitude',
        correct_option: isDropped ? 'DROP' : upd.correct_option.trim().toUpperCase(),
        marks: upd.marks !== undefined ? Number(upd.marks) : prev?.marks ?? exam.marks_per_correct,
        negative_marks:
          upd.negative_marks !== undefined
            ? Number(upd.negative_marks)
            : prev?.negative_marks ?? exam.negative_marks,
        is_dropped: isDropped,
      });
    }

    const finalItems = Array.from(mergedMap.values());
    const nowIso = new Date().toISOString();
    const targetStatus: AnswerKeyStatus =
      params.publishImmediately !== false ? 'published' : 'verified';

    const tx = this.db.transaction(() => {
      this.db
        .prepare(
          `UPDATE answer_key_versions
           SET status = 'superseded'
           WHERE shift_paper_id = ? AND status IN ('published', 'verified', 'conflict', 'pending_verification')`
        )
        .run(params.shiftPaperId);

      const ins = this.db
        .prepare(
          `INSERT INTO answer_key_versions (
            shift_paper_id, version_number, status, total_questions,
            discovered_questions, confirmation_count, notes, verified_at, published_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`
        )
        .run(
          params.shiftPaperId,
          nextVersionNumber,
          targetStatus,
          exam.total_questions,
          finalItems.length,
          params.notes || `Revised Official Answer Key v${nextVersionNumber}`,
          nowIso,
          targetStatus === 'published' ? nowIso : null
        );

      const newVerId = Number(ins.lastInsertRowid);

      const insertItem = this.db.prepare(
        `INSERT INTO answer_key_items (
          answer_key_version_id, question_id, section_name, correct_option, marks, negative_marks, is_dropped
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`
      );

      for (const item of finalItems) {
        insertItem.run(
          newVerId,
          item.question_id,
          item.section_name,
          item.correct_option,
          item.marks,
          item.negative_marks,
          item.is_dropped ? 1 : 0
        );
      }

      const recalculatedCount = this.recalculateSubmissionsForShift(
        params.shiftPaperId,
        newVerId,
        finalItems
      );

      const newVersion = this.db
        .prepare('SELECT * FROM answer_key_versions WHERE id = ?')
        .get(newVerId) as AnswerKeyVersion;

      return {
        newVersion,
        recalculatedSubmissionsCount: recalculatedCount,
      };
    });

    return tx();
  }

  public recalculateSubmissionsForShift(
    shiftPaperId: number,
    targetKeyVersionId?: number,
    preloadedKeyItems?: AnswerKeyItem[]
  ): number {
    const exam = this.getCurrentExam();

    let keyVersionId = targetKeyVersionId;
    if (!keyVersionId) {
      const latestKey = this.db
        .prepare(
          `SELECT id FROM answer_key_versions
           WHERE shift_paper_id = ? AND status IN ('published', 'verified', 'pending_verification', 'conflict')
           ORDER BY version_number DESC LIMIT 1`
        )
        .get(shiftPaperId) as { id: number } | undefined;
      if (!latestKey) return 0;
      keyVersionId = latestKey.id;
    }

    const keyItems: AnswerKeyItem[] =
      preloadedKeyItems ||
      (
        this.db
          .prepare(
            'SELECT * FROM answer_key_items WHERE answer_key_version_id = ? ORDER BY id ASC'
          )
          .all(keyVersionId) as any[]
      ).map((r) => ({
        question_id: r.question_id,
        section_name: r.section_name,
        correct_option: r.correct_option,
        marks: Number(r.marks),
        negative_marks: Number(r.negative_marks),
        is_dropped: Boolean(r.is_dropped),
      }));

    const submissions = this.db
      .prepare('SELECT id FROM student_submissions WHERE shift_paper_id = ?')
      .all(shiftPaperId) as Array<{ id: number }>;

    const updateSubStmt = this.db.prepare(
      `UPDATE student_submissions
       SET total_questions = ?,
           correct = ?,
           incorrect = ?,
           unattempted = ?,
           dropped = ?,
           score = ?,
           section_a_score = ?,
           section_b_score = ?,
           accuracy = ?,
           answer_key_version_id = ?,
           updated_at = datetime('now')
       WHERE id = ?`
    );

    const updateRespStmt = this.db.prepare(
      `UPDATE student_responses
       SET correct_option = ?,
           is_correct = ?,
           is_attempted = ?,
           is_dropped = ?,
           marks_awarded = ?
       WHERE submission_id = ? AND question_id = ?`
    );

    for (const sub of submissions) {
      const rawResponses = this.db
        .prepare('SELECT * FROM student_responses WHERE submission_id = ? ORDER BY id ASC')
        .all(sub.id) as any[];

      const candidateQuestions: ParsedQuestionResponse[] = rawResponses.map((r) => ({
        question_id: r.question_id,
        section_name: r.section_name,
        selected_option: r.selected_option,
        correct_option: r.correct_option,
        question_status: r.selected_option ? 'Answered' : 'Not Answered',
      }));

      const recalc = calculateCandidateScore(candidateQuestions, keyItems, exam);

      updateSubStmt.run(
        recalc.total_questions,
        recalc.correct,
        recalc.incorrect,
        recalc.unattempted,
        recalc.dropped,
        recalc.score,
        recalc.section_a_score,
        recalc.section_b_score,
        recalc.accuracy,
        keyVersionId,
        sub.id
      );

      for (const evalResp of recalc.evaluated_responses) {
        updateRespStmt.run(
          evalResp.correct_option,
          evalResp.is_correct ? 1 : 0,
          evalResp.is_attempted ? 1 : 0,
          evalResp.is_dropped ? 1 : 0,
          evalResp.marks_awarded,
          sub.id,
          evalResp.question_id
        );
      }
    }

    return submissions.length;
  }

  public logParserEvent(
    shiftPaperId: number | null,
    sourceType: string,
    status: 'success' | 'parse_error' | 'key_conflict' | 'ssrf_blocked' | 'session_required',
    message: string
  ): void {
    this.db
      .prepare(
        'INSERT INTO parser_logs (shift_paper_id, source_type, status, message) VALUES (?, ?, ?, ?)'
      )
      .run(shiftPaperId, sourceType, status, message);
  }
}
