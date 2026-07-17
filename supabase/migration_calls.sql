-- ============================================================
-- TeleVault Call System Migration
-- Production-grade schema for voice/video calling
-- ============================================================

-- ─── calls table ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.calls (
    id TEXT PRIMARY KEY, -- Format: call_<timestamp>_<random>
    call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
    call_scope TEXT NOT NULL DEFAULT 'one_to_one' CHECK (call_scope IN ('one_to_one', 'group')),
    status TEXT NOT NULL DEFAULT 'initiating' CHECK (
        status IN (
            'initiating', 'ringing', 'connecting', 'connected',
            'reconnecting', 'ended', 'missed', 'rejected',
            'cancelled', 'busy', 'failed', 'timeout'
        )
    ),
    caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    offer_sdp TEXT,
    answer_sdp TEXT,
    started_at TIMESTAMP WITH TIME ZONE,
    connected_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for quick lookup by caller
CREATE INDEX IF NOT EXISTS idx_calls_caller_id ON public.calls(caller_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON public.calls(status);
CREATE INDEX IF NOT EXISTS idx_calls_created_at ON public.calls(created_at DESC);

-- ─── call_participants table ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id TEXT NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    joined_at TIMESTAMP WITH TIME ZONE,
    left_at TIMESTAMP WITH TIME ZONE,
    is_muted BOOLEAN NOT NULL DEFAULT FALSE,
    is_video_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    is_screen_sharing BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(call_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_call_participants_call_id ON public.call_participants(call_id);
CREATE INDEX IF NOT EXISTS idx_call_participants_user_id ON public.call_participants(user_id);

-- ─── call_candidates table ─────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id TEXT NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    candidate_json TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_candidates_call_id ON public.call_candidates(call_id);
CREATE INDEX IF NOT EXISTS idx_call_candidates_lookup 
    ON public.call_candidates(call_id, sender_id, receiver_id);

-- Auto-cleanup candidates older than 5 minutes (via pg function called on select)
-- We'll handle cleanup in the app, but add an expiry column for reference
ALTER TABLE public.call_candidates 
    ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE 
    DEFAULT (NOW() + INTERVAL '5 minutes');

-- ─── call_history table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    call_id TEXT NOT NULL REFERENCES public.calls(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    other_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    group_id UUID REFERENCES public.groups(id) ON DELETE SET NULL,
    call_type TEXT NOT NULL CHECK (call_type IN ('voice', 'video')),
    call_scope TEXT NOT NULL DEFAULT 'one_to_one' CHECK (call_scope IN ('one_to_one', 'group')),
    direction TEXT NOT NULL CHECK (direction IN ('incoming', 'outgoing')),
    status TEXT NOT NULL CHECK (
        status IN (
            'ended', 'missed', 'rejected', 'cancelled',
            'busy', 'failed', 'timeout', 'connected'
        )
    ),
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_call_history_user_id ON public.call_history(user_id);
CREATE INDEX IF NOT EXISTS idx_call_history_created_at ON public.call_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_history_user_status ON public.call_history(user_id, status);

-- ─── call_devices table ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.call_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    push_token TEXT,
    last_seen_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_call_devices_user_id ON public.call_devices(user_id);

-- ─── Enable Row Level Security ─────────────────────────────────────────────────

ALTER TABLE public.calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_devices ENABLE ROW LEVEL SECURITY;

-- ─── RLS Policies: calls ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "calls_select" ON public.calls;
CREATE POLICY "calls_select" ON public.calls
    FOR SELECT TO authenticated
    USING (
        auth.uid() = caller_id OR
        EXISTS (
            SELECT 1 FROM public.call_participants
            WHERE call_id = calls.id AND user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "calls_insert" ON public.calls;
CREATE POLICY "calls_insert" ON public.calls
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "calls_update" ON public.calls;
CREATE POLICY "calls_update" ON public.calls
    FOR UPDATE TO authenticated
    USING (
        auth.uid() = caller_id OR
        EXISTS (
            SELECT 1 FROM public.call_participants
            WHERE call_id = calls.id AND user_id = auth.uid()
        )
    );

-- ─── RLS Policies: call_participants ─────────────────────────────────────────

DROP POLICY IF EXISTS "call_participants_select" ON public.call_participants;
CREATE POLICY "call_participants_select" ON public.call_participants
    FOR SELECT TO authenticated
    USING (
        auth.uid() = user_id OR
        EXISTS (
            SELECT 1 FROM public.calls
            WHERE id = call_participants.call_id AND caller_id = auth.uid()
        ) OR
        EXISTS (
            SELECT 1 FROM public.call_participants AS cp2
            WHERE cp2.call_id = call_participants.call_id AND cp2.user_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "call_participants_insert" ON public.call_participants;
CREATE POLICY "call_participants_insert" ON public.call_participants
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "call_participants_update" ON public.call_participants;
CREATE POLICY "call_participants_update" ON public.call_participants
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id);

-- ─── RLS Policies: call_candidates ───────────────────────────────────────────

DROP POLICY IF EXISTS "call_candidates_select" ON public.call_candidates;
CREATE POLICY "call_candidates_select" ON public.call_candidates
    FOR SELECT TO authenticated
    USING (
        auth.uid() = sender_id OR auth.uid() = receiver_id
    );

DROP POLICY IF EXISTS "call_candidates_insert" ON public.call_candidates;
CREATE POLICY "call_candidates_insert" ON public.call_candidates
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "call_candidates_delete" ON public.call_candidates;
CREATE POLICY "call_candidates_delete" ON public.call_candidates
    FOR DELETE TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- ─── RLS Policies: call_history ───────────────────────────────────────────────

DROP POLICY IF EXISTS "call_history_select" ON public.call_history;
CREATE POLICY "call_history_select" ON public.call_history
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "call_history_insert" ON public.call_history;
CREATE POLICY "call_history_insert" ON public.call_history
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "call_history_delete" ON public.call_history;
CREATE POLICY "call_history_delete" ON public.call_history
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);

-- ─── RLS Policies: call_devices ───────────────────────────────────────────────

DROP POLICY IF EXISTS "call_devices_all" ON public.call_devices;
CREATE POLICY "call_devices_all" ON public.call_devices
    FOR ALL TO authenticated
    USING (auth.uid() = user_id);

-- ─── Enable Realtime for signaling tables ─────────────────────────────────────

-- Enable Realtime publication for call state changes
ALTER PUBLICATION supabase_realtime ADD TABLE public.calls;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_candidates;

-- ─── Helper Functions ─────────────────────────────────────────────────────────

-- Function to clean up expired ICE candidates
CREATE OR REPLACE FUNCTION public.cleanup_expired_candidates()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    DELETE FROM public.call_candidates
    WHERE expires_at < NOW();
END;
$$;

-- Function to auto-end stale calls (calls that have been ringing > 60s)
CREATE OR REPLACE FUNCTION public.cleanup_stale_calls()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    UPDATE public.calls
    SET status = 'timeout', ended_at = NOW()
    WHERE status IN ('ringing', 'initiating', 'connecting')
    AND created_at < NOW() - INTERVAL '60 seconds';
END;
$$;

-- Function to get call with participants (RPC)
CREATE OR REPLACE FUNCTION public.get_call_with_participants(p_call_id TEXT)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    result JSON;
BEGIN
    SELECT json_build_object(
        'call', row_to_json(c.*),
        'participants', (
            SELECT json_agg(
                json_build_object(
                    'participant', row_to_json(cp.*),
                    'profile', row_to_json(p.*)
                )
            )
            FROM public.call_participants cp
            LEFT JOIN public.profiles p ON p.id = cp.user_id
            WHERE cp.call_id = p_call_id
        )
    )
    INTO result
    FROM public.calls c
    WHERE c.id = p_call_id;

    RETURN result;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_call_with_participants TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_candidates TO authenticated;

-- ─── Indexes for performance ───────────────────────────────────────────────────

-- Composite index for common call participant queries
CREATE INDEX IF NOT EXISTS idx_call_participants_composite
    ON public.call_participants(call_id, user_id, joined_at);

-- Full-text search not needed for calls, but ensure user lookups are fast
CREATE INDEX IF NOT EXISTS idx_calls_composite
    ON public.calls(caller_id, status, created_at DESC);
