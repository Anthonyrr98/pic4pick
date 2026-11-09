create index if not exists photos_public_id_idx on public.photos (id)
  where status = 'approved' and hidden is false;

create table public.photo_like_operations (
  operation_id uuid primary key,
  photo_id uuid not null references public.photos(id) on delete cascade,
  delta integer not null check (delta in (-1, 1)),
  created_at timestamptz not null default now()
);
create index photo_like_operations_created_idx on public.photo_like_operations (created_at);
create index photo_like_operations_photo_idx on public.photo_like_operations (photo_id);
alter table public.photo_like_operations enable row level security;
revoke all on public.photo_like_operations from public, anon, authenticated;
grant select, insert on public.photo_like_operations to service_role;

create function public.apply_photo_like_operation(
  requested_photo_id uuid, requested_delta integer, requested_operation_id uuid, client_ip inet
)
returns table (id uuid, likes integer, applied boolean, conflict boolean)
language plpgsql security invoker set search_path = ''
as $$
declare
  prior public.photo_like_operations%rowtype;
begin
  if requested_operation_id is null or requested_delta is null or requested_delta not in (-1, 1) then
    raise exception 'Invalid like operation' using errcode = '22023';
  end if;

  -- Serialize mutations of a photo and ensure visibility cannot change mid-operation.
  select p.id, coalesce(p.likes, 0) into id, likes
  from public.photos as p
  where p.id = requested_photo_id and p.status = 'approved' and p.hidden is false
  for update;
  if not found then return; end if;

  insert into public.photo_like_operations (operation_id, photo_id, delta)
    values (requested_operation_id, requested_photo_id, requested_delta)
    on conflict (operation_id) do nothing;
  applied := found;
  conflict := false;
  if applied then
    select updated.likes into likes
    from public.update_public_photo_likes_with_ip(requested_photo_id, requested_delta, client_ip) as updated;
  else
    select * into prior from public.photo_like_operations where operation_id = requested_operation_id;
    conflict := prior.photo_id is distinct from requested_photo_id or prior.delta is distinct from requested_delta;
  end if;
  return next;
end;
$$;
revoke all on function public.apply_photo_like_operation(uuid, integer, uuid, inet)
  from public, anon, authenticated;
grant execute on function public.apply_photo_like_operation(uuid, integer, uuid, inet) to service_role;

create extension if not exists pg_cron;
select cron.schedule('purge-expired-photo-likes', '*/15 * * * *', $job$
  delete from public.photo_like_events where created_at < now() - interval '7 days';
  delete from public.photo_like_operations where created_at < now() - interval '30 days';
$job$);

-- The operator can delete visitor event records using a validated address.
-- The returned count can be recorded with a request number, without retaining the address.
create function public.delete_photo_like_ip(request_ip inet)
returns bigint
language sql security invoker set search_path = ''
as $$
  with removed as (
    delete from public.photo_like_events where ip = request_ip returning 1
  )
  select count(*) from removed;
$$;
revoke all on function public.delete_photo_like_ip(inet) from public, anon, authenticated;
grant execute on function public.delete_photo_like_ip(inet) to service_role;
grant delete on public.photo_like_events to service_role;
create index photo_like_events_ip_idx on public.photo_like_events (ip);

notify pgrst, 'reload schema';
