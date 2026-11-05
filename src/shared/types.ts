export type CategoryType = 'General' | 'OBC' | 'SC' | 'ST' | 'EWS' | 'Other';

export type AnswerKeyStatus =
  | 'building'
  | 'pending_verification'
  | 'verified'
  | 'published'
  | 'conflict'
  | 'superseded';

export type DroppedQuestionTreatment =
  | 'bonus_to_all'
  | 'bonus_if_attempted'
  | 'exclude_from_total';

export type MultipleCorrectTreatment =
  | 'any_correct_option'
  | 'bonus_to_all';

export interface ExamConfig {
  id: number;
  name: string;
  exam_code: string;
  status: 'active' | 'inactive' | 'archived';
  total_questions: number;
  marks_per_correct: number;
  negative_marks: number;
  marks_unattempted: number;
  dropped_question_treatment: DroppedQuestionTreatment;
  multiple_correct_treatment: MultipleCorrectTreatment;
  exam_countdown_target: string;
  public_leaderboard_enabled: number;
  maintenance_mode: number;
  leaderboard_refresh_seconds: number;
  auto_publish_threshold: number;
  created_at: string;
}

export interface ShiftPaper {
  id: number;
  exam_id: number;
  exam_date: string;
  shift_number: number;
  shift_timing: string;
  paper_code: string;
  paper_variant: string;
  status: 'active' | 'inactive' | 'locked';
  published_key_version?: number | null;
  key_status?: AnswerKeyStatus | 'not_discovered';
  submission_count?: number;
  avg_score?: number;
}

export interface ParsedQuestionResponse {
  question_id: string;
  section_name: string;
  selected_option: string | null;
  correct_option: string;
  question_status: 'Answered' | 'Not Answered' | 'Marked For Review' | 'Dropped';
  marks?: number;
  negative_marks?: number;
}

export interface ExtractedSheetMetadata {
  roll_number: string;
  application_number?: string;
  candidate_name?: string;
  category?: CategoryType;
  sub_category?: string;
  gender?: string;
  test_center_name?: string;
  test_center_code?: string;
  exam_date?: string;
  shift_number?: number;
  shift_timing?: string;
  paper_code?: string;
  subject_name?: string;
}

export interface ParsedResponseSheet {
  candidate_id: string;
  candidate_name_from_sheet?: string;
  category_from_sheet?: CategoryType;
  application_number?: string;
  gender?: string;
  sub_category?: string;
  test_center_name?: string;
  test_center_code?: string;
  exam_date?: string;
  shift_number?: number;
  shift_timing?: string;
  paper_code?: string;
  subject_name?: string;
  paper_variant?: string;
  questions: ParsedQuestionResponse[];
  parser_mode: 'digialm_official_html' | 'dsssb_table_html' | 'json_structured' | 'pdf_extracted_text';
  is_verified_real_format: boolean;
  warnings: string[];
}

export interface AnswerKeyItem {
  id?: number;
  answer_key_version_id?: number;
  question_id: string;
  section_name: string;
  correct_option: string;
  marks: number;
  negative_marks: number;
  is_dropped: boolean;
}

export interface AnswerKeyVersion {
  id: number;
  shift_paper_id: number;
  version_number: number;
  status: AnswerKeyStatus;
  source_submission_id: number | null;
  total_questions: number;
  discovered_questions: number;
  confirmation_count: number;
  conflict_details: string | null;
  notes: string | null;
  created_at: string;
  verified_at: string | null;
  published_at: string | null;
  exam_date?: string;
  shift_number?: number;
  paper_code?: string;
  paper_variant?: string;
}

export interface ScoreCalculationResult {
  total_questions: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  dropped: number;
  score: number;
  section_a_score: number;
  section_b_score: number;
  accuracy: number;
  evaluated_responses: Array<{
    question_id: string;
    section_name: string;
    selected_option: string | null;
    correct_option: string;
    is_correct: boolean;
    is_attempted: boolean;
    is_dropped: boolean;
    marks_awarded: number;
  }>;
}

export interface StudentSubmissionDetail {
  id: number;
  shift_paper_id: number;
  student_name: string;
  category: CategoryType;
  exam_date: string;
  shift_number: number;
  shift_timing: string;
  paper_code: string;
  paper_variant: string;
  total_questions: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  dropped: number;
  score: number;
  section_a_score: number;
  section_b_score: number;
  accuracy: number;
  estimated_normalized_score: number;
  qualifying_min_pct: number;
  part_a_qualified: boolean;
  part_b_qualified: boolean;
  overall_qualified: boolean;
  answer_key_version_id: number;
  answer_key_version_number: number;
  answer_key_status: AnswerKeyStatus;
  overall_rank: number;
  total_candidates: number;
  category_rank: number;
  total_category_candidates: number;
  shift_rank: number;
  total_shift_candidates: number;
  overall_percentile: number;
  category_percentile: number;
  shift_percentile: number;
  shift_average_score: number;
  overall_average_score: number;
  created_at: string;
  key_discovery_event?: 'initiated_new_key' | 'reused_published_key' | 'confirmed_pending_key' | 'flagged_conflict';
  extracted_metadata?: {
    roll_number?: string;
    application_number?: string;
    gender?: string;
    sub_category?: string;
    test_center_name?: string;
    test_center_code?: string;
    subject_name?: string;
  };
  section_breakdown: Array<{
    section_name: string;
    total: number;
    correct: number;
    incorrect: number;
    unattempted: number;
    score: number;
    accuracy: number;
  }>;
}

export interface LeaderboardEntry {
  id: number;
  dense_rank: number;
  student_name: string;
  category: CategoryType;
  shift_paper_id: number;
  exam_date: string;
  shift_number: number;
  paper_code: string;
  score: number;
  section_a_score: number;
  section_b_score: number;
  correct: number;
  incorrect: number;
  unattempted: number;
  accuracy: number;
  answer_key_version: number;
  created_at: string;
}

export interface CategoryCutoffEstimate {
  category: CategoryType;
  sample_size: number;
  mean_score: number;
  median_score: number;
  p75_score: number;
  p85_score: number;
  p90_score: number;
  top_score: number;
  qualifying_min_pct: number;
  estimated_safe_low: number;
  estimated_safe_high: number;
  confidence_level: 'High (n >= 30)' | 'Moderate (10 <= n < 30)' | 'Low / Early Sample (n < 10)';
}
