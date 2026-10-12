create table public.photo_like_events (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.photos(id) on delete cascade,
  ip inet,
  created_at timestamptz not null default now()
);

create index photo_like_events_photo_created_idx
  on public.photo_like_events (photo_id, created_at desc);
create index photo_like_events_created_idx
  on public.photo_like_events (created_at desc);

alter table public.photo_like_events enable row level security;
revoke all on table public.photo_like_events from public, anon, authenticated;
grant select, insert on table public.photo_like_events to service_role;

-- Only the backend service role can record or inspect visitor IPs.
-- Keep the original RPC during rollout so the previous backend remains compatible.
create function public.update_public_photo_likes_with_ip(
  photo_id uuid, like_delta integer, client_ip inet
)
returns table (id uuid, likes integer)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.photos as p
  set likes = greatest(0, coalesce(p.likes, 0) + like_delta)
  where p.id = photo_id
    and p.status = 'approved'
    and p.hidden is false
    and like_delta in (-1, 1)
  returning p.id, p.likes into id, likes;

  if not found then
    return;
  end if;

  if like_delta = 1 then
    insert into public.photo_like_events (photo_id, ip) values (id, client_ip);
  end if;
  return next;
end;
$$;

revoke all on function public.update_public_photo_likes_with_ip(uuid, integer, inet)
  from public, anon, authenticated;
grant execute on function public.update_public_photo_likes_with_ip(uuid, integer, inet)
  to service_role;

comment on table public.photo_like_events is 'Private successful like events; IPs are visible only through the admin backend.';
notify pgrst, 'reload schema';
