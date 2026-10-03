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
  rnd             REAL,                         -- random key for fast indexed random picks
  template_id     INTEGER,                      -- template this question was generated from, if any
  created_at      TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_q_rnd ON questions (status, pattern, level, rnd);
CREATE INDEX IF NOT EXISTS idx_q_rnd_level ON questions (status, level, rnd);

-- AI-written templates: question text with blanks plus an answer formula; code fills in numbers.
CREATE TABLE IF NOT EXISTS templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  pattern    TEXT    NOT NULL,
  topic      TEXT    NOT NULL,
  level      INTEGER NOT NULL,
  body       TEXT    NOT NULL,                    -- JSON template
  status     TEXT    NOT NULL DEFAULT 'live',
  made       INTEGER NOT NULL DEFAULT 0,          -- questions generated from it so far
  source_id  INTEGER,                             -- question it was modelled on
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_t_pattern ON templates (status, pattern, level);

-- Exact repeat uploads (normalised original text -> question), answered with no AI call.
CREATE TABLE IF NOT EXISTS upload_cache (
  hash        TEXT PRIMARY KEY,
  question_id INTEGER NOT NULL
);

-- Full-text index to recognise repeat uploads without calling the AI.
CREATE VIRTUAL TABLE IF NOT EXISTS qsearch USING fts5(text);

CREATE TABLE IF NOT EXISTS rate_limits (
  key      TEXT PRIMARY KEY,
  count    INTEGER NOT NULL,
  reset_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS meta (
  key   TEXT PRIMARY KEY,
  value TEXT
);
