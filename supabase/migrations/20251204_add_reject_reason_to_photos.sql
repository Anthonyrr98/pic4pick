-- 添加拒绝原因字段到 photos 表
alter table if exists public.photos
  add column if not exists reject_reason text null;

comment on column public.photos.reject_reason is '拒绝原因（当 status 为 rejected 时使用）';

