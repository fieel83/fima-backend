-- APPLY requires separate approval plus reviewed read-only preflight.
-- Exact expected diff: one nullable text column, legacy backfill, one unique index.
-- Abort instead of adapting silently if the full additive rollout already ran.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF EXISTS (SELECT 1 FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'username') THEN
  RAISE EXCEPTION 'username already exists; select reviewed compatible rollout variant';
 END IF;
 IF EXISTS (SELECT 1 FROM public.users WHERE lower(email) LIKE '%@username.fimamacro.local'
  AND split_part(lower(email), '@', 1) !~ '^[a-z0-9_]{3,24}$') THEN
  RAISE EXCEPTION 'invalid legacy username; requires preservation review';
 END IF;
END $$;
ALTER TABLE public.users ADD COLUMN username TEXT;
UPDATE public.users SET username = split_part(lower(email), '@', 1)
 WHERE lower(email) LIKE '%@username.fimamacro.local';
CREATE UNIQUE INDEX users_username_key ON public.users(username);
COMMIT;
