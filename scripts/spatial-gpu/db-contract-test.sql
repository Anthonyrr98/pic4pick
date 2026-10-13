-- Synthetic rows only; all changes are rolled back, including claimed jobs.
begin;
do $$
declare test_id uuid := gen_random_uuid(); old_gen uuid; job jsonb; claimed jsonb;
begin
  perform set_config('spatial.test_photo_id',test_id::text,true);
  insert into public.photos select (jsonb_populate_record(null::public.photos,
    (select to_jsonb(p) from public.photos p limit 1)||jsonb_build_object(
      'id',test_id,'title','Spatial queue contract fixture','hidden',false,'status','approved'))).*;
  select generation into old_gen from public.photo_spatial where photo_id=test_id;
  if old_gen is null then raise exception 'Insert did not enqueue'; end if;
  update public.photos set title='Updated fixture title' where id=test_id;
  if (select generation from public.photo_spatial where photo_id=test_id)<>old_gen then raise exception 'Title invalidated depth'; end if;
  update public.spatial_jobs set available_at='1970-01-01' where photo_id=test_id;
  job := public.claim_spatial_job();
  if job->>'photo_id'<>test_id::text then raise exception 'Wrong job claimed'; end if;
  claimed := public.claim_spatial_job();
  if claimed->>'photo_id'=test_id::text then raise exception 'Lease was claimed twice'; end if;
  if public.complete_spatial_job(test_id,old_gen,gen_random_uuid(),784,523) then raise exception 'Wrong lease accepted'; end if;
  update public.photos set image_url=image_url||'?spatial-contract=changed' where id=test_id;
  if (select generation from public.photo_spatial where photo_id=test_id)=old_gen then raise exception 'Source did not invalidate depth'; end if;
  if public.complete_spatial_job(test_id,old_gen,(job->>'lease_token')::uuid,784,523) then raise exception 'Stale generation published'; end if;
  update public.spatial_jobs set available_at='1970-01-01' where photo_id=test_id;
  job := public.claim_spatial_job();
  if not public.fail_spatial_job(test_id,(job->>'generation')::uuid,(job->>'lease_token')::uuid,'synthetic retry') then raise exception 'Retry failed'; end if;
  if (select status from public.photo_spatial where photo_id=test_id)<>'pending' then raise exception 'Retry not pending'; end if;
  update public.spatial_jobs set available_at='1970-01-01' where photo_id=test_id;
  job := public.claim_spatial_job();
  if public.complete_spatial_job_oss(test_id,(job->>'generation')::uuid,gen_random_uuid(),784,523) then raise exception 'Wrong OSS lease accepted'; end if;
  if not public.complete_spatial_job_oss(test_id,(job->>'generation')::uuid,(job->>'lease_token')::uuid,784,523) then raise exception 'OSS completion failed'; end if;
  if (select storage_backend from public.photo_spatial where photo_id=test_id)<>'oss' then raise exception 'OSS completion did not set storage backend'; end if;
  if exists(select 1 from public.spatial_jobs where photo_id=test_id) then raise exception 'Completed job remained queued'; end if;
end $$;
set local role anon;
do $$
begin
  if (select count(*) from public.photo_spatial where photo_id=current_setting('spatial.test_photo_id')::uuid and status='ready')<>1 then raise exception 'Published metadata is not readable'; end if;
  begin perform 1 from public.spatial_jobs; raise exception 'Visitor can read queue'; exception when insufficient_privilege then null; end;
  begin perform public.claim_spatial_job(); raise exception 'Visitor can claim jobs'; exception when insufficient_privilege then null; end;
  begin perform public.complete_spatial_job_oss(current_setting('spatial.test_photo_id')::uuid,gen_random_uuid(),gen_random_uuid(),784,523); raise exception 'Visitor can publish OSS results'; exception when insufficient_privilege then null; end;
  begin update public.photo_spatial set status='pending' where photo_id=current_setting('spatial.test_photo_id')::uuid;
    raise exception 'Visitor can write results'; exception when insufficient_privilege then null; end;
end $$;
reset role;
update public.photos set hidden=true where id=current_setting('spatial.test_photo_id')::uuid;
set local role anon;
do $$ begin
  if exists(select 1 from public.photo_spatial where photo_id=current_setting('spatial.test_photo_id')::uuid) then raise exception 'Hidden result leaked'; end if;
end $$;
reset role;
update public.photos set image_url=image_url||'&expired-lease=true' where id=current_setting('spatial.test_photo_id')::uuid;
do $$ begin
  if (select storage_backend from public.photo_spatial where photo_id=current_setting('spatial.test_photo_id')::uuid)<>'supabase'
    then raise exception 'Replacement retained old backend'; end if;
end $$;
update public.spatial_jobs set attempts=5,lease_until=now()-interval '1 minute',lease_token=gen_random_uuid()
  where photo_id=current_setting('spatial.test_photo_id')::uuid;
update public.photo_spatial set status='processing' where photo_id=current_setting('spatial.test_photo_id')::uuid;
select public.claim_spatial_job();
do $$ begin
  if (select status from public.photo_spatial where photo_id=current_setting('spatial.test_photo_id')::uuid)<>'failed'
    then raise exception 'Last expired attempt remained processing'; end if;
end $$;
delete from public.photos where id=current_setting('spatial.test_photo_id')::uuid;
do $$ begin
  if exists(select 1 from public.photo_spatial where photo_id=current_setting('spatial.test_photo_id')::uuid)
    or exists(select 1 from public.spatial_jobs where photo_id=current_setting('spatial.test_photo_id')::uuid) then raise exception 'Deletion did not cascade'; end if;
end $$;
rollback;
select 'Spatial queue, replacement, retry, stale lease, anonymous permissions, hidden state and deletion contracts passed; fixture rolled back' as result;
