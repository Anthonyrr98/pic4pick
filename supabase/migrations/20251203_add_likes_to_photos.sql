alter table if exists public.photos
  add column if not exists likes integer not null default 0;


