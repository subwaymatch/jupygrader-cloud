-- Canvas LMS: each person's Canvas access token (encrypted, like the AI API key), and links from
-- courses, assignments and files to their Canvas counterparts.
create table canvas_token (
  user_id text primary key references "user" ("id") on delete cascade,
  token text not null,
  -- The Canvas address the token was checked against. A token only works on that Canvas.
  base_url text not null,
  canvas_user_id text not null,
  canvas_name text not null,
  created_at text not null
);

alter table course add column canvas_course_id text;
alter table course add column canvas_course_name text;

alter table assignment add column canvas_assignment_id text;
alter table assignment add column canvas_assignment_name text;
alter table assignment add column canvas_points real;

-- Imported files keep the student's Canvas user id, the attachment and the submission attempt
-- they came from, and what was last posted back to Canvas.
alter table submission add column canvas_user_id text;
alter table submission add column canvas_attachment_id text;
alter table submission add column canvas_attempt integer;
alter table submission add column canvas_posted_at text;
alter table submission add column canvas_posted_score real;
create index submission_canvas_idx on submission (assignment_id, canvas_user_id);
