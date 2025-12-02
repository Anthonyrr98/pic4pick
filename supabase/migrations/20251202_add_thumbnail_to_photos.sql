alter table if exists public.photos
  add column if not exists thumbnail_url text null;


