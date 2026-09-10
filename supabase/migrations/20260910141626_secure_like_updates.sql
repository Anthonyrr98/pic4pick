create or replace function public.update_public_photo_likes(photo_id uuid, like_delta integer)
returns table (id uuid, likes integer)
language sql
security definer
set search_path = ''
as $$
  update public.photos
  set likes = greatest(0, coalesce(likes, 0) + like_delta)
  where photos.id = photo_id
    and photos.status = 'approved'
    and photos.hidden is false
    and like_delta in (-1, 1)
  returning photos.id, photos.likes;
$$;

revoke all on function public.update_public_photo_likes(uuid, integer) from public, anon, authenticated;
grant execute on function public.update_public_photo_likes(uuid, integer) to service_role;
