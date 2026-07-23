-- ----------------------------------------------------
-- TeleVault Admin RLS Policies & Analytics Migration
-- Run this in your Supabase SQL Editor to enable overall app analytics for Admin accounts
-- ----------------------------------------------------

-- 1. PROFILES: Allow admins to update other users' profile roles (e.g. for ban/suspend)
DROP POLICY IF EXISTS "Allow users to update their own profile" ON public.profiles;
CREATE POLICY "Allow users to update their own profile" ON public.profiles
    FOR UPDATE TO authenticated USING (
        auth.uid() = id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- 2. FILES: Allow admins to count/view all sync files and delete (purge) reported user content
DROP POLICY IF EXISTS "Allow users to select their own files" ON public.files;
CREATE POLICY "Allow users to select their own files" ON public.files
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Allow users to delete their own files" ON public.files;
CREATE POLICY "Allow users to delete their own files" ON public.files
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- 3. FOLDERS: Allow admins to count/view all folders
DROP POLICY IF EXISTS "Allow users to select their own folders" ON public.folders;
CREATE POLICY "Allow users to select their own folders" ON public.folders
    FOR SELECT TO authenticated USING (
        auth.uid() = user_id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Allow users to delete their own folders" ON public.folders;
CREATE POLICY "Allow users to delete their own folders" ON public.folders
    FOR DELETE TO authenticated USING (
        auth.uid() = user_id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- 4. CONVERSATIONS: Allow admins to count all chats/conversations for global telemetry
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy" ON public.conversations
    FOR SELECT TO authenticated USING (
        auth.uid() = participant_a OR 
        auth.uid() = participant_b OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- 5. GROUPS: Allow admins to count all groups
DROP POLICY IF EXISTS "groups_select" ON public.groups;
CREATE POLICY "groups_select" ON public.groups
    FOR SELECT TO authenticated USING (
        auth.uid() = creator_id OR 
        EXISTS (SELECT 1 FROM public.group_members WHERE group_id = id AND user_id = auth.uid()) OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

-- 6. LARGE FILES: Allow admins to see overall large files sync statistics
DROP POLICY IF EXISTS "Allow users to select their own large_files" ON public.large_files;
CREATE POLICY "Allow users to select their own large_files" ON public.large_files
    FOR SELECT TO authenticated USING (
        auth.uid() = owner_id OR
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Allow users to select chunks of their own large_files" ON public.large_file_chunks;
CREATE POLICY "Allow users to select chunks of their own large_files" ON public.large_file_chunks
    FOR SELECT TO authenticated USING (
        EXISTS (
            SELECT 1 FROM public.large_files
            WHERE public.large_files.id = large_file_chunks.large_file_id
              AND (
                  public.large_files.owner_id = auth.uid() OR
                  (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
              )
        )
    );

-- 7. AUDIT LOGS: Create missing table for administrative telemetry and audit trials
CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin TEXT NOT NULL,
    action TEXT NOT NULL,
    target TEXT NOT NULL,
    status TEXT NOT NULL,
    ip TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on audit logs
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Allow only admins to select and insert into audit logs
DROP POLICY IF EXISTS "Allow admins to select audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins to select audit logs" ON public.audit_logs
    FOR SELECT TO authenticated USING (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );

DROP POLICY IF EXISTS "Allow admins to insert audit logs" ON public.audit_logs;
CREATE POLICY "Allow admins to insert audit logs" ON public.audit_logs
    FOR INSERT TO authenticated WITH CHECK (
        (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin'
    );
