import {
  AnswerKeyItem,
  ExamConfig,
  ParsedQuestionResponse,
  ScoreCalculationResult,
} from '../shared/types';

export function normalizeOption(opt: string | null | undefined): string {
  if (!opt) return '';
  const trimmed = String(opt).trim().toUpperCase();
  if (
    trimmed === '--' ||
    trimmed === '-' ||
    trimmed === 'NA' ||
    trimmed === 'N/A' ||
    trimmed === 'NOT ANSWERED' ||
    trimmed === 'UNATTEMPTED' ||
    trimmed === 'NULL'
  ) {
    return '';
  }
  // Map A/B/C/D to 1/2/3/4 for consistent comparison if single letter
  const map: Record<string, string> = { A: '1', B: '2', C: '3', D: '4' };
  if (map[trimmed]) return map[trimmed];
  return trimmed;
}

export function isDroppedMarker(opt: string | null | undefined): boolean {
  if (!opt) return false;
  const upper = String(opt).trim().toUpperCase();
  return (
    upper === 'DROP' ||
    upper === 'DROPPED' ||
    upper === 'BONUS' ||
    upper === 'DELETED' ||
    upper === 'IGNORE'
  );
}

/**
 * Pure, deterministic server-side scoring engine for DSSSB TGT CS.
 * Supports configurable positive marks, negative marking, unattempted marks,
 * dropped question treatments, and multiple correct options.
 */
export function calculateCandidateScore(
  candidateQuestions: ParsedQuestionResponse[],
  answerKeyItems: AnswerKeyItem[],
  config: Pick<
    ExamConfig,
    | 'total_questions'
    | 'marks_per_correct'
    | 'negative_marks'
    | 'marks_unattempted'
    | 'dropped_question_treatment'
    | 'multiple_correct_treatment'
  >
): ScoreCalculationResult {
  const keyMap = new Map<string, AnswerKeyItem>();
  for (const item of answerKeyItems) {
    keyMap.set(String(item.question_id).trim(), item);
  }

  const responseMap = new Map<string, ParsedQuestionResponse>();
  for (const q of candidateQuestions) {
    responseMap.set(String(q.question_id).trim(), q);
  }

  // Merge all question IDs from the authoritative answer key (or candidate sheet if key is empty)
  const orderedIds: string[] =
    answerKeyItems.length > 0
      ? answerKeyItems.map((k) => String(k.question_id).trim())
      : candidateQuestions.map((q) => String(q.question_id).trim());

  let correct = 0;
  let incorrect = 0;
  let unattempted = 0;
  let dropped = 0;
  let totalScore = 0;
  let sectionAScore = 0;
  let sectionBScore = 0;

  const evaluatedResponses: ScoreCalculationResult['evaluated_responses'] = [];

  orderedIds.forEach((qid, idx) => {
    const keyItem = keyMap.get(qid);
    const candItem = responseMap.get(qid);

    const sectionName =
      keyItem?.section_name ||
      candItem?.section_name ||
      (idx < 100 ? 'Section A: General Aptitude' : 'Section B: Computer Science');

    const isSectionA =
      sectionName.toLowerCase().includes('section a') ||
      sectionName.toLowerCase().includes('general') ||
      (!sectionName.toLowerCase().includes('computer') && idx < 100);

    const rawCorrectOpt = keyItem ? keyItem.correct_option : candItem?.correct_option || '';
    const isDropped =
      Boolean(keyItem?.is_dropped) ||
      isDroppedMarker(rawCorrectOpt) ||
      candItem?.question_status === 'Dropped';

    const positiveMarks =
      keyItem?.marks !== undefined && keyItem.marks !== null
        ? Number(keyItem.marks)
        : Number(config.marks_per_correct);

    const negativePenalty =
      keyItem?.negative_marks !== undefined && keyItem.negative_marks !== null
        ? Number(keyItem.negative_marks)
        : Number(config.negative_marks);

    const selectedNorm = normalizeOption(candItem?.selected_option);
    const isAttempted = selectedNorm.length > 0;

    let isCorrect = false;
    let marksAwarded = 0;

    if (isDropped) {
      dropped += 1;
      if (config.dropped_question_treatment === 'bonus_to_all') {
        marksAwarded = positiveMarks;
      } else if (config.dropped_question_treatment === 'bonus_if_attempted') {
        marksAwarded = isAttempted ? positiveMarks : 0;
      } else {
        // exclude_from_total
        marksAwarded = 0;
      }
    } else {
      // Check multiple correct options (e.g. "1,2" or "A,B" or "ALL")
      const normalizedTargets = String(rawCorrectOpt)
        .split(/[,/|;]/)
        .map((s) => normalizeOption(s))
        .filter(Boolean);

      const isMultiOption =
        normalizedTargets.length > 1 ||
        String(rawCorrectOpt).trim().toUpperCase() === 'ALL';

      if (
        isMultiOption &&
        (config.multiple_correct_treatment === 'bonus_to_all' ||
          String(rawCorrectOpt).trim().toUpperCase() === 'ALL')
      ) {
        isCorrect = true;
        correct += 1;
        marksAwarded = positiveMarks;
      } else if (!isAttempted) {
        unattempted += 1;
        marksAwarded = Number(config.marks_unattempted || 0);
      } else if (normalizedTargets.includes(selectedNorm)) {
        isCorrect = true;
        correct += 1;
        marksAwarded = positiveMarks;
      } else {
        isCorrect = false;
        incorrect += 1;
        marksAwarded = -Math.abs(negativePenalty);
      }
    }

    totalScore += marksAwarded;
    if (isSectionA) {
      sectionAScore += marksAwarded;
    } else {
      sectionBScore += marksAwarded;
    }

    evaluatedResponses.push({
      question_id: qid,
      section_name: sectionName,
      selected_option: selectedNorm || null,
      correct_option: normalizedTargetsSafe(rawCorrectOpt, isDropped),
      is_correct: isCorrect,
      is_attempted: isAttempted,
      is_dropped: isDropped,
      marks_awarded: Number(marksAwarded.toFixed(4)),
    });
  });

  const attemptedNonDropped = correct + incorrect;
  const accuracy =
    attemptedNonDropped > 0
      ? Number(((correct / attemptedNonDropped) * 100).toFixed(2))
      : 0;

  return {
    total_questions: orderedIds.length,
    correct,
    incorrect,
    unattempted,
    dropped,
    score: Number(totalScore.toFixed(2)),
    section_a_score: Number(sectionAScore.toFixed(2)),
    section_b_score: Number(sectionBScore.toFixed(2)),
    accuracy,
    evaluated_responses: evaluatedResponses,
  };
}

function normalizedTargetsSafe(raw: string, isDropped: boolean): string {
  if (isDropped) return 'DROP';
  const parts = String(raw)
    .split(/[,/|;]/)
    .map((s) => normalizeOption(s))
    .filter(Boolean);
  return parts.length > 0 ? parts.join(',') : normalizeOption(raw) || '1';
}
