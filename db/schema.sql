-- Revise with AI: question bank schema (Cloudflare D1 / SQLite)
CREATE TABLE IF NOT EXISTS questions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  text            TEXT    NOT NULL,
  norm_hash       TEXT    NOT NULL UNIQUE,      -- duplicate guard
  topic           TEXT    NOT NULL,
  subtopic        TEXT,
  level           INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10),
  level_reason    TEXT,
  options         TEXT,                         -- JSON array when the question is MCQ-only
  correct_index   INTEGER,
  answer          REAL,                         -- numeric answer (null for non-numeric MCQs)
  answer_text     TEXT    NOT NULL,
  distractors     TEXT,                         -- JSON array of wrong answers for numeric questions
  solution        TEXT    NOT NULL,             -- JSON array of steps
  quality         REAL,                         -- 1-10 overall score from the AI judge
  quality_detail  TEXT,                         -- JSON {clarity, correctness, cat_relevance, concept_depth, notes}
  source          TEXT    NOT NULL,             -- user | topic | variation | seed
  parent_id       INTEGER,
  variations_made INTEGER NOT NULL DEFAULT 0,
  attempts        INTEGER NOT NULL DEFAULT 0,
  correct         INTEGER NOT NULL DEFAULT 0,
  flags           INTEGER NOT NULL DEFAULT 0,
  hidden          INTEGER NOT NULL DEFAULT 0,
  pattern         TEXT,                         -- question type, e.g. 'Successive percentage change'
  status          TEXT    NOT NULL DEFAULT 'live',  -- pending (being verified) | live | rejected
  checks          TEXT,                         -- JSON summary of the background verification
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_q_serve ON questions (hidden, level, topic);
CREATE INDEX IF NOT EXISTS idx_q_topic ON questions (topic, hidden);
CREATE INDEX IF NOT EXISTS idx_q_pattern ON questions (status, pattern, level);

CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
