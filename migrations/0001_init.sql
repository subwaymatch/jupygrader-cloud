-- better-auth tables (generated with better-auth's migration compiler for SQLite).
-- Dates are stored as ISO 8601 strings and booleans as 0/1.
create table "user" (
  "id" text not null primary key,
  "name" text not null,
  "email" text not null unique,
  "emailVerified" integer not null default 0,
  "image" text,
  "createdAt" date not null,
  "updatedAt" date not null,
  "isAdmin" integer not null default 0,
  -- active: can sign in. pending: instructor account waiting for an admin.
  "status" text not null default 'pending',
  "notifyEmail" integer not null default 1
);

create table "session" (
  "id" text not null primary key,
  "expiresAt" date not null,
  "token" text not null unique,
  "createdAt" date not null,
  "updatedAt" date not null,
  "ipAddress" text,
  "userAgent" text,
  "userId" text not null references "user" ("id") on delete cascade
);

create table "account" (
  "id" text not null primary key,
  "accountId" text not null,
  "providerId" text not null,
  "userId" text not null references "user" ("id") on delete cascade,
  "accessToken" text,
  "refreshToken" text,
  "idToken" text,
  "accessTokenExpiresAt" date,
  "refreshTokenExpiresAt" date,
  "scope" text,
  "password" text,
  "createdAt" date not null,
  "updatedAt" date not null
);

create table "verification" (
  "id" text not null primary key,
  "identifier" text not null,
  "value" text not null,
  "expiresAt" date not null,
  "createdAt" date not null,
  "updatedAt" date not null
);

create index "session_userId_idx" on "session" ("userId");
create index "account_userId_idx" on "account" ("userId");
create index "verification_identifier_idx" on "verification" ("identifier");

-- App tables. Timestamps are ISO 8601 strings, calendar dates are YYYY-MM-DD.
create table course (
  id text primary key,
  name text not null,
  start_date text,
  -- Always set. When the teacher leaves it blank it is one year after the start (auto_end = 1).
  end_date text not null,
  auto_end integer not null default 0,
  created_by text references "user" ("id") on delete set null,
  created_at text not null,
  updated_at text not null
);

create table enrollment (
  course_id text not null references course (id) on delete cascade,
  user_id text not null references "user" ("id") on delete cascade,
  role text not null check (role in ('Teacher', 'Grader')),
  created_at text not null,
  primary key (course_id, user_id)
);
create index enrollment_user_idx on enrollment (user_id);

create table invitation (
  id text primary key,
  token text not null unique,
  email text not null,
  course_id text not null references course (id) on delete cascade,
  role text not null check (role in ('Teacher', 'Grader')),
  message text not null default '',
  invited_by text references "user" ("id") on delete set null,
  -- pending | accepted | revoked. Expiry is derived from expires_at.
  status text not null default 'pending',
  created_at text not null,
  sent_at text not null,
  expires_at text not null,
  accepted_at text,
  accepted_by text
);
create index invitation_course_idx on invitation (course_id);
create index invitation_email_idx on invitation (email);

create table assignment (
  id text primary key,
  course_id text not null references course (id) on delete cascade,
  title text not null,
  position real not null default 0,
  points real not null default 100,
  task_text text not null default '',
  -- JSON {key, name, size, type, text} for an uploaded instructions document.
  task_file text,
  -- none | paste | manual
  rubric_method text not null default 'none',
  rubric_source text not null default '',
  rubric_file text,
  -- JSON [{name, pts, desc}]
  rubric_rows text not null default '[]',
  style text not null default 'balanced',
  tone text not null default 'neutral',
  length text not null default 'standard',
  notes text not null default '',
  -- Bumped when the rubric, points or grading style change, so older grades show as outdated.
  version integer not null default 1,
  created_by text references "user" ("id") on delete set null,
  created_at text not null,
  updated_at text not null
);
create index assignment_course_idx on assignment (course_id, position);

create table answer_key (
  id text primary key,
  assignment_id text not null references assignment (id) on delete cascade,
  name text not null,
  size integer not null,
  content_type text not null default 'application/octet-stream',
  r2_key text not null,
  -- Extracted text sent to the AI (truncated).
  text_content text,
  created_at text not null
);
create index answer_key_assignment_idx on answer_key (assignment_id);

create table submission (
  id text primary key,
  assignment_id text not null references assignment (id) on delete cascade,
  file_name text not null,
  student text not null default '',
  student_set integer not null default 0,
  sha256 text not null,
  size integer not null,
  content_type text not null default 'application/octet-stream',
  -- notebook | code | doc | data | image | other
  kind text not null,
  r2_key text,
  -- queued | grading | graded | failed | skipped | cancelled
  status text not null,
  note text not null default '',
  attempts integer not null default 0,
  uploaded_by text references "user" ("id") on delete set null,
  uploaded_at text not null,
  -- Files uploaded or regraded together; used for the "batch finished" email.
  batch_id text,
  queued_at text,
  started_at text,
  graded_at text,
  score real,
  ai_score real,
  overridden integer not null default 0,
  -- JSON {criteria, comments, summary, confidence, lowReason}
  result text,
  -- JSON {rubricVersion, style, tone, length, model, gradedAt}
  graded_meta text,
  -- JSON {input, cached, output, reasoning}
  usage text,
  cost_usd real not null default 0,
  -- JSON {id, file, pct}: a close match with another submission in the assignment.
  near_of text,
  -- JSON number[]: MinHash signature of the file's text, for near-duplicate checks.
  minhash text,
  reviewed integer not null default 0,
  reviewed_by text,
  reviewed_at text,
  share_token text unique,
  share_off integer not null default 0,
  -- JSON [{who, at, text}]
  history text not null default '[]'
);
create index submission_assignment_idx on submission (assignment_id, uploaded_at);
create index submission_status_idx on submission (status, queued_at);
create index submission_hash_idx on submission (assignment_id, sha256);
create index submission_graded_idx on submission (graded_at);
create index submission_batch_idx on submission (batch_id, status);

-- One row per batch whose summary email was sent, so it is sent only once.
create table batch_notice (
  batch_id text primary key,
  at text not null
);

-- Fingerprints of deleted submissions, so duplicate checks still work after retention cleanup.
create table retained_hash (
  assignment_id text not null references assignment (id) on delete cascade,
  sha256 text not null,
  file_name text not null,
  deleted_at text not null,
  primary key (assignment_id, sha256)
);

create table activity (
  id text primary key,
  at text not null,
  user_id text,
  user_name text not null default '',
  course_id text,
  -- grading | grades | rubrics | people | exports | sharing | settings
  type text not null,
  text text not null
);
create index activity_at_idx on activity (at);
create index activity_course_idx on activity (course_id, at);
create index activity_user_idx on activity (user_id, at);

create table ai_usage (
  id text primary key,
  at text not null,
  -- grade | itemize | draft
  kind text not null,
  submission_id text,
  assignment_id text,
  course_id text,
  model text not null,
  input_tokens integer not null default 0,
  cached_tokens integer not null default 0,
  output_tokens integer not null default 0,
  reasoning_tokens integer not null default 0,
  cost_usd real not null default 0
);
create index ai_usage_at_idx on ai_usage (at);

create table setting (
  key text primary key,
  value text not null,
  updated_at text not null
);
