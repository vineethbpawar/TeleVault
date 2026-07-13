-- Enable Realtime for specific public tables safely
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime'
    ) THEN
        -- Add public.chat_messages
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'chat_messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.chat_messages;
        END IF;

        -- Add public.conversations
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'conversations'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
        END IF;

        -- Add public.notifications
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
        END IF;

        -- Add public.snaps
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'snaps'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.snaps;
        END IF;

        -- Add public.group_messages
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'group_messages'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
        END IF;

        -- Add public.friend_requests
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friend_requests'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.friend_requests;
        END IF;

        -- Add public.friendships
        IF NOT EXISTS (
            SELECT 1 FROM pg_publication_tables 
            WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'friendships'
        ) THEN
            ALTER PUBLICATION supabase_realtime ADD TABLE public.friendships;
        END IF;
    END IF;
END $$;

-- Enable Row Level Security (RLS) on crucial tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Conversations RLS policies
DROP POLICY IF EXISTS "Allow user to SELECT their own conversations" ON public.conversations;
CREATE POLICY "Allow user to SELECT their own conversations"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "Allow user to INSERT their own conversations" ON public.conversations;
CREATE POLICY "Allow user to INSERT their own conversations"
    ON public.conversations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "Allow user to UPDATE their own conversations" ON public.conversations;
CREATE POLICY "Allow user to UPDATE their own conversations"
    ON public.conversations FOR UPDATE
    TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b)
    WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

-- Chat Messages RLS policies
DROP POLICY IF EXISTS "Allow sender or receiver to SELECT messages" ON public.chat_messages;
CREATE POLICY "Allow sender or receiver to SELECT messages"
    ON public.chat_messages FOR SELECT
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "Allow sender to INSERT messages" ON public.chat_messages;
CREATE POLICY "Allow sender to INSERT messages"
    ON public.chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "Allow sender or receiver to UPDATE messages" ON public.chat_messages;
CREATE POLICY "Allow sender or receiver to UPDATE messages"
    ON public.chat_messages FOR UPDATE
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id)
    WITH CHECK (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Allow deletion of messages
DROP POLICY IF EXISTS "Allow sender to DELETE messages" ON public.chat_messages;
CREATE POLICY "Allow sender to DELETE messages"
    ON public.chat_messages FOR DELETE
    TO authenticated
    USING (auth.uid() = sender_id);

-- Allow deletion of snaps
DROP POLICY IF EXISTS "Allow sender or receiver to DELETE snaps" ON public.snaps;
CREATE POLICY "Allow sender or receiver to DELETE snaps"
    ON public.snaps FOR DELETE
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- Notifications RLS policies
DROP POLICY IF EXISTS "Allow user to SELECT their own notifications" ON public.notifications;
CREATE POLICY "Allow user to SELECT their own notifications"
    ON public.notifications FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Allow user to UPDATE their own notifications" ON public.notifications;
CREATE POLICY "Allow user to UPDATE their own notifications"
    ON public.notifications FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
