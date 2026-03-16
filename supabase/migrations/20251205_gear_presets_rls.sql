-- 允许使用 anon key 读写 gear_presets（与 photos 表一致，便于管理端同步相机/镜头预设）
-- 先删除可能已存在的同名策略，再创建
drop policy if exists "Allow anon read gear_presets" on public.gear_presets;
drop policy if exists "Allow anon insert gear_presets" on public.gear_presets;
drop policy if exists "Allow anon update gear_presets" on public.gear_presets;

alter table if exists public.gear_presets enable row level security;

create policy "Allow anon read gear_presets"
  on public.gear_presets for select
  using (true);

create policy "Allow anon insert gear_presets"
  on public.gear_presets for insert
  with check (true);

create policy "Allow anon update gear_presets"
  on public.gear_presets for update
  using (true)
  with check (true);
