create table if not exists public.gear_presets (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('camera','lens')),
  name text not null,
  created_at timestamptz default now()
);

create unique index if not exists gear_presets_type_name_idx
  on public.gear_presets(type, name);


