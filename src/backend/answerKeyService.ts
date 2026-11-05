import { AnswerKeyItem, ParsedQuestionResponse } from '../shared/types';
import { isDroppedMarker, normalizeOption } from './scoringEngine';

export interface KeyValidationReport {
  isValid: boolean;
  isComplete: boolean;
  totalExpected: number;
  extractedCount: number;
  duplicateIds: string[];
  invalidOptionIds: string[];
  items: AnswerKeyItem[];
  errors: string[];
}

export interface KeyComparisonReport {
  hasConflict: boolean;
  conflictingQuestions: Array<{
    question_id: string;
    cached_option: string;
    incoming_option: string;
  }>;
  matchedCount: number;
}

const VALID_SINGLE_OPTIONS = new Set(['1', '2', '3', '4', 'DROP', 'ALL']);

/**
 * Validates extracted correct answers from a candidate response sheet before storing
 * as an answer-key version. Checks question count, duplicate IDs, missing questions,
 * and valid option markers.
 */
export function validateExtractedAnswerKey(
  questions: ParsedQuestionResponse[],
  expectedTotalQuestions: number,
  defaultMarksPerCorrect = 1.0,
  defaultNegativeMarks = 0.25
): KeyValidationReport {
  const seenIds = new Set<string>();
  const duplicateIds: string[] = [];
  const invalidOptionIds: string[] = [];
  const items: AnswerKeyItem[] = [];
  const errors: string[] = [];

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    const qid = String(q.question_id || '').trim();
    if (!qid) {
      errors.push(`Question at index ${i + 1} is missing a question_id.`);
      continue;
    }

    if (seenIds.has(qid)) {
      duplicateIds.push(qid);
      continue;
    }
    seenIds.add(qid);

    const dropped = isDroppedMarker(q.correct_option) || q.question_status === 'Dropped';
    const rawOpt = dropped ? 'DROP' : normalizeOption(q.correct_option);

    // Support single valid option (1,2,3,4,DROP) or multi-correct like "1,2"
    const parts = rawOpt.split(',').map((p) => p.trim()).filter(Boolean);
    const allPartsValid =
      parts.length > 0 && parts.every((p) => VALID_SINGLE_OPTIONS.has(p));

    if (!allPartsValid) {
      invalidOptionIds.push(qid);
    }

    items.push({
      question_id: qid,
      section_name:
        q.section_name ||
        (i < 100 ? 'Section A: General Aptitude' : 'Section B: Computer Science Domain'),
      correct_option: dropped ? 'DROP' : parts.join(','),
      marks: q.marks !== undefined ? Number(q.marks) : defaultMarksPerCorrect,
      negative_marks:
        q.negative_marks !== undefined ? Number(q.negative_marks) : defaultNegativeMarks,
      is_dropped: dropped,
    });
  }

  if (duplicateIds.length > 0) {
    errors.push(`Duplicate question IDs detected: ${duplicateIds.slice(0, 5).join(', ')}`);
  }

  if (invalidOptionIds.length > 0) {
    errors.push(
      `Invalid correct-option values found for question IDs: ${invalidOptionIds.slice(0, 5).join(', ')}`
    );
  }

  if (items.length === 0) {
    errors.push('No valid questions could be extracted for the answer key.');
  }

  const isComplete = items.length === expectedTotalQuestions;
  const isValid =
    items.length > 0 && duplicateIds.length === 0 && invalidOptionIds.length === 0;

  return {
    isValid,
    isComplete,
    totalExpected: expectedTotalQuestions,
    extractedCount: items.length,
    duplicateIds,
    invalidOptionIds,
    items,
    errors,
  };
}

/**
 * Compares newly extracted official correct answers from a subsequent candidate's response sheet
 * against an existing cached answer key for the same shift paper.
 * Detects any discrepancies so the shift key can be flagged as 'conflict' for admin review.
 */
export function compareWithCachedAnswerKey(
  cachedItems: AnswerKeyItem[],
  incomingQuestions: ParsedQuestionResponse[]
): KeyComparisonReport {
  const cachedMap = new Map<string, string>();
  for (const item of cachedItems) {
    const norm = item.is_dropped ? 'DROP' : normalizeOption(item.correct_option);
    cachedMap.set(String(item.question_id).trim(), norm);
  }

  const conflictingQuestions: KeyComparisonReport['conflictingQuestions'] = [];
  let matchedCount = 0;

  for (const q of incomingQuestions) {
    const qid = String(q.question_id).trim();
    const cachedOpt = cachedMap.get(qid);
    if (!cachedOpt) continue;

    const incomingOpt =
      isDroppedMarker(q.correct_option) || q.question_status === 'Dropped'
        ? 'DROP'
        : normalizeOption(q.correct_option);

    if (!incomingOpt) continue;

    if (cachedOpt !== incomingOpt) {
      conflictingQuestions.push({
        question_id: qid,
        cached_option: cachedOpt,
        incoming_option: incomingOpt,
      });
    } else {
      matchedCount += 1;
    }
  }

  return {
    hasConflict: conflictingQuestions.length > 0,
    conflictingQuestions,
    matchedCount,
  };
}
