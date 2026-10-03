// Same as db/schema.sql, as statements the /setup page can run.
export const SCHEMA = [
 "CREATE TABLE IF NOT EXISTS questions ( id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, norm_hash TEXT NOT NULL UNIQUE, topic TEXT NOT NULL, subtopic TEXT, level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10), level_reason TEXT, options TEXT, correct_index INTEGER, answer REAL, answer_text TEXT NOT NULL, distractors TEXT, solution TEXT NOT NULL, quality REAL, quality_detail TEXT, source TEXT NOT NULL, parent_id INTEGER, variations_made INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, pattern TEXT, status TEXT NOT NULL DEFAULT 'live', checks TEXT, rnd REAL, template_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')) )",
 "CREATE INDEX IF NOT EXISTS idx_q_serve ON questions (hidden, level, topic)",
 "CREATE INDEX IF NOT EXISTS idx_q_topic ON questions (topic, hidden)",
 "CREATE INDEX IF NOT EXISTS idx_q_pattern ON questions (status, pattern, level)",
 "CREATE INDEX IF NOT EXISTS idx_q_rnd ON questions (status, pattern, level, rnd)",
 "CREATE INDEX IF NOT EXISTS idx_q_rnd_level ON questions (status, level, rnd)",
 "CREATE TABLE IF NOT EXISTS templates ( id INTEGER PRIMARY KEY AUTOINCREMENT, pattern TEXT NOT NULL, topic TEXT NOT NULL, level INTEGER NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'live', made INTEGER NOT NULL DEFAULT 0, source_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')) )",
 "CREATE INDEX IF NOT EXISTS idx_t_pattern ON templates (status, pattern, level)",
 "CREATE TABLE IF NOT EXISTS upload_cache ( hash TEXT PRIMARY KEY, question_id INTEGER NOT NULL )",
 "CREATE VIRTUAL TABLE IF NOT EXISTS qsearch USING fts5(text)",
 "CREATE TABLE IF NOT EXISTS rate_limits ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL )",
 "CREATE TABLE IF NOT EXISTS meta ( key TEXT PRIMARY KEY, value TEXT )"
];

// Upgrades for older databases. Each runs once; errors mean "already done".
export const MIGRATIONS = [
 "ALTER TABLE questions ADD COLUMN pattern TEXT",
 "ALTER TABLE questions ADD COLUMN status TEXT NOT NULL DEFAULT 'live'",
 "ALTER TABLE questions ADD COLUMN checks TEXT",
 "ALTER TABLE questions ADD COLUMN rnd REAL",
 "ALTER TABLE questions ADD COLUMN template_id INTEGER"
];

// Housekeeping run after loading rows: random keys for fast picks, and the full-text index.
export const AFTER_LOAD = [
 "UPDATE questions SET rnd = abs(random()) / 9223372036854775807.0 WHERE rnd IS NULL",
 "INSERT INTO qsearch (rowid, text) SELECT id, text FROM questions WHERE id NOT IN (SELECT rowid FROM qsearch)"
];
