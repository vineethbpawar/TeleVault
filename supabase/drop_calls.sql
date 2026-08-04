-- ============================================================
-- TeleVault: Drop Call System (FIXED)
-- Run this in Supabase SQL Editor
-- ============================================================

-- ─── 1. Remove from Realtime publication (safe DO blocks) ────────────────────
-- PostgreSQL does not support IF EXISTS on ALTER PUBLICATION DROP TABLE,
-- so we catch the error if the table is not in the publication.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.calls;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.call_participants;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime DROP TABLE public.call_candidates;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- ─── 2. Drop RLS Policies ────────────────────────────────────────────────────

-- calls
DROP POLICY IF EXISTS "calls_select" ON public.calls;
DROP POLICY IF EXISTS "calls_insert" ON public.calls;
DROP POLICY IF EXISTS "calls_update" ON public.calls;

-- call_participants
DROP POLICY IF EXISTS "call_participants_select" ON public.call_participants;
DROP POLICY IF EXISTS "call_participants_insert" ON public.call_participants;
DROP POLICY IF EXISTS "call_participants_update" ON public.call_participants;

-- call_candidates
DROP POLICY IF EXISTS "call_candidates_select" ON public.call_candidates;
DROP POLICY IF EXISTS "call_candidates_insert" ON public.call_candidates;
DROP POLICY IF EXISTS "call_candidates_delete" ON public.call_candidates;

-- call_history
DROP POLICY IF EXISTS "call_history_select" ON public.call_history;
DROP POLICY IF EXISTS "call_history_insert" ON public.call_history;
DROP POLICY IF EXISTS "call_history_delete" ON public.call_history;

-- call_devices
DROP POLICY IF EXISTS "call_devices_all" ON public.call_devices;

-- ─── 3. Drop Helper Functions ─────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_call_with_participants(TEXT);
DROP FUNCTION IF EXISTS public.cleanup_expired_candidates();
DROP FUNCTION IF EXISTS public.cleanup_stale_calls();

-- ─── 4. Drop Indexes ──────────────────────────────────────────────────────────

DROP INDEX IF EXISTS public.idx_calls_caller_id;
DROP INDEX IF EXISTS public.idx_calls_status;
DROP INDEX IF EXISTS public.idx_calls_created_at;
DROP INDEX IF EXISTS public.idx_calls_composite;

DROP INDEX IF EXISTS public.idx_call_participants_call_id;
DROP INDEX IF EXISTS public.idx_call_participants_user_id;
DROP INDEX IF EXISTS public.idx_call_participants_composite;

DROP INDEX IF EXISTS public.idx_call_candidates_call_id;
DROP INDEX IF EXISTS public.idx_call_candidates_lookup;

DROP INDEX IF EXISTS public.idx_call_history_user_id;
DROP INDEX IF EXISTS public.idx_call_history_created_at;
DROP INDEX IF EXISTS public.idx_call_history_user_status;

DROP INDEX IF EXISTS public.idx_call_devices_user_id;

-- ─── 5. Drop Tables (dependents first) ───────────────────────────────────────

DROP TABLE IF EXISTS public.call_candidates  CASCADE;
DROP TABLE IF EXISTS public.call_participants CASCADE;
DROP TABLE IF EXISTS public.call_history      CASCADE;
DROP TABLE IF EXISTS public.call_devices      CASCADE;
DROP TABLE IF EXISTS public.calls             CASCADE;

-- ─── Done ────────────────────────────────────────────────────────────────────
