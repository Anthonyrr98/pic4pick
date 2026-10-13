-- Metadata stays behind existing RLS; OSS credentials only live in the backend/worker.
alter table public.photo_spatial add column storage_backend text not null default 'supabase'
  check(storage_backend in ('supabase','oss'));
create or replace function public.queue_photo_spatial() returns trigger
language plpgsql security invoker set search_path='' as $$
declare next_generation uuid := gen_random_uuid();
begin
  if tg_op='UPDATE' and new.image_url is not distinct from old.image_url
    and new.thumbnail_url is not distinct from old.thumbnail_url then return new; end if;
  if coalesce(new.image_url,'')='' then
    delete from public.spatial_jobs where photo_id=new.id;
    delete from public.photo_spatial where photo_id=new.id;
    return new;
  end if;
  insert into public.photo_spatial(photo_id,generation)
  values(new.id,next_generation)
  on conflict(photo_id) do update set generation=excluded.generation,status='pending',
    storage_backend='supabase',depth_path=null,width=null,height=null,updated_at=now();
  insert into public.spatial_jobs(photo_id,generation,image_url,preview_url)
  values(new.id,next_generation,new.image_url,new.thumbnail_url)
  on conflict(photo_id) do update set generation=excluded.generation,image_url=excluded.image_url,
    preview_url=excluded.preview_url,attempts=0,available_at=now(),lease_token=null,lease_until=null,last_error=null;
  return new;
end $$;
create or replace function public.complete_spatial_job(p_photo_id uuid,p_generation uuid,p_lease_token uuid,p_width integer,p_height integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.spatial_jobs;
begin
  select * into job from public.spatial_jobs where photo_id=p_photo_id and generation=p_generation
    and lease_token=p_lease_token for update;
  if not found then return false; end if;
  if p_width not between 1 and 1024 or p_height not between 1 and 1024 then raise exception 'Invalid depth dimensions'; end if;
  update public.photo_spatial set status='ready',storage_backend='supabase',width=p_width,height=p_height,
    depth_path=p_photo_id::text||'/'||p_generation::text||'.png',updated_at=now()
    where photo_id=p_photo_id and generation=p_generation;
  if not found then return false; end if;
  delete from public.spatial_jobs where photo_id=p_photo_id and generation=p_generation and lease_token=p_lease_token;
  return true;
end $$;
create function public.complete_spatial_job_oss(p_photo_id uuid,p_generation uuid,p_lease_token uuid,p_width integer,p_height integer)
returns boolean language plpgsql security invoker set search_path='' as $$
begin
  if not public.complete_spatial_job(p_photo_id,p_generation,p_lease_token,p_width,p_height) then return false; end if;
  update public.photo_spatial set storage_backend='oss' where photo_id=p_photo_id and generation=p_generation;
  return true;
end $$;
revoke all on function public.complete_spatial_job_oss(uuid,uuid,uuid,integer,integer) from public,anon,authenticated;
grant execute on function public.complete_spatial_job_oss(uuid,uuid,uuid,integer,integer) to service_role;
