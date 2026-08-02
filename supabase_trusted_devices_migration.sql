-- Supabase Migration: New Device Verification & Trusted Devices Schema
-- Date: 2026-08-02

-- 1. Create trusted_devices Table
CREATE TABLE IF NOT EXISTS public.trusted_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    device_name TEXT NOT NULL DEFAULT 'Unknown Device',
    platform TEXT NOT NULL DEFAULT 'Web',
    browser TEXT NOT NULL DEFAULT 'Browser',
    trusted BOOLEAN NOT NULL DEFAULT true,
    last_login_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT unique_user_device UNIQUE (user_id, device_id)
);

-- Enable RLS for trusted_devices
ALTER TABLE public.trusted_devices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trusted devices"
    ON public.trusted_devices FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own trusted devices"
    ON public.trusted_devices FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own trusted devices"
    ON public.trusted_devices FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own trusted devices"
    ON public.trusted_devices FOR DELETE
    USING (auth.uid() = user_id);

-- 2. Create login_verifications Table
CREATE TABLE IF NOT EXISTS public.login_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    device_id TEXT NOT NULL,
    verification_code_hash TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    attempts INT NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS for login_verifications
ALTER TABLE public.login_verifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own login verifications"
    ON public.login_verifications FOR ALL
    USING (auth.uid() = user_id);
