-- The file students started from (a template notebook or starter code), as JSON {key, name, size, type}.
-- Its code is left out when submissions are compared with each other, so work that only shares the
-- starter isn't flagged as a close match.
alter table assignment add column starter_file text;
