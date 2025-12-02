alter table if exists public.photos
  add column if not exists hidden boolean not null default false;



