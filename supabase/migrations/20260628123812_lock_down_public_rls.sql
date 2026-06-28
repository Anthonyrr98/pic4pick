-- First security pass:
-- - public/anon can only read visible public content
-- - all admin writes move behind server-enhanced.js using SUPABASE_SERVICE_ROLE_KEY

do $$
begin
  if to_regclass('public.photos') is not null then
    alter table public.photos enable row level security;

    drop policy if exists "Allow anon read photos" on public.photos;
    drop policy if exists "Allow anon insert photos" on public.photos;
    drop policy if exists "Allow anon update photos" on public.photos;
    drop policy if exists "Allow anon delete photos" on public.photos;
    drop policy if exists "anon_select_photos" on public.photos;
    drop policy if exists "insert photos" on public.photos;
    drop policy if exists "update photos" on public.photos;
    drop policy if exists "delete photos" on public.photos;
    drop policy if exists "Public can read visible approved photos" on public.photos;

    revoke all on table public.photos from public, anon, authenticated;
    grant select on table public.photos to anon;

    create policy "Public can read visible approved photos"
      on public.photos
      for select
      to anon
      using (status = 'approved' and hidden is false);
  end if;

  if to_regclass('public.app_settings') is not null then
    alter table public.app_settings enable row level security;

    drop policy if exists "Allow anon read app_settings" on public.app_settings;
    drop policy if exists "Allow anon upsert app_settings" on public.app_settings;
    drop policy if exists "Allow anon update app_settings" on public.app_settings;

    revoke all on table public.app_settings from anon, authenticated;
  end if;

  if to_regclass('public.brand_settings') is not null then
    alter table public.brand_settings enable row level security;

    drop policy if exists "Allow anon read brand_settings" on public.brand_settings;
    drop policy if exists "Allow anon insert brand_settings" on public.brand_settings;
    drop policy if exists "Allow anon update brand_settings" on public.brand_settings;
    drop policy if exists "allow logo read" on public.brand_settings;
    drop policy if exists "allow logo upsert" on public.brand_settings;
    drop policy if exists "allow logo update" on public.brand_settings;
    drop policy if exists "allow logo updat" on public.brand_settings;
    drop policy if exists "allow logo delete" on public.brand_settings;
    drop policy if exists "Public can read brand settings" on public.brand_settings;

    revoke all on table public.brand_settings from public, anon, authenticated;
    grant select on table public.brand_settings to anon;

    create policy "Public can read brand settings"
      on public.brand_settings
      for select
      to anon
      using (id = 'camarts_brand');
  end if;

  if to_regclass('public.gear_presets') is not null then
    alter table public.gear_presets enable row level security;

    drop policy if exists "Allow anon read gear_presets" on public.gear_presets;
    drop policy if exists "Allow anon insert gear_presets" on public.gear_presets;
    drop policy if exists "Allow anon update gear_presets" on public.gear_presets;
    drop policy if exists "Allow select gear_presets for clients" on public.gear_presets;
    drop policy if exists "Allow insert gear_presets for clients" on public.gear_presets;
    drop policy if exists "Public can read gear presets" on public.gear_presets;

    revoke all on table public.gear_presets from public, anon, authenticated;
    grant select on table public.gear_presets to anon;

    create policy "Public can read gear presets"
      on public.gear_presets
      for select
      to anon
      using (true);
  end if;
end $$;
