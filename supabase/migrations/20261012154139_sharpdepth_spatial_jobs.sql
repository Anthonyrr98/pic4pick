-- GPU inference runs on the owner's PC; visitors can only read published results.
create table public.photo_spatial (
  photo_id uuid primary key references public.photos(id) on delete cascade,
  generation uuid not null default gen_random_uuid(),
  model text not null default 'sharpdepth-v1-unidepth-v1-vitl-fp32-768',
  status text not null default 'pending' check(status in ('pending','processing','ready','failed')),
  depth_path text,
  width integer check(width between 1 and 1024),
  height integer check(height between 1 and 1024),
  updated_at timestamptz not null default now(),
  check(status <> 'ready' or (depth_path is not null and width is not null and height is not null))
);
create table public.spatial_jobs (
  photo_id uuid primary key references public.photos(id) on delete cascade,
  generation uuid not null,
  image_url text not null,
  preview_url text,
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  lease_token uuid,
  lease_until timestamptz,
  last_error text
);
create index spatial_jobs_available_idx on public.spatial_jobs(available_at);
alter table public.photo_spatial enable row level security;
alter table public.spatial_jobs enable row level security;
revoke all on public.photo_spatial, public.spatial_jobs from public, anon, authenticated;
grant select on public.photo_spatial to anon;
grant all on public.photo_spatial, public.spatial_jobs to service_role;
create policy "Visitors read spatial state for public photos" on public.photo_spatial
  for select to anon using(exists (
    select 1 from public.photos p where p.id=photo_id and p.status='approved' and not coalesce(p.hidden,false)
  ));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('spatial-depth','spatial-depth',false,1048576,array['image/png'])
on conflict(id) do nothing;
create policy "Visitors read only published spatial depth" on storage.objects
  for select to anon using(bucket_id='spatial-depth' and exists (
    select 1 from public.photo_spatial s where s.status='ready' and s.depth_path=name
  ));

create function public.queue_photo_spatial() returns trigger
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
    depth_path=null,width=null,height=null,updated_at=now();
  insert into public.spatial_jobs(photo_id,generation,image_url,preview_url)
  values(new.id,next_generation,new.image_url,new.thumbnail_url)
  on conflict(photo_id) do update set generation=excluded.generation,image_url=excluded.image_url,
    preview_url=excluded.preview_url,attempts=0,available_at=now(),lease_token=null,lease_until=null,last_error=null;
  return new;
end $$;
revoke all on function public.queue_photo_spatial() from public,anon,authenticated;
grant execute on function public.queue_photo_spatial() to service_role;
create trigger queue_photo_spatial after insert or update of image_url,thumbnail_url
  on public.photos for each row execute function public.queue_photo_spatial();

create function public.claim_spatial_job() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job public.spatial_jobs; token uuid := gen_random_uuid();
begin
  select j.* into job from public.spatial_jobs j join public.photos p on p.id=j.photo_id
    where j.available_at<=now() and (j.lease_until is null or j.lease_until<now())
      and j.attempts<5 and p.status in ('approved','pending')
    order by (p.status='approved') desc,j.available_at
    for update of j skip locked limit 1;
  if not found then return null; end if;
  update public.spatial_jobs set lease_token=token,lease_until=now()+interval '5 minutes',attempts=attempts+1
    where photo_id=job.photo_id returning * into job;
  update public.photo_spatial set status='processing',updated_at=now()
    where photo_id=job.photo_id and generation=job.generation;
  return to_jsonb(job);
end $$;

create function public.complete_spatial_job(p_photo_id uuid,p_generation uuid,p_lease_token uuid,p_width integer,p_height integer)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.spatial_jobs;
begin
  select * into job from public.spatial_jobs where photo_id=p_photo_id and generation=p_generation
    and lease_token=p_lease_token for update;
  if not found then return false; end if;
  if p_width not between 1 and 1024 or p_height not between 1 and 1024 then raise exception 'Invalid depth dimensions'; end if;
  update public.photo_spatial set status='ready',width=p_width,height=p_height,
    depth_path=p_photo_id::text||'/'||p_generation::text||'.png',updated_at=now()
    where photo_id=p_photo_id and generation=p_generation;
  if not found then return false; end if;
  delete from public.spatial_jobs where photo_id=p_photo_id and generation=p_generation and lease_token=p_lease_token;
  return true;
end $$;

create function public.fail_spatial_job(p_photo_id uuid,p_generation uuid,p_lease_token uuid,p_error text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare job public.spatial_jobs;
begin
  select * into job from public.spatial_jobs where photo_id=p_photo_id and generation=p_generation
    and lease_token=p_lease_token for update;
  if not found then return false; end if;
  update public.spatial_jobs set lease_token=null,lease_until=null,last_error=left(p_error,1000),
    available_at=now()+power(2,job.attempts)*interval '30 seconds' where photo_id=p_photo_id;
  update public.photo_spatial set status=case when job.attempts>=5 then 'failed' else 'pending' end,updated_at=now()
    where photo_id=p_photo_id and generation=p_generation;
  return true;
end $$;

revoke all on function public.claim_spatial_job(),
  public.complete_spatial_job(uuid,uuid,uuid,integer,integer),public.fail_spatial_job(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.claim_spatial_job(),
  public.complete_spatial_job(uuid,uuid,uuid,integer,integer),public.fail_spatial_job(uuid,uuid,uuid,text)
  to service_role;

-- Existing photos get the same durable processing path as newly submitted photos.
insert into public.photo_spatial(photo_id) select id from public.photos where coalesce(image_url,'')<>'';
insert into public.spatial_jobs(photo_id,generation,image_url,preview_url)
  select p.id,s.generation,p.image_url,p.thumbnail_url from public.photos p
    join public.photo_spatial s on s.photo_id=p.id;
