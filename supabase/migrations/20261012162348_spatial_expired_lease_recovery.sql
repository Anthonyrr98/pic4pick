-- A repeatedly interrupted PC must not leave its last attempt processing forever.
create or replace function public.claim_spatial_job() returns jsonb
language plpgsql security invoker set search_path='' as $$
declare job public.spatial_jobs; token uuid := gen_random_uuid();
begin
  update public.photo_spatial s set status='failed',updated_at=now()
    where s.status='processing' and exists(select 1 from public.spatial_jobs j
      where j.photo_id=s.photo_id and j.generation=s.generation and j.attempts>=5 and j.lease_until<now());
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
revoke all on function public.claim_spatial_job() from public,anon,authenticated;
grant execute on function public.claim_spatial_job() to service_role;
