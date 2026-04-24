-- 为胶片作品增加独立胶卷字段
alter table if exists public.photos
  add column if not exists film_stock text null;

comment on column public.photos.film_stock is '胶片作品的胶卷型号，例如 Kodak Portra 400';

