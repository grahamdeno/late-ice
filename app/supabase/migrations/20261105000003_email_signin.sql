-- Sign-in moves from SMS codes to emailed 6-digit codes.
-- users.email becomes the identifier (always stored lowercase). users.phone stays as an
-- optional contact field: it loses NOT NULL but keeps its values and its unique constraint.
alter table users add column if not exists email text;
alter table users alter column phone drop not null;
alter table users add constraint users_email_key unique (email);
alter table users add constraint users_email_lowercase check (email is null or email = lower(email));
-- Every account needs one way to identify it.
alter table users add constraint users_has_identifier check (email is not null or phone is not null);

-- New column on a locked table: keep the browser key out.
revoke all on public.users from anon, authenticated;
