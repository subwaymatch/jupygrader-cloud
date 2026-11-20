-- Rate limits are kept in the database, so they hold across Worker instances. One row per key
-- (who and what), counting requests until reset_at (milliseconds since 1970).
create table rate_limit (
  key text primary key,
  count integer not null,
  reset_at integer not null
);
create index rate_limit_reset_idx on rate_limit (reset_at);

-- Links emailed to confirm an address. Only the SHA-256 of the token is stored.
create table email_token (
  token_hash text primary key,
  user_id text not null references "user" ("id") on delete cascade,
  -- confirm: the person owns their account's address. change: switch the account to `email`.
  kind text not null check (kind in ('confirm', 'change')),
  email text not null,
  created_at text not null,
  expires_at text not null
);
create index email_token_user_idx on email_token (user_id, kind);

-- user.status gains 'disabled': an account an administrator deactivated. It can't sign in.

-- From here on, only people with a confirmed address are added to a course straight away when
-- they're invited; everyone else gets an invitation link by email. Accounts that already showed
-- they receive mail at their address, by accepting an invitation sent to it, count as confirmed,
-- and so do administrators.
update "user" set "emailVerified" = 1
 where "emailVerified" = 0 and status = 'active'
   and (isAdmin = 1
        or exists (select 1 from invitation i
                    where i.accepted_by = "user".id and i.status = 'accepted' and lower(i.email) = lower("user".email)));
