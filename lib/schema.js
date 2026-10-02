// Same as db/schema.sql, as statements the /setup page can run.
export const SCHEMA = [
 "CREATE TABLE IF NOT EXISTS questions ( id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, norm_hash TEXT NOT NULL UNIQUE, topic TEXT NOT NULL, subtopic TEXT, level INTEGER NOT NULL CHECK (level BETWEEN 1 AND 10), level_reason TEXT, options TEXT, correct_index INTEGER, answer REAL, answer_text TEXT NOT NULL, distractors TEXT, solution TEXT NOT NULL, quality REAL, quality_detail TEXT, source TEXT NOT NULL, parent_id INTEGER, variations_made INTEGER NOT NULL DEFAULT 0, attempts INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, flags INTEGER NOT NULL DEFAULT 0, hidden INTEGER NOT NULL DEFAULT 0, pattern TEXT, status TEXT NOT NULL DEFAULT 'live', checks TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')) )",
 "CREATE INDEX IF NOT EXISTS idx_q_serve ON questions (hidden, level, topic)",
 "CREATE INDEX IF NOT EXISTS idx_q_topic ON questions (topic, hidden)",
 "CREATE INDEX IF NOT EXISTS idx_q_pattern ON questions (status, pattern, level)",
 "CREATE TABLE IF NOT EXISTS rate_limits ( key TEXT PRIMARY KEY, count INTEGER NOT NULL, reset_at INTEGER NOT NULL )"
];

// Upgrades for databases created before question types were added. Each runs once; errors mean "already done".
export const MIGRATIONS = [
 "ALTER TABLE questions ADD COLUMN pattern TEXT",
 "ALTER TABLE questions ADD COLUMN status TEXT NOT NULL DEFAULT 'live'",
 "ALTER TABLE questions ADD COLUMN checks TEXT"
];
