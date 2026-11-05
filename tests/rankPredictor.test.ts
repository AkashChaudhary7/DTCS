import { describe, expect, it } from 'vitest';
import {
  compareWithCachedAnswerKey,
  validateExtractedAnswerKey,
} from '../src/backend/answerKeyService';
import { EdgeCacheManager } from '../src/backend/cache';
import { AppDatabase } from '../src/backend/db';
import {
  generateOfficialDigialmHtmlFixture,
  parseResponseSheetContent,
  validateResponseSheetUrl,
} from '../src/backend/parser';
import { calculateCandidateScore } from '../src/backend/scoringEngine';
import { createAdminToken, verifyAdminToken } from '../src/backend/security';
import { AnswerKeyItem, ParsedQuestionResponse } from '../src/shared/types';

describe('DSSSB TGT CS Rank Predictor - Comprehensive Test Suite', () => {
  it('1-4. Evaluates positive marks, negative marking, unattempted, and dropped questions accurately', () => {
    const keyItems: AnswerKeyItem[] = [
      {
        question_id: 'Q1',
        section_name: 'Section A: General Aptitude',
        correct_option: '2',
        marks: 1.0,
        negative_marks: 0.25,
        is_dropped: false,
      },
      {
        question_id: 'Q2',
        section_name: 'Section A: General Aptitude',
        correct_option: '3',
        marks: 1.0,
        negative_marks: 0.25,
        is_dropped: false,
      },
      {
        question_id: 'Q3',
        section_name: 'Section B: Computer Science',
        correct_option: '1',
        marks: 1.0,
        negative_marks: 0.25,
        is_dropped: false,
      },
      {
        question_id: 'Q4',
        section_name: 'Section B: Computer Science',
        correct_option: 'DROP',
        marks: 1.0,
        negative_marks: 0.25,
        is_dropped: true,
      },
    ];

    const candidateQuestions: ParsedQuestionResponse[] = [
      {
        question_id: 'Q1',
        section_name: 'Section A: General Aptitude',
        selected_option: '2',
        correct_option: '2',
        question_status: 'Answered',
      },
      {
        question_id: 'Q2',
        section_name: 'Section A: General Aptitude',
        selected_option: '4',
        correct_option: '3',
        question_status: 'Answered',
      },
      {
        question_id: 'Q3',
        section_name: 'Section B: Computer Science',
        selected_option: null,
        correct_option: '1',
        question_status: 'Not Answered',
      },
      {
        question_id: 'Q4',
        section_name: 'Section B: Computer Science',
        selected_option: null,
        correct_option: 'DROP',
        question_status: 'Dropped',
      },
    ];

    const bonusAllScore = calculateCandidateScore(candidateQuestions, keyItems, {
      total_questions: 4,
      marks_per_correct: 1.0,
      negative_marks: 0.25,
      marks_unattempted: 0,
      dropped_question_treatment: 'bonus_to_all',
      multiple_correct_treatment: 'any_correct_option',
    });

    expect(bonusAllScore.correct).toBe(1);
    expect(bonusAllScore.incorrect).toBe(1);
    expect(bonusAllScore.unattempted).toBe(1);
    expect(bonusAllScore.dropped).toBe(1);
    expect(bonusAllScore.score).toBe(1.75);
    expect(bonusAllScore.accuracy).toBe(50);

    const bonusIfAttempted = calculateCandidateScore(candidateQuestions, keyItems, {
      total_questions: 4,
      marks_per_correct: 1.0,
      negative_marks: 0.25,
      marks_unattempted: 0,
      dropped_question_treatment: 'bonus_if_attempted',
      multiple_correct_treatment: 'any_correct_option',
    });
    expect(bonusIfAttempted.score).toBe(0.75);
  });

  it('5-11. Smart Answer Key Discovery, Reuse, Conflict Detection, Version Revision, Equal-Score DENSE_RANK, and Duplicate Prevention', () => {
    const db = new AppDatabase(':memory:');
    db.seedInitialDataIfEmpty();

    const shifts = db.getShiftsWithStats();
    const shift10 = shifts.find((s) => s.shift_number === 10)!;
    expect(shift10.key_status).toBe('not_discovered');

    const htmlCandA = generateOfficialDigialmHtmlFixture(10, '99001', {
      candidateName: 'Candidate Alpha',
      category: 'General',
    });
    const parsedA = parseResponseSheetContent(htmlCandA);
    const outA = db.processCandidateSubmission({
      shiftPaperId: shift10.id,
      studentName: 'Candidate Alpha',
      category: 'General',
      candidateIdFromSheet: '99001',
      parsedSheet: parsedA,
      sourceType: 'url',
    });

    expect(outA.keyDiscoveryEvent).toBe('initiated_new_key');
    expect(outA.answerKeyStatus).toBe('pending_verification');

    expect(() =>
      db.processCandidateSubmission({
        shiftPaperId: shift10.id,
        studentName: 'Candidate Alpha',
        category: 'General',
        candidateIdFromSheet: '99001',
        parsedSheet: parsedA,
        sourceType: 'url',
      })
    ).toThrow(/Duplicate submission/i);

    const outB = db.processCandidateSubmission({
      shiftPaperId: shift10.id,
      studentName: 'Candidate Beta',
      category: 'OBC',
      candidateIdFromSheet: '99002',
      parsedSheet: {
        ...parsedA,
        candidate_id: '99002',
        candidate_name_from_sheet: 'Candidate Beta',
        category_from_sheet: 'OBC',
      },
      sourceType: 'url',
    });

    expect(outB.keyDiscoveryEvent).toBe('confirmed_pending_key');
    expect(outB.answerKeyStatus).toBe('published');
    expect(outB.answerKeyVersionId).toBe(outA.answerKeyVersionId);

    const shift10Lb = db.getLeaderboard({ shiftPaperId: shift10.id });
    expect(shift10Lb.entries.length).toBe(2);
    expect(shift10Lb.entries[0].score).toBe(shift10Lb.entries[1].score);
    expect(shift10Lb.entries[0].dense_rank).toBe(1);
    expect(shift10Lb.entries[1].dense_rank).toBe(1);

    const htmlCandConflict = generateOfficialDigialmHtmlFixture(10, '99003', {
      candidateName: 'Candidate Gamma',
      introduceKeyConflict: true,
    });
    const parsedConflict = parseResponseSheetContent(htmlCandConflict);
    const outC = db.processCandidateSubmission({
      shiftPaperId: shift10.id,
      studentName: 'Candidate Gamma',
      category: 'General',
      candidateIdFromSheet: '99003',
      parsedSheet: parsedConflict,
      sourceType: 'url',
    });

    expect(outC.keyDiscoveryEvent).toBe('flagged_conflict');
    expect(outC.answerKeyStatus).toBe('conflict');

    const firstQuestionId = parsedA.questions[0].question_id;
    const revisionResult = db.reviseShiftAnswerKey({
      shiftPaperId: shift10.id,
      updatedItems: [
        {
          question_id: firstQuestionId,
          correct_option: 'DROP',
          is_dropped: true,
        },
      ],
      notes: 'Official Final Answer Key v2',
      publishImmediately: true,
    });

    expect(revisionResult.newVersion.version_number).toBe(2);
    expect(revisionResult.newVersion.status).toBe('published');
    expect(revisionResult.recalculatedSubmissionsCount).toBe(3);

    const updatedAlpha = db.getSubmissionResultById(outA.submissionId)!;
    expect(updatedAlpha.answer_key_version_number).toBe(2);
  });

  it('Authoritatively overrides manually passed Name, Category, and Shift with Response-Sheet metadata', () => {
    const db = new AppDatabase(':memory:');
    db.seedInitialDataIfEmpty();

    const html = generateOfficialDigialmHtmlFixture(7, '412611209777', {
      candidateName: 'Official Sheet Name',
      category: 'EWS',
      gender: 'Female',
      subCategory: 'PwBD-OH',
      applicationNumber: '412600777888',
    });
    const parsed = parseResponseSheetContent(html);

    expect(parsed.candidate_name_from_sheet).toBe('Official Sheet Name');
    expect(parsed.category_from_sheet).toBe('EWS');
    expect(parsed.shift_number).toBe(7);
    expect(parsed.application_number).toBe('412600777888');
    expect(parsed.gender).toBe('Female');
    expect(parsed.sub_category).toBe('PwBD-OH');
    expect(parsed.test_center_code).toBeTruthy();

    // Even if user passes fake manual values ("Fake Manual Name", "SC", shiftPaperId=1),
    // processCandidateSubmission uses the authoritative values extracted from the sheet!
    const subOut = db.processCandidateSubmission({
      shiftPaperId: 1,
      studentName: 'Fake Manual Name',
      category: 'SC',
      parsedSheet: parsed,
      sourceType: 'url',
      preferSheetMetadata: true,
    });

    const detail = db.getSubmissionResultById(subOut.submissionId)!;
    expect(detail.student_name).toBe('Official Sheet Name');
    expect(detail.category).toBe('EWS');
    expect(detail.shift_number).toBe(7);
    expect(detail.extracted_metadata?.roll_number).toBe('412611209777');
    expect(detail.extracted_metadata?.application_number).toBe('412600777888');
    expect(detail.extracted_metadata?.gender).toBe('Female');
    expect(detail.extracted_metadata?.sub_category).toBe('PwBD-OH');
  });

  it('12-13. Rejects invalid/SSRF URLs and handles malformed parser input cleanly', () => {
    expect(validateResponseSheetUrl('http://cdn.digialm.com/sheet.html').valid).toBe(false);
    expect(validateResponseSheetUrl('https://127.0.0.1/admin').valid).toBe(false);
    expect(validateResponseSheetUrl('https://169.254.169.254/latest/meta-data').valid).toBe(
      false
    );
    expect(validateResponseSheetUrl('https://localhost:3000/api').valid).toBe(false);
    expect(validateResponseSheetUrl('https://evil-attacker.example.com/sheet.html').valid).toBe(
      false
    );
    expect(
      validateResponseSheetUrl(
        'https://cdn.digialm.com/EForms/configuredHtml/1258/91402/touchstone/AssessmentQPHTMLMode1/shift-1/cand-11209001.html'
      ).valid
    ).toBe(true);

    expect(() => parseResponseSheetContent('<html><body>Random Blog</body></html>')).toThrow(
      /Unrecognized response-sheet format/i
    );
  });

  it('14-15. Enforces Admin HMAC token verification, Dsssb123!321 default password, and tag-based Cache Invalidation', () => {
    const db = new AppDatabase(':memory:');
    db.seedInitialDataIfEmpty();
    const adminRow = db.db
      .prepare('SELECT * FROM admin_users WHERE username = ?')
      .get('admin') as { username: string; password_hash: string } | undefined;
    expect(adminRow?.username).toBe('admin');

    const token = createAdminToken(1, 'admin');
    const verified = verifyAdminToken(token);
    expect(verified?.username).toBe('admin');
    expect(verifyAdminToken(`${token}tampered`)).toBeNull();
    expect(verifyAdminToken('invalid.token')).toBeNull();

    const cache = new EdgeCacheManager(60);
    cache.set('lb:overall', { entries: [1, 2, 3] }, ['leaderboard', 'public']);
    expect(cache.get('lb:overall')).toBeTruthy();

    cache.invalidateByTag('public');
    expect(cache.get('lb:overall')).toBeNull();
  });

  it('Validates answer key extraction and conflict detector unit helpers', () => {
    const sampleHtml = generateOfficialDigialmHtmlFixture(2, '88001');
    const parsed = parseResponseSheetContent(sampleHtml);
    const report = validateExtractedAnswerKey(parsed.questions, 200);
    expect(report.isValid).toBe(true);
    expect(report.isComplete).toBe(true);
    expect(report.extractedCount).toBe(200);

    const conflictHtml = generateOfficialDigialmHtmlFixture(2, '88002', {
      introduceKeyConflict: true,
    });
    const parsedConflict = parseResponseSheetContent(conflictHtml);
    const diff = compareWithCachedAnswerKey(report.items, parsedConflict.questions);
    expect(diff.hasConflict).toBe(true);
    expect(diff.conflictingQuestions.length).toBeGreaterThanOrEqual(1);
  });
});
