alter table if exists public.brand_settings
  add column if not exists aliyun_oss_backend_url text null,
  add column if not exists aliyun_oss_use_sign boolean null;

comment on column public.brand_settings.aliyun_oss_backend_url is '可选：前端/管理面板配置的 OSS 后端代理地址';
comment on column public.brand_settings.aliyun_oss_use_sign is '可选：是否使用签名直传（true/NULL 默认直传；false 为后端代理）';

