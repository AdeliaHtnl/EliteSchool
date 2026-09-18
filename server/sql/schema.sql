-- EliteSchool runtime schema (Neon PostgreSQL)
-- Catalog quizzes/questions remain in data/seeds JSON files.

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ('STUDENT', 'TEACHER')),
  name TEXT NOT NULL,
  code TEXT,
  password_hash TEXT,
  group_name TEXT,
  teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  language TEXT CHECK (language IS NULL OR language IN ('ru', 'en')),
  enrollment_level TEXT CHECK (enrollment_level IS NULL OR enrollment_level IN ('BEGINNER', 'INTERMEDIATE', 'ADVANCED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_active_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE UNIQUE INDEX IF NOT EXISTS users_student_name_lower_uidx
  ON users (lower(name)) WHERE role = 'STUDENT';
CREATE INDEX IF NOT EXISTS users_teacher_id_idx ON users (teacher_id);
CREATE INDEX IF NOT EXISTS users_language_idx ON users (language);

CREATE TABLE IF NOT EXISTS auth_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS auth_sessions_token_idx ON auth_sessions (token);
CREATE INDEX IF NOT EXISTS auth_sessions_user_id_idx ON auth_sessions (user_id);

CREATE TABLE IF NOT EXISTS assignments (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL CHECK (language IN ('ru', 'en')),
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  title TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS assignments_teacher_lang_idx ON assignments (teacher_id, language);

CREATE TABLE IF NOT EXISTS assignment_students (
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS flow_sessions (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, student_id)
);

CREATE TABLE IF NOT EXISTS retellings (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT CHECK (language IS NULL OR language IN ('ru', 'en')),
  status TEXT NOT NULL DEFAULT 'SUBMITTED',
  media_key TEXT,
  media_path TEXT,
  mime_type TEXT,
  media_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  submitted_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS retellings_student_idx ON retellings (student_id);
CREATE INDEX IF NOT EXISTS retellings_assignment_idx ON retellings (assignment_id);
CREATE INDEX IF NOT EXISTS retellings_language_idx ON retellings (language);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS quiz_attempts (
  id TEXT PRIMARY KEY,
  student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  quiz_id TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  language TEXT CHECK (language IS NULL OR language IN ('ru', 'en')),
  status TEXT NOT NULL DEFAULT 'IN_PROGRESS',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS quiz_attempts_student_quiz_idx ON quiz_attempts (student_id, quiz_id);
CREATE INDEX IF NOT EXISTS quiz_attempts_subject_idx ON quiz_attempts (subject_id);

CREATE TABLE IF NOT EXISTS lessons (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  language TEXT NOT NULL,
  section TEXT NOT NULL DEFAULT 'VIDEO',
  title TEXT NOT NULL DEFAULT '',
  file_key TEXT,
  file_path TEXT,
  mime_type TEXT,
  media_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  data JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX IF NOT EXISTS lessons_teacher_lang_idx ON lessons (teacher_id, language);
CREATE INDEX IF NOT EXISTS lessons_section_idx ON lessons (section);

-- Existing DBs created before media_base64 column
ALTER TABLE retellings ADD COLUMN IF NOT EXISTS media_base64 TEXT;
ALTER TABLE lessons ADD COLUMN IF NOT EXISTS media_base64 TEXT;
