-- Create telegram_configs table
create table if not exists public.telegram_configs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  bot_token text not null,
  channel_id text not null,
  channel_title text,
  is_verified boolean default false,
  last_verified_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(user_id)
);

-- Enable RLS on telegram_configs
alter table public.telegram_configs enable row level security;

-- Drop existing policies if any
drop policy if exists "Users can select own config" on public.telegram_configs;
drop policy if exists "Users can insert own config" on public.telegram_configs;
drop policy if exists "Users can update own config" on public.telegram_configs;
drop policy if exists "Users can delete own config" on public.telegram_configs;

-- Create secure policies
create policy "Users can select own config"
  on public.telegram_configs for select
  using (auth.uid() = user_id);

create policy "Users can insert own config"
  on public.telegram_configs for insert
  with check (auth.uid() = user_id);

create policy "Users can update own config"
  on public.telegram_configs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own config"
  on public.telegram_configs for delete
  using (auth.uid() = user_id);
