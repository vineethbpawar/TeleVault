-- Create large_files table
CREATE TABLE IF NOT EXISTS public.large_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    original_file_name TEXT NOT NULL,
    mime_type TEXT,
    file_type TEXT NOT NULL, -- e.g. 'image', 'video', 'document'
    total_size BIGINT NOT NULL,
    total_chunks INTEGER NOT NULL,
    chunk_size BIGINT NOT NULL,
    status TEXT DEFAULT 'pending', -- 'pending', 'uploading', 'completed', 'failed'
    destination TEXT NOT NULL, -- 'memories', 'drive', 'private'
    folder_id UUID REFERENCES public.folders(id) ON DELETE SET NULL,
    is_private BOOLEAN DEFAULT FALSE,
    telegram_album_key TEXT,
    checksum TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Create large_file_chunks table
CREATE TABLE IF NOT EXISTS public.large_file_chunks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    large_file_id UUID NOT NULL REFERENCES public.large_files(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    chunk_file_name TEXT NOT NULL,
    chunk_size BIGINT NOT NULL,
    telegram_message_id TEXT,
    telegram_file_id TEXT,
    status TEXT DEFAULT 'pending', -- 'pending', 'uploading', 'completed', 'failed'
    retry_count INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    uploaded_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(large_file_id, chunk_index)
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.large_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.large_file_chunks ENABLE ROW LEVEL SECURITY;

-- Disable existing policies if any (safeguard)
DROP POLICY IF EXISTS "Allow users to select their own large_files" ON public.large_files;
DROP POLICY IF EXISTS "Allow users to insert their own large_files" ON public.large_files;
DROP POLICY IF EXISTS "Allow users to update their own large_files" ON public.large_files;
DROP POLICY IF EXISTS "Allow users to delete their own large_files" ON public.large_files;

DROP POLICY IF EXISTS "Allow users to select chunks of their own large_files" ON public.large_file_chunks;
DROP POLICY IF EXISTS "Allow users to insert chunks of their own large_files" ON public.large_file_chunks;
DROP POLICY IF EXISTS "Allow users to update chunks of their own large_files" ON public.large_file_chunks;
DROP POLICY IF EXISTS "Allow users to delete chunks of their own large_files" ON public.large_file_chunks;

-- Policies for large_files
CREATE POLICY "Allow users to select their own large_files"
    ON public.large_files FOR SELECT
    USING (auth.uid() = owner_id);

CREATE POLICY "Allow users to insert their own large_files"
    ON public.large_files FOR INSERT
    WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Allow users to update their own large_files"
    ON public.large_files FOR UPDATE
    USING (auth.uid() = owner_id);

CREATE POLICY "Allow users to delete their own large_files"
    ON public.large_files FOR DELETE
    USING (auth.uid() = owner_id);

-- Policies for large_file_chunks
CREATE POLICY "Allow users to select chunks of their own large_files"
    ON public.large_file_chunks FOR SELECT
    USING (EXISTS (
        SELECT 1 FROM public.large_files
        WHERE public.large_files.id = large_file_chunks.large_file_id
          AND public.large_files.owner_id = auth.uid()
    ));

CREATE POLICY "Allow users to insert chunks of their own large_files"
    ON public.large_file_chunks FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM public.large_files
        WHERE public.large_files.id = large_file_chunks.large_file_id
          AND public.large_files.owner_id = auth.uid()
    ));

CREATE POLICY "Allow users to update chunks of their own large_files"
    ON public.large_file_chunks FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM public.large_files
        WHERE public.large_files.id = large_file_chunks.large_file_id
          AND public.large_files.owner_id = auth.uid()
    ));

CREATE POLICY "Allow users to delete chunks of their own large_files"
    ON public.large_file_chunks FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM public.large_files
        WHERE public.large_files.id = large_file_chunks.large_file_id
          AND public.large_files.owner_id = auth.uid()
    ));

-- Update files table
ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS is_chunked BOOLEAN DEFAULT FALSE;

ALTER TABLE public.files
ADD COLUMN IF NOT EXISTS large_file_id UUID REFERENCES public.large_files(id) ON DELETE SET NULL;
