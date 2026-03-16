-- Pic4Pick 完整数据库 schema（适用于国内自建 PostgreSQL / 自建 Supabase）
-- 执行顺序：按文件内顺序依次执行

-- ========== 1. photos 表 ==========
CREATE TABLE IF NOT EXISTS public.photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT,
  location TEXT,
  country TEXT,
  category TEXT DEFAULT 'featured',
  tags TEXT,
  image_url TEXT NOT NULL,
  thumbnail_url TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  altitude DECIMAL(10, 2),
  focal TEXT,
  aperture TEXT,
  shutter TEXT,
  iso TEXT,
  camera TEXT,
  lens TEXT,
  rating INTEGER DEFAULT 7,
  shot_date DATE,
  status TEXT DEFAULT 'pending',
  hidden BOOLEAN NOT NULL DEFAULT false,
  reject_reason TEXT,
  likes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_photos_status ON public.photos(status);
CREATE INDEX IF NOT EXISTS idx_photos_category ON public.photos(category);
CREATE INDEX IF NOT EXISTS idx_photos_created_at ON public.photos(created_at DESC);

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_photos_updated_at ON public.photos;
CREATE TRIGGER update_photos_updated_at
  BEFORE UPDATE ON public.photos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON COLUMN public.photos.reject_reason IS '拒绝原因（当 status 为 rejected 时使用）';

-- ========== 2. gear_presets 表 ==========
CREATE TABLE IF NOT EXISTS public.gear_presets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('camera', 'lens')),
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS gear_presets_type_name_idx
  ON public.gear_presets(type, name);

-- ========== 3. brand_settings 表 ==========
CREATE TABLE IF NOT EXISTS public.brand_settings (
  id TEXT PRIMARY KEY DEFAULT 'camarts_brand',
  logo_data TEXT,
  logo_mime TEXT,
  logo_url TEXT,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  site_title TEXT,
  site_subtitle TEXT,
  admin_title TEXT,
  admin_subtitle TEXT
);

COMMENT ON TABLE public.brand_settings IS '全站品牌设置（例如 Logo、品牌文案）';
COMMENT ON COLUMN public.brand_settings.logo_data IS 'logo 的 data URL/Base64 内容';
COMMENT ON COLUMN public.brand_settings.logo_mime IS '原始文件类型，例如 image/png';
COMMENT ON COLUMN public.brand_settings.logo_url IS '可选：若使用 Supabase Storage/WebDAV 等，这里存访问 URL';

-- ========== 4. RLS 策略（若使用 Supabase 自托管，需启用） ==========
-- 若为纯 PostgreSQL 部署（方案二），可跳过以下 RLS 部分

ALTER TABLE IF EXISTS public.photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.gear_presets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.brand_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow anon read photos" ON public.photos;
DROP POLICY IF EXISTS "Allow anon insert photos" ON public.photos;
DROP POLICY IF EXISTS "Allow anon update photos" ON public.photos;
DROP POLICY IF EXISTS "Allow anon delete photos" ON public.photos;
CREATE POLICY "Allow anon read photos" ON public.photos FOR SELECT USING (true);
CREATE POLICY "Allow anon insert photos" ON public.photos FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update photos" ON public.photos FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow anon delete photos" ON public.photos FOR DELETE USING (true);

DROP POLICY IF EXISTS "Allow anon read gear_presets" ON public.gear_presets;
DROP POLICY IF EXISTS "Allow anon insert gear_presets" ON public.gear_presets;
DROP POLICY IF EXISTS "Allow anon update gear_presets" ON public.gear_presets;
CREATE POLICY "Allow anon read gear_presets" ON public.gear_presets FOR SELECT USING (true);
CREATE POLICY "Allow anon insert gear_presets" ON public.gear_presets FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update gear_presets" ON public.gear_presets FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon read brand_settings" ON public.brand_settings;
DROP POLICY IF EXISTS "Allow anon insert brand_settings" ON public.brand_settings;
DROP POLICY IF EXISTS "Allow anon update brand_settings" ON public.brand_settings;
CREATE POLICY "Allow anon read brand_settings" ON public.brand_settings FOR SELECT USING (true);
CREATE POLICY "Allow anon insert brand_settings" ON public.brand_settings FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow anon update brand_settings" ON public.brand_settings FOR UPDATE USING (true) WITH CHECK (true);
