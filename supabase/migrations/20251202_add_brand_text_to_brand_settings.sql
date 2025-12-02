alter table if exists public.brand_settings
  add column if not exists site_title text null,
  add column if not exists site_subtitle text null,
  add column if not exists admin_title text null,
  add column if not exists admin_subtitle text null;


