begin;
-- Requires the existing project/membership/version/comment schema. Fail closed.
do $$ begin
 if not exists(select 1 from pg_class where oid='public.projects'::regclass and relrowsecurity) or not exists(select 1 from pg_class where oid='public.schedule_versions'::regclass and relrowsecurity) then raise exception 'Enable the existing projects and schedule_versions RLS before this migration'; end if;
end $$;
create unique index if not exists cpmr_version_project_identity on public.schedule_versions(project_id,id);
create table if not exists public.cpmr_version_reviews(
 version_id uuid primary key references public.schedule_versions(id), project_id uuid not null references public.projects(id),
 reviewed_at timestamptz, reviewed_by uuid references auth.users(id), disposition text check(disposition in ('APPROVED','ACCEPTED_WITH_COMMENTS','RETURNED_FOR_REVISION')),
 decided_at timestamptz, decided_by uuid references auth.users(id), approved_at timestamptz, reason text not null default '', revision integer not null default 0, foreign key(project_id,version_id) references public.schedule_versions(project_id,id));
create table if not exists public.cpmr_control_references(
 project_id uuid primary key references public.projects(id), baseline_version_id uuid references public.schedule_versions(id), update_version_id uuid references public.schedule_versions(id), revision integer not null default 0, assigned_at timestamptz, assigned_by uuid references auth.users(id), foreign key(project_id,baseline_version_id) references public.schedule_versions(project_id,id), foreign key(project_id,update_version_id) references public.schedule_versions(project_id,id));
create table if not exists public.cpmr_control_events(
 id bigint generated always as identity primary key, project_id uuid not null references public.projects(id), version_id uuid references public.schedule_versions(id), actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now(), action text not null, reason text not null, details jsonb not null default '{}');
alter table public.cpmr_version_reviews enable row level security;
alter table public.cpmr_control_references enable row level security;
alter table public.cpmr_control_events enable row level security;
drop policy if exists cpmr_review_read on public.cpmr_version_reviews;
create policy cpmr_review_read on public.cpmr_version_reviews for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_control_read on public.cpmr_control_references;
create policy cpmr_control_read on public.cpmr_control_references for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_event_read on public.cpmr_control_events;
create policy cpmr_event_read on public.cpmr_control_events for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
revoke all on public.cpmr_version_reviews,public.cpmr_control_references,public.cpmr_control_events from anon,authenticated;
grant select on public.cpmr_version_reviews,public.cpmr_control_references,public.cpmr_control_events to authenticated;
create index if not exists cpmr_event_project_idx on public.cpmr_control_events(project_id,id desc);
create index if not exists cpmr_directory_idx on public.projects(org_id,status,updated_at desc);
create index if not exists cpmr_latest_schedule_idx on public.schedule_versions(project_id,data_date desc);
create index if not exists cpmr_latest_upload_idx on public.schedule_versions(project_id,uploaded_at desc);

create or replace function public.cpmr_can_write(p_project uuid,p_decision boolean default false) returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and exists(select 1 from public.projects p join public.organization_members m on m.org_id=p.org_id and m.user_id=auth.uid()
 where p.id=p_project and p.status not in ('deleted','archived') and (m.role in ('owner','admin') or (not p_decision and m.role='pm' and (p.created_by=auth.uid() or exists(select 1 from public.project_access a where a.project_id=p.id and a.user_id=auth.uid() and a.access_level='pm')))));
$$;
revoke all on function public.cpmr_can_write(uuid,boolean) from public;
grant execute on function public.cpmr_can_write(uuid,boolean) to authenticated;

create or replace function public.cpmr_project_directory(p_org uuid,p_query text default '',p_status text default '',p_stage text default '',p_sort text default 'updated',p_page integer default 0,p_size integer default 25)
returns table(id uuid,name text,project_code text,status text,stage text,address text,data_date text,uploaded_at text,reviewed_at text,decision text,total_count bigint)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select p.id,p.name::text,p.project_code::text,p.status::text,coalesce(p.control_basis->'projectProfile'->>'stage',p.phase,''),coalesce(p.control_basis->'projectProfile'->>'address',''),v.data_date::text,v.uploaded_at::text,r.reviewed_at::text,r.disposition,count(*) over()
 from public.projects p left join lateral(select s.id,s.data_date,s.uploaded_at from public.schedule_versions s where s.project_id=p.id and s.deleted_at is null and s.archived_at is null order by s.uploaded_at desc,s.data_date desc nulls last,s.id limit 1) v on true
 left join public.cpmr_version_reviews r on r.version_id=v.id
 where p.org_id=p_org and p.status not in ('deleted','archived') and (p_status='' or p.status=p_status)
 and (p_stage='' or strpos(lower(coalesce(p.control_basis->'projectProfile'->>'stage',p.phase,'')),lower(p_stage))>0)
 and (p_query='' or strpos(lower(coalesce(p.project_code,'')||' '||p.name),lower(left(p_query,150)))>0)
 order by case when p_sort='name' then lower(p.name) end asc,case when p_sort='data_date' then v.data_date end desc nulls last,case when p_sort='uploaded' then v.uploaded_at end desc nulls last,p.updated_at desc,p.id
 limit greatest(1,least(p_size,100)) offset greatest(0,p_page)*greatest(1,least(p_size,100));
$$;
revoke all on function public.cpmr_project_directory(uuid,text,text,text,text,integer,integer) from public;
grant execute on function public.cpmr_project_directory(uuid,text,text,text,text,integer,integer) to authenticated;

create or replace function public.cpmr_workflow_state(p_project uuid) returns jsonb language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('reviews',coalesce((select jsonb_agg(to_jsonb(r)||jsonb_build_object('reviewer_name',reviewer.name,'decision_name',decider.name)) from public.cpmr_version_reviews r left join public.profiles reviewer on reviewer.id=r.reviewed_by left join public.profiles decider on decider.id=r.decided_by where r.project_id=p_project),'[]'::jsonb),'control',(select to_jsonb(c) from public.cpmr_control_references c where c.project_id=p_project),'events',coalesce((select jsonb_agg(e order by e.id desc) from (select ev.*,actor.name actor_name from public.cpmr_control_events ev left join public.profiles actor on actor.id=ev.actor_id where ev.project_id=p_project order by ev.id desc limit 50)e),'[]'::jsonb)) where exists(select 1 from public.projects where id=p_project);
$$;
revoke all on function public.cpmr_workflow_state(uuid) from public;
grant execute on function public.cpmr_workflow_state(uuid) to authenticated;

create or replace function public.cpmr_workflow_action(p_project uuid,p_version uuid,p_action text,p_reason text,p_expected integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v public.schedule_versions%rowtype; r public.cpmr_version_reviews%rowtype; c public.cpmr_control_references%rowtype; stamp timestamptz:=now();
begin
 if not public.cpmr_can_write(p_project,true) then raise exception 'Only an authorized organization owner/admin can record review decisions or control assignments'; end if;
 if length(trim(coalesce(p_reason,'')))<5 then raise exception 'Enter the review basis or authority reference'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,0));
 select * into v from public.schedule_versions where id=p_version and project_id=p_project and deleted_at is null and archived_at is null for update;
 if not found then raise exception 'The version is not an accessible active submission in this project'; end if;
 insert into public.cpmr_version_reviews(version_id,project_id) values(p_version,p_project) on conflict do nothing;
 select * into r from public.cpmr_version_reviews where version_id=p_version for update;
 select * into c from public.cpmr_control_references where project_id=p_project for update;
 if p_action in ('mark_reviewed','APPROVED','ACCEPTED_WITH_COMMENTS','RETURNED_FOR_REVISION') then
  if r.revision<>p_expected then raise exception 'Review changed in another session. Reload before saving'; end if;
  if c.baseline_version_id=p_version or c.update_version_id=p_version then raise exception 'An assigned control version is locked. Submit a revision or replace the reference first'; end if;
  if p_action='mark_reviewed' then
   update public.cpmr_version_reviews set reviewed_at=stamp,reviewed_by=auth.uid(),disposition=null,decided_at=null,decided_by=null,approved_at=null,reason=trim(p_reason),revision=revision+1 where version_id=p_version;
  else
   if r.reviewed_at is null then raise exception 'Complete the review before recording a decision'; end if;
   if p_action in ('APPROVED','ACCEPTED_WITH_COMMENTS') and exists(select 1 from public.review_comments where project_id=p_project and classification='REQUIRED' and approval_impact='BLOCKS_APPROVAL' and status not in ('DRAFT','CLOSED','VOID','WITHDRAWN')) then raise exception 'Issued approval-blocking comments remain open. Close or withdraw them through the existing register before acceptance'; end if;
   update public.cpmr_version_reviews set disposition=p_action,decided_at=stamp,decided_by=auth.uid(),approved_at=case when p_action='APPROVED' then stamp else null end,reason=trim(p_reason),revision=revision+1 where version_id=p_version;
  end if;
 elsif p_action in ('assign_baseline','assign_update') then
  if coalesce(c.revision,0)<>p_expected then raise exception 'Control references changed in another session. Reload before saving'; end if;
  if p_action='assign_baseline' and (v.schedule_type not in ('baseline','rebaseline') or v.schedule_type is null or r.disposition is distinct from 'APPROVED') then raise exception 'Select an Approved baseline/rebaseline submission'; end if;
  if p_action='assign_update' and (v.schedule_type is distinct from 'update' or r.disposition is null or r.disposition not in ('APPROVED','ACCEPTED_WITH_COMMENTS')) then raise exception 'Select an approved/accepted update'; end if;
  if p_action='assign_update' and c.baseline_version_id is null then raise exception 'Assign the approved baseline first'; end if;
  insert into public.cpmr_control_references(project_id,baseline_version_id,update_version_id,revision,assigned_at,assigned_by)
  values(p_project,case when p_action='assign_baseline' then p_version else c.baseline_version_id end,case when p_action='assign_update' then p_version else null end,coalesce(c.revision,0)+1,stamp,auth.uid())
  on conflict(project_id) do update set baseline_version_id=excluded.baseline_version_id,update_version_id=excluded.update_version_id,revision=excluded.revision,assigned_at=stamp,assigned_by=auth.uid();
 else raise exception 'Unsupported workflow action'; end if;
 insert into public.cpmr_control_events(project_id,version_id,actor_id,action,reason,details) values(p_project,p_version,auth.uid(),p_action,trim(p_reason),jsonb_build_object('previous_review',to_jsonb(r),'previous_control',to_jsonb(c)));
 return jsonb_build_object('saved',true,'at',stamp);
end $$;
revoke all on function public.cpmr_workflow_action(uuid,uuid,text,text,integer) from public;
grant execute on function public.cpmr_workflow_action(uuid,uuid,text,text,integer) to authenticated;

create or replace function public.cpmr_save_profile(p_project uuid,p_address text,p_stage text,p_use_basis boolean default false) returns void language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if not public.cpmr_can_write(p_project,false) then raise exception 'Project edit permission required'; end if;
 update public.projects set control_basis=jsonb_set(coalesce(control_basis,'{}'::jsonb),'{projectProfile}',jsonb_build_object('address',left(trim(p_address),500),'stage',left(trim(p_stage),100)))||jsonb_build_object('reviewBasisEnabled',p_use_basis),updated_at=now() where id=p_project;
end $$;
revoke all on function public.cpmr_save_profile(uuid,text,text,boolean) from public;
grant execute on function public.cpmr_save_profile(uuid,text,text,boolean) to authenticated;
commit;
