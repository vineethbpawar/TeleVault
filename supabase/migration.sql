-- PART 1: UPDATE PROFILES TABLE
-- Add missing columns to public.profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS full_name TEXT,
ADD COLUMN IF NOT EXISTS username TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS avatar_url TEXT,
ADD COLUMN IF NOT EXISTS bio TEXT,
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Create unique index on username if not exists
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_idx ON public.profiles(username);


-- PART 3: CHAT TABLES
-- Create conversations table
CREATE TABLE IF NOT EXISTS public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  participant_a UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  participant_b UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  telegram_thread_key TEXT NULL,
  last_message_preview TEXT NULL,
  last_message_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(participant_a, participant_b)
);

-- Create chat_messages table
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  message_type TEXT NOT NULL DEFAULT 'text', -- 'text', 'snap'
  message_text TEXT NULL,
  telegram_message_id TEXT NULL,
  snap_id UUID NULL,
  status TEXT NOT NULL DEFAULT 'sent', -- 'sent', 'delivered', 'read'
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);


-- PART 4: SNAP / STORY TABLES
-- Create snaps table
CREATE TABLE IF NOT EXISTS public.snaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  receiver_id UUID NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID NULL REFERENCES public.conversations(id) ON DELETE SET NULL,
  snap_type TEXT NOT NULL DEFAULT 'direct', -- 'direct', 'story'
  media_type TEXT NOT NULL, -- 'image', 'video'
  media_url TEXT NULL,
  telegram_file_id TEXT NULL,
  telegram_message_id TEXT NULL,
  caption TEXT NULL,
  overlay_metadata JSONB DEFAULT '[]'::JSONB,
  view_once BOOLEAN DEFAULT TRUE,
  is_viewed BOOLEAN DEFAULT FALSE,
  viewed_at TIMESTAMP WITH TIME ZONE NULL,
  expires_at TIMESTAMP WITH TIME ZONE NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create story_views table
CREATE TABLE IF NOT EXISTS public.story_views (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES public.snaps(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(story_id, viewer_id)
);

-- Link snaps to chat_messages
ALTER TABLE public.chat_messages
ADD COLUMN IF NOT EXISTS snap_id UUID REFERENCES public.snaps(id) ON DELETE SET NULL;


-- PART 5: ROW LEVEL SECURITY & POLICIES
-- Enable RLS for all new tables
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.snaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.story_views ENABLE ROW LEVEL SECURITY;

-- 1. profiles policies (Updating existing ones and adding SELECT policy)
DROP POLICY IF EXISTS "Allow users to select their own profile" ON public.profiles;
CREATE POLICY "authenticated users can read public profile fields"
    ON public.profiles FOR SELECT
    TO authenticated
    USING (TRUE);

-- 2. conversations policies
DROP POLICY IF EXISTS "conversations_select_policy" ON public.conversations;
CREATE POLICY "conversations_select_policy"
    ON public.conversations FOR SELECT
    TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "conversations_insert_policy" ON public.conversations;
CREATE POLICY "conversations_insert_policy"
    ON public.conversations FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = participant_a OR auth.uid() = participant_b);

DROP POLICY IF EXISTS "conversations_update_policy" ON public.conversations;
CREATE POLICY "conversations_update_policy"
    ON public.conversations FOR UPDATE
    TO authenticated
    USING (auth.uid() = participant_a OR auth.uid() = participant_b);

-- 3. chat_messages policies
DROP POLICY IF EXISTS "chat_messages_select_policy" ON public.chat_messages;
CREATE POLICY "chat_messages_select_policy"
    ON public.chat_messages FOR SELECT
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

DROP POLICY IF EXISTS "chat_messages_insert_policy" ON public.chat_messages;
CREATE POLICY "chat_messages_insert_policy"
    ON public.chat_messages FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "chat_messages_update_policy" ON public.chat_messages;
CREATE POLICY "chat_messages_update_policy"
    ON public.chat_messages FOR UPDATE
    TO authenticated
    USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- 4. snaps policies
DROP POLICY IF EXISTS "snaps_select_policy" ON public.snaps;
CREATE POLICY "snaps_select_policy"
    ON public.snaps FOR SELECT
    TO authenticated
    USING (
      (snap_type = 'direct' AND (auth.uid() = sender_id OR auth.uid() = receiver_id)) OR
      (snap_type = 'story' AND expires_at > NOW()) OR
      (snap_type = 'story' AND auth.uid() = sender_id)
    );

DROP POLICY IF EXISTS "snaps_insert_policy" ON public.snaps;
CREATE POLICY "snaps_insert_policy"
    ON public.snaps FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "snaps_update_policy" ON public.snaps;
CREATE POLICY "snaps_update_policy"
    ON public.snaps FOR UPDATE
    TO authenticated
    USING (auth.uid() = receiver_id);

-- 5. story_views policies
DROP POLICY IF EXISTS "story_views_insert_policy" ON public.story_views;
CREATE POLICY "story_views_insert_policy"
    ON public.story_views FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = viewer_id);

DROP POLICY IF EXISTS "story_views_select_policy" ON public.story_views;
CREATE POLICY "story_views_select_policy"
    ON public.story_views FOR SELECT
    TO authenticated
    USING (
      auth.uid() = viewer_id OR 
      auth.uid() = (SELECT sender_id FROM public.snaps WHERE id = story_id)
    );
