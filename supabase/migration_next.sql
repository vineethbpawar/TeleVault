-- PART 1: ALTER EXISTING TABLES

-- Alter profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user',
ADD COLUMN IF NOT EXISTS privacy_message_me TEXT NOT NULL DEFAULT 'friends', -- 'friends', 'everyone'
ADD COLUMN IF NOT EXISTS privacy_send_snaps TEXT NOT NULL DEFAULT 'friends', -- 'friends', 'everyone'
ADD COLUMN IF NOT EXISTS privacy_view_stories TEXT NOT NULL DEFAULT 'friends', -- 'friends', 'everyone'
ADD COLUMN IF NOT EXISTS privacy_show_online BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS privacy_read_receipts BOOLEAN NOT NULL DEFAULT TRUE,
ADD COLUMN IF NOT EXISTS privacy_story_receipts BOOLEAN NOT NULL DEFAULT TRUE;

-- Alter files table
ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS memory_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
ADD COLUMN IF NOT EXISTS caption TEXT;


-- PART 2: CREATE NEW TABLES

-- Create friendships table
CREATE TABLE IF NOT EXISTS public.friendships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    user_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_a, user_b)
);

-- Create friend_requests table
CREATE TABLE IF NOT EXISTS public.friend_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'accepted', 'rejected'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(sender_id, receiver_id)
);

-- Create user_blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    blocker_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    blocked_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(blocker_id, blocked_id)
);

-- Create user_reports table
CREATE TABLE IF NOT EXISTS public.user_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reported_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'pending', -- 'pending', 'reviewed', 'dismissed'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create user_push_tokens table
CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    type TEXT NOT NULL, -- 'message', 'snap', 'friend_request', 'story_view', 'upload_complete'
    data JSONB DEFAULT '{}'::JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create groups table
CREATE TABLE IF NOT EXISTS public.groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    creator_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group_members table
CREATE TABLE IF NOT EXISTS public.group_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member', -- 'admin', 'member'
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, user_id)
);

-- Create group_messages table
CREATE TABLE IF NOT EXISTS public.group_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'snap'
    message_text TEXT,
    snap_id UUID REFERENCES public.snaps(id) ON DELETE SET NULL,
    telegram_message_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create group_snaps table
CREATE TABLE IF NOT EXISTS public.group_snaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id UUID NOT NULL REFERENCES public.groups(id) ON DELETE CASCADE,
    snap_id UUID NOT NULL REFERENCES public.snaps(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(group_id, snap_id)
);


-- PART 3: ENABLE RLS & POLICIES

-- Enable RLS
ALTER TABLE public.friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.friend_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_snaps ENABLE ROW LEVEL SECURITY;

-- 1. friendships policies
DROP POLICY IF EXISTS "friendships_select" ON public.friendships;
CREATE POLICY "friendships_select" ON public.friendships
    FOR SELECT TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "friendships_insert" ON public.friendships;
CREATE POLICY "friendships_insert" ON public.friendships
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_a OR auth.uid() = user_b);

DROP POLICY IF EXISTS "friendships_delete" ON public.friendships;
CREATE POLICY "friendships_delete" ON public.friendships
    FOR DELETE TO authenticated USING (auth.uid() = user_a OR auth.uid() = user_b);

-- 2. friend_requests policies
DROP POLICY IF EXISTS "friend_requests_select" ON public.friend_requests;
CREATE POLICY "friend_requests_select" ON public.friend_requests
    FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "friend_requests_insert" ON public.friend_requests;
CREATE POLICY "friend_requests_insert" ON public.friend_requests
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "friend_requests_update" ON public.friend_requests;
CREATE POLICY "friend_requests_update" ON public.friend_requests
    FOR UPDATE TO authenticated USING (auth.uid() = receiver_id OR auth.uid() = sender_id);

DROP POLICY IF EXISTS "friend_requests_delete" ON public.friend_requests;
CREATE POLICY "friend_requests_delete" ON public.friend_requests
    FOR DELETE TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 3. user_blocks policies
DROP POLICY IF EXISTS "user_blocks_select" ON public.user_blocks;
CREATE POLICY "user_blocks_select" ON public.user_blocks
    FOR SELECT TO authenticated USING (auth.uid() = blocker_id OR auth.uid() = blocked_id);

DROP POLICY IF EXISTS "user_blocks_insert" ON public.user_blocks;
CREATE POLICY "user_blocks_insert" ON public.user_blocks
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "user_blocks_delete" ON public.user_blocks;
CREATE POLICY "user_blocks_delete" ON public.user_blocks
    FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- 4. user_reports policies
DROP POLICY IF EXISTS "user_reports_select" ON public.user_reports;
CREATE POLICY "user_reports_select" ON public.user_reports
    FOR SELECT TO authenticated USING (
        auth.uid() = reporter_id OR 
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "user_reports_insert" ON public.user_reports;
CREATE POLICY "user_reports_insert" ON public.user_reports
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "user_reports_update" ON public.user_reports;
CREATE POLICY "user_reports_update" ON public.user_reports
    FOR UPDATE TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 5. user_push_tokens policies
DROP POLICY IF EXISTS "user_push_tokens_all" ON public.user_push_tokens;
CREATE POLICY "user_push_tokens_all" ON public.user_push_tokens
    FOR ALL TO authenticated USING (auth.uid() = user_id);

-- 6. notifications policies
DROP POLICY IF EXISTS "notifications_select" ON public.notifications;
CREATE POLICY "notifications_select" ON public.notifications
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_insert" ON public.notifications;
CREATE POLICY "notifications_insert" ON public.notifications
    FOR INSERT TO authenticated WITH CHECK (TRUE); -- Allow sending notifications to other users

DROP POLICY IF EXISTS "notifications_update" ON public.notifications;
CREATE POLICY "notifications_update" ON public.notifications
    FOR UPDATE TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notifications_delete" ON public.notifications;
CREATE POLICY "notifications_delete" ON public.notifications
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- 7. groups policies
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups
    FOR SELECT TO authenticated USING (
        auth.uid() = creator_id OR 
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "groups_insert" ON public.groups;
CREATE POLICY "groups_insert" ON public.groups
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = creator_id);

DROP POLICY IF EXISTS "groups_update" ON public.groups;
CREATE POLICY "groups_update" ON public.groups
    FOR UPDATE TO authenticated USING (
        auth.uid() = creator_id OR 
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid() AND role = 'admin')
    );

DROP POLICY IF EXISTS "groups_delete" ON public.groups;
CREATE POLICY "groups_delete" ON public.groups
    FOR DELETE TO authenticated USING (auth.uid() = creator_id);

-- 8. group_members policies
DROP POLICY IF EXISTS "group_members_select" ON public.group_members;
CREATE POLICY "group_members_select" ON public.group_members
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id AND user_id = auth.uid()) OR
        EXISTS (SELECT 1 FROM public.groups WHERE id = group_members.group_id AND creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_members_insert" ON public.group_members;
CREATE POLICY "group_members_insert" ON public.group_members
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin') OR
        EXISTS (SELECT 1 FROM public.groups WHERE id = group_members.group_id AND creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_members_update" ON public.group_members;
CREATE POLICY "group_members_update" ON public.group_members
    FOR UPDATE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin') OR
        EXISTS (SELECT 1 FROM public.groups WHERE id = group_members.group_id AND creator_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_members_delete" ON public.group_members;
CREATE POLICY "group_members_delete" ON public.group_members
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id OR
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_members.group_id AND user_id = auth.uid() AND role = 'admin') OR
        EXISTS (SELECT 1 FROM public.groups WHERE id = group_members.group_id AND creator_id = auth.uid())
    );

-- 9. group_messages policies
DROP POLICY IF EXISTS "group_messages_select" ON public.group_messages;
CREATE POLICY "group_messages_select" ON public.group_messages
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_messages_insert" ON public.group_messages;
CREATE POLICY "group_messages_insert" ON public.group_messages
    FOR INSERT TO authenticated WITH CHECK (
        auth.uid() = sender_id AND
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_messages_delete" ON public.group_messages;
CREATE POLICY "group_messages_delete" ON public.group_messages
    FOR DELETE TO authenticated USING (
        auth.uid() = sender_id OR 
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_messages.group_id AND user_id = auth.uid() AND role = 'admin')
    );

-- 10. group_snaps policies
DROP POLICY IF EXISTS "group_snaps_select" ON public.group_snaps;
CREATE POLICY "group_snaps_select" ON public.group_snaps
    FOR SELECT TO authenticated USING (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_snaps.group_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_snaps_insert" ON public.group_snaps;
CREATE POLICY "group_snaps_insert" ON public.group_snaps
    FOR INSERT TO authenticated WITH CHECK (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_snaps.group_id AND user_id = auth.uid())
    );

DROP POLICY IF EXISTS "group_snaps_delete" ON public.group_snaps;
CREATE POLICY "group_snaps_delete" ON public.group_snaps
    FOR DELETE TO authenticated USING (
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = group_snaps.group_id AND user_id = auth.uid() AND role = 'admin')
    );
