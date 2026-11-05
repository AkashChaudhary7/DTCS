-- DSSSB TGT CS Rank Predictor - Cloudflare D1 (SQLite) Initial Schema Migration
-- Migration: 0001_initial_schema.sql

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  exam_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'archived')),
  total_questions INTEGER NOT NULL DEFAULT 200,
  marks_per_correct REAL NOT NULL DEFAULT 1.0,
  negative_marks REAL NOT NULL DEFAULT 0.25,
  marks_unattempted REAL NOT NULL DEFAULT 0.0,
  dropped_question_treatment TEXT NOT NULL DEFAULT 'bonus_to_all' CHECK (dropped_question_treatment IN ('bonus_to_all', 'bonus_if_attempted', 'exclude_from_total')),
  multiple_correct_treatment TEXT NOT NULL DEFAULT 'any_correct_option' CHECK (multiple_correct_treatment IN ('any_correct_option', 'bonus_to_all')),
  exam_countdown_target TEXT DEFAULT '2026-12-08T09:00:00+05:30',
  public_leaderboard_enabled INTEGER NOT NULL DEFAULT 1,
  maintenance_mode INTEGER NOT NULL DEFAULT 0,
  leaderboard_refresh_seconds INTEGER NOT NULL DEFAULT 20,
  auto_publish_threshold INTEGER NOT NULL DEFAULT 2,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS shift_papers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL,
  exam_date TEXT NOT NULL,
  shift_number INTEGER NOT NULL CHECK (shift_number >= 1 AND shift_number <= 18),
  shift_timing TEXT NOT NULL DEFAULT '09:00 AM - 11:00 AM',
  paper_code TEXT NOT NULL DEFAULT 'TGT-CS-41/26',
  paper_variant TEXT NOT NULL DEFAULT 'EN-HI-STD',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'locked')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (exam_id) REFERENCES exams(id) ON DELETE CASCADE,
  UNIQUE (exam_id, exam_date, shift_number, paper_code, paper_variant)
);

CREATE TABLE IF NOT EXISTS answer_key_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_paper_id INTEGER NOT NULL,
  version_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_verification' CHECK (
    status IN ('building', 'pending_verification', 'verified', 'published', 'conflict', 'superseded')
  ),
  source_submission_id INTEGER,
  total_questions INTEGER NOT NULL DEFAULT 200,
  discovered_questions INTEGER NOT NULL DEFAULT 0,
  confirmation_count INTEGER NOT NULL DEFAULT 1,
  conflict_details TEXT,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  verified_at TEXT,
  published_at TEXT,
  FOREIGN KEY (shift_paper_id) REFERENCES shift_papers(id) ON DELETE CASCADE,
  UNIQUE (shift_paper_id, version_number)
);

CREATE TABLE IF NOT EXISTS answer_key_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_key_version_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  section_name TEXT NOT NULL DEFAULT 'General',
  correct_option TEXT NOT NULL,
  marks REAL NOT NULL DEFAULT 1.0,
  negative_marks REAL NOT NULL DEFAULT 0.25,
  is_dropped INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (answer_key_version_id) REFERENCES answer_key_versions(id) ON DELETE CASCADE,
  UNIQUE (answer_key_version_id, question_id)
);

CREATE TABLE IF NOT EXISTS student_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_paper_id INTEGER NOT NULL,
  student_name TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('General', 'OBC', 'SC', 'ST', 'EWS', 'Other')),
  roll_number TEXT NOT NULL DEFAULT '',
  application_number TEXT NOT NULL DEFAULT '',
  gender TEXT NOT NULL DEFAULT '',
  sub_category TEXT NOT NULL DEFAULT 'None',
  test_center_name TEXT NOT NULL DEFAULT '',
  test_center_code TEXT NOT NULL DEFAULT '',
  subject_from_sheet TEXT NOT NULL DEFAULT 'TGT Computer Science (41/26)',
  candidate_hash TEXT NOT NULL,
  response_hash TEXT NOT NULL,
  total_questions INTEGER NOT NULL DEFAULT 200,
  correct INTEGER NOT NULL DEFAULT 0,
  incorrect INTEGER NOT NULL DEFAULT 0,
  unattempted INTEGER NOT NULL DEFAULT 0,
  dropped INTEGER NOT NULL DEFAULT 0,
  score REAL NOT NULL DEFAULT 0.0,
  section_a_score REAL NOT NULL DEFAULT 0.0,
  section_b_score REAL NOT NULL DEFAULT 0.0,
  accuracy REAL NOT NULL DEFAULT 0.0,
  answer_key_version_id INTEGER NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'url' CHECK (source_type IN ('url', 'html_upload', 'pdf_upload', 'fixture')),
  status TEXT NOT NULL DEFAULT 'valid' CHECK (status IN ('valid', 'flagged', 'hidden', 'invalid')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (shift_paper_id) REFERENCES shift_papers(id) ON DELETE CASCADE,
  FOREIGN KEY (answer_key_version_id) REFERENCES answer_key_versions(id) ON DELETE RESTRICT,
  UNIQUE (shift_paper_id, candidate_hash)
);

CREATE TABLE IF NOT EXISTS student_responses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  question_id TEXT NOT NULL,
  section_name TEXT NOT NULL DEFAULT 'General',
  selected_option TEXT,
  correct_option TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  is_attempted INTEGER NOT NULL DEFAULT 0,
  is_dropped INTEGER NOT NULL DEFAULT 0,
  marks_awarded REAL NOT NULL DEFAULT 0.0,
  FOREIGN KEY (submission_id) REFERENCES student_submissions(id) ON DELETE CASCADE,
  UNIQUE (submission_id, question_id)
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS parser_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shift_paper_id INTEGER,
  source_type TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('success', 'parse_error', 'key_conflict', 'ssrf_blocked', 'session_required')),
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes for high-performance leaderboard, shift, and category queries
CREATE INDEX IF NOT EXISTS idx_submissions_score ON student_submissions(status, score DESC, accuracy DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_submissions_shift_score ON student_submissions(shift_paper_id, status, score DESC, accuracy DESC);
CREATE INDEX IF NOT EXISTS idx_submissions_category_score ON student_submissions(category, status, score DESC, accuracy DESC);
CREATE INDEX IF NOT EXISTS idx_answer_keys_shift_status ON answer_key_versions(shift_paper_id, status, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_answer_key_items_version ON answer_key_items(answer_key_version_id);
CREATE INDEX IF NOT EXISTS idx_student_responses_submission ON student_responses(submission_id);
