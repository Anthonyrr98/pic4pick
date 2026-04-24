-- 用于持久化管理端配置（例如环境变量覆写）
create table if not exists public.app_settings (
  id text primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

comment on table public.app_settings is '应用配置表（管理端可写的配置项）';
comment on column public.app_settings.data is '配置 JSON（例如 env_config）';

-- RLS（与现有 photos/brand_settings 风格保持一致：anon 可读写）
alter table if exists public.app_settings enable row level security;

drop policy if exists "Allow anon read app_settings" on public.app_settings;
drop policy if exists "Allow anon upsert app_settings" on public.app_settings;
drop policy if exists "Allow anon update app_settings" on public.app_settings;

create policy "Allow anon read app_settings"
  on public.app_settings for select
  using (true);

create policy "Allow anon upsert app_settings"
  on public.app_settings for insert
  with check (true);

create policy "Allow anon update app_settings"
  on public.app_settings for update
  using (true)
  with check (true);

