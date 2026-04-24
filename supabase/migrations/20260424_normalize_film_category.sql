-- 统一 photos.category 中的“胶片”分类值为标准枚举 film
update public.photos
set category = 'film'
where category is not null
  and btrim(lower(category)) = '胶片';

-- 可选：统一大小写/空格导致的 film 变体
update public.photos
set category = 'film'
where category is not null
  and btrim(lower(category)) = 'film';

