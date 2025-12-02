-- 创建品牌配置表，用于集中存储 Logo 等品牌元素
create table if not exists public.brand_settings (
  id text primary key default 'camarts_brand',
  logo_data text null,
  logo_mime text null,
  logo_url text null,
  updated_by text null,
  updated_at timestamptz not null default now()
);

comment on table public.brand_settings is '全站品牌设置（例如 Logo、品牌文案）';
comment on column public.brand_settings.logo_data is 'logo 的 data URL/Base64 内容，小文件即可';
comment on column public.brand_settings.logo_mime is '原始文件类型，例如 image/png';
comment on column public.brand_settings.logo_url is '可选：若使用 Supabase Storage/WebDAV 等，这里存访问 URL';
comment on column public.brand_settings.updated_by is '最近一次更新 Logo 的操作者';

