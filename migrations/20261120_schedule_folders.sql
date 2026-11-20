begin;
-- Additive organization metadata only. No XER, activity or approval data is rewritten.
do $$ begin
 if to_regprocedure('public.cpmr_can_write(uuid,boolean)') is null then
  raise exception 'Apply 20261120_project_controls.sql first';
 end if;
end $$;
create table if not exists public.cpmr_schedule_library_meta(
 project_id uuid primary key references public.projects(id) on delete cascade,
 revision integer not null default 0, updated_at timestamptz not null default now());
create table if not exists public.cpmr_schedule_folders(
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id) on delete cascade,
 parent_id uuid, name text not null check(length(trim(name)) between 1 and 80), sort_order integer not null default 0,
 created_at timestamptz not null default now(), created_by uuid not null references auth.users(id),
 unique(project_id,id), foreign key(project_id,parent_id) references public.cpmr_schedule_folders(project_id,id));
create unique index if not exists cpmr_schedule_folder_names on public.cpmr_schedule_folders(project_id,coalesce(parent_id,'00000000-0000-0000-0000-000000000000'::uuid),lower(name));
create table if not exists public.cpmr_schedule_filing(
 version_id uuid primary key, project_id uuid not null references public.projects(id) on delete cascade, folder_id uuid,
 foreign key(project_id,version_id) references public.schedule_versions(project_id,id) on delete cascade,
 foreign key(project_id,folder_id) references public.cpmr_schedule_folders(project_id,id));
create table if not exists public.cpmr_schedule_library_events(
 id bigint generated always as identity primary key, project_id uuid not null references public.projects(id) on delete cascade,
 actor_id uuid not null references auth.users(id), occurred_at timestamptz not null default now(), action text not null, details jsonb not null);
alter table public.cpmr_schedule_library_meta enable row level security;
alter table public.cpmr_schedule_folders enable row level security;
alter table public.cpmr_schedule_filing enable row level security;
alter table public.cpmr_schedule_library_events enable row level security;
drop policy if exists cpmr_library_meta_read on public.cpmr_schedule_library_meta;
create policy cpmr_library_meta_read on public.cpmr_schedule_library_meta for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_folder_read on public.cpmr_schedule_folders;
create policy cpmr_folder_read on public.cpmr_schedule_folders for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_filing_read on public.cpmr_schedule_filing;
create policy cpmr_filing_read on public.cpmr_schedule_filing for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_library_event_read on public.cpmr_schedule_library_events;
create policy cpmr_library_event_read on public.cpmr_schedule_library_events for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
revoke all on public.cpmr_schedule_library_meta,public.cpmr_schedule_folders,public.cpmr_schedule_filing,public.cpmr_schedule_library_events from public,anon,authenticated;
grant select on public.cpmr_schedule_library_meta,public.cpmr_schedule_folders,public.cpmr_schedule_filing,public.cpmr_schedule_library_events to authenticated;

create or replace function public.cpmr_schedule_library_state(p_project uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('revision',coalesce((select revision from public.cpmr_schedule_library_meta where project_id=p_project),0),
 'can_edit',public.cpmr_can_write(p_project,false),
 'folders',coalesce((select jsonb_agg(to_jsonb(f) order by f.sort_order,f.name,f.id) from public.cpmr_schedule_folders f where f.project_id=p_project),'[]'::jsonb),
 'filing',coalesce((select jsonb_agg(to_jsonb(v)) from public.cpmr_schedule_filing v join public.schedule_versions s on s.id=v.version_id and s.project_id=v.project_id where v.project_id=p_project),'[]'::jsonb))
 where exists(select 1 from public.projects p where p.id=p_project);
$$;
revoke all on function public.cpmr_schedule_library_state(uuid) from public,anon;
grant execute on function public.cpmr_schedule_library_state(uuid) to authenticated;

create or replace function public.cpmr_schedule_library_action(p_project uuid,p_action text,p_id uuid default null,p_parent uuid default null,p_name text default '',p_direction integer default 0,p_expected integer default 0) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare rev integer; f public.cpmr_schedule_folders%rowtype; sibling public.cpmr_schedule_folders%rowtype; next_order integer; base_id uuid; update_id uuid; recovery_id uuid; before_details jsonb;
begin
 if not public.cpmr_can_write(p_project,false) then raise exception 'You do not have permission to organize this project'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_project::text,0));
 insert into public.cpmr_schedule_library_meta(project_id) values(p_project) on conflict do nothing;
 select revision into rev from public.cpmr_schedule_library_meta where project_id=p_project for update;
 if p_expected is null or rev<>p_expected then raise exception 'Folder structure changed in another session. Reload before saving'; end if;
 if p_action is null or p_action not in ('initialize','create','rename','move_folder','delete_folder','reorder','move_version','trash_version','archive_version') then raise exception 'Unknown folder action'; end if;
 if p_parent is not null and not exists(select 1 from public.cpmr_schedule_folders where id=p_parent and project_id=p_project) then raise exception 'Destination folder is not in this project'; end if;
 if p_action in ('create','rename') and (p_name is null or length(trim(p_name)) not between 1 and 80) then raise exception 'Enter a folder name between 1 and 80 characters'; end if;
 if p_action in ('rename','move_folder','delete_folder','reorder') then
  select * into f from public.cpmr_schedule_folders where id=p_id and project_id=p_project for update;
  if not found then raise exception 'Folder no longer exists in this project'; end if;
  before_details:=to_jsonb(f);
 end if;
 if p_action in ('create','initialize') and (select count(*) from public.cpmr_schedule_folders where project_id=p_project)>497 then raise exception 'This project has reached its folder limit'; end if;
 if p_action in ('create','move_folder') and p_parent is not null then
  if (with recursive ancestors as (select id,parent_id,1 depth from public.cpmr_schedule_folders where id=p_parent and project_id=p_project union all select x.id,x.parent_id,a.depth+1 from public.cpmr_schedule_folders x join ancestors a on x.id=a.parent_id where x.project_id=p_project and a.depth<22) select max(depth) from ancestors)>=20 then raise exception 'Folder nesting is limited to 20 levels'; end if;
 end if;
 if p_action='initialize' then
  if exists(select 1 from public.cpmr_schedule_folders where project_id=p_project) then raise exception 'Starter folders are only available for an empty structure'; end if;
  insert into public.cpmr_schedule_folders(project_id,name,sort_order,created_by) values(p_project,'Baseline Schedules',0,auth.uid()) returning id into base_id;
  insert into public.cpmr_schedule_folders(project_id,name,sort_order,created_by) values(p_project,'Update Schedules',1,auth.uid()) returning id into update_id;
  insert into public.cpmr_schedule_folders(project_id,name,sort_order,created_by) values(p_project,'Recovery / Revisions',2,auth.uid()) returning id into recovery_id;
  insert into public.cpmr_schedule_filing(project_id,version_id,folder_id)
   select p_project,id,case when schedule_type::text in ('baseline','rebaseline') then base_id when schedule_type::text='update' then update_id else recovery_id end
   from public.schedule_versions where project_id=p_project and deleted_at is null and archived_at is null and schedule_type::text in ('baseline','rebaseline','update','recovery','fragnet')
   on conflict(version_id) do nothing;
 elsif p_action='create' then
  select coalesce(max(sort_order),-1)+1 into next_order from public.cpmr_schedule_folders where project_id=p_project and parent_id is not distinct from p_parent;
  insert into public.cpmr_schedule_folders(project_id,parent_id,name,sort_order,created_by) values(p_project,p_parent,trim(p_name),next_order,auth.uid());
 elsif p_action='rename' then
  update public.cpmr_schedule_folders set name=trim(p_name) where id=p_id;
 elsif p_action='move_folder' then
  if exists(with recursive descendants as (select id from public.cpmr_schedule_folders where id=p_id and project_id=p_project union all select c.id from public.cpmr_schedule_folders c join descendants d on c.parent_id=d.id where c.project_id=p_project) select 1 from descendants where id=p_parent) then raise exception 'A folder cannot be placed inside itself or a subfolder'; end if;
  if (with recursive subtree as (select id,1 depth from public.cpmr_schedule_folders where id=p_id and project_id=p_project union all select c.id,s.depth+1 from public.cpmr_schedule_folders c join subtree s on c.parent_id=s.id where c.project_id=p_project and s.depth<22), ancestors as (select id,parent_id,1 depth from public.cpmr_schedule_folders where id=p_parent and project_id=p_project union all select c.id,c.parent_id,a.depth+1 from public.cpmr_schedule_folders c join ancestors a on c.id=a.parent_id where c.project_id=p_project and a.depth<22) select coalesce((select max(depth) from subtree),1)+coalesce((select max(depth) from ancestors),0))>20 then raise exception 'This move would exceed 20 folder levels'; end if;
  select coalesce(max(sort_order),-1)+1 into next_order from public.cpmr_schedule_folders where project_id=p_project and parent_id is not distinct from p_parent;
  update public.cpmr_schedule_folders set parent_id=p_parent,sort_order=next_order where id=p_id;
 elsif p_action='delete_folder' then
  -- Promote contents, blocking a name collision instead of silently merging folders.
  if exists(select 1 from public.cpmr_schedule_folders c join public.cpmr_schedule_folders s on s.project_id=c.project_id and s.parent_id is not distinct from f.parent_id and lower(s.name)=lower(c.name) and s.id<>p_id where c.project_id=p_project and c.parent_id=p_id) then raise exception 'Rename conflicting subfolders before deleting this folder'; end if;
  update public.cpmr_schedule_filing set folder_id=f.parent_id where project_id=p_project and folder_id=p_id;
  update public.cpmr_schedule_folders set parent_id=f.parent_id where project_id=p_project and parent_id=p_id;
  delete from public.cpmr_schedule_folders where id=p_id;
 elsif p_action='reorder' then
  if p_direction not in (-1,1) or p_direction is null then raise exception 'Choose move up or move down'; end if;
  -- Use row_number so equal sort positions after promotion are still movable.
  with ranked as (select id,row_number() over(order by sort_order,lower(name),id)::integer n from public.cpmr_schedule_folders where project_id=p_project and parent_id is not distinct from f.parent_id)
  update public.cpmr_schedule_folders x set sort_order=r.n from ranked r where x.id=r.id;
  select * into f from public.cpmr_schedule_folders where id=p_id;
  select * into sibling from public.cpmr_schedule_folders where project_id=p_project and parent_id is not distinct from f.parent_id and sort_order=f.sort_order+p_direction;
  if found then update public.cpmr_schedule_folders set sort_order=case when id=p_id then sibling.sort_order else f.sort_order end where id in (p_id,sibling.id); end if;
 elsif p_action in ('trash_version','archive_version') then
  perform 1 from public.schedule_versions where id=p_id and project_id=p_project and deleted_at is null and archived_at is null for update;
  if not found then raise exception 'Select an active schedule in this project'; end if;
  if exists(select 1 from public.cpmr_control_references where project_id=p_project and (baseline_version_id=p_id or update_version_id=p_id)) then raise exception 'An assigned baseline or control update cannot be removed. Assign its replacement first'; end if;
  if p_action='trash_version' then update public.schedule_versions set deleted_at=now() where id=p_id and project_id=p_project;
  else update public.schedule_versions set archived_at=now() where id=p_id and project_id=p_project; end if;
 elsif p_action='move_version' then
  if not exists(select 1 from public.schedule_versions where project_id=p_project and id=p_id and deleted_at is null and archived_at is null) then raise exception 'Select an active schedule in this project'; end if;
  insert into public.cpmr_schedule_filing(project_id,version_id,folder_id) values(p_project,p_id,p_parent) on conflict(version_id) do update set folder_id=excluded.folder_id where cpmr_schedule_filing.project_id=p_project;
 end if;
 update public.cpmr_schedule_library_meta set revision=revision+1,updated_at=now() where project_id=p_project;
 insert into public.cpmr_schedule_library_events(project_id,actor_id,action,details) values(p_project,auth.uid(),p_action,jsonb_build_object('id',p_id,'parent',p_parent,'name',p_name,'before',before_details));
 return public.cpmr_schedule_library_state(p_project);
exception when unique_violation then raise exception 'A folder with that name already exists at the destination';
end $$;
create or replace function public.cpmr_unfile_moved_schedule() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if old.project_id is distinct from new.project_id then delete from public.cpmr_schedule_filing where version_id=old.id and project_id=old.project_id; end if;
 return new;
end $$;
revoke all on function public.cpmr_unfile_moved_schedule() from public,anon,authenticated;
drop trigger if exists cpmr_unfile_moved_schedule on public.schedule_versions;
create trigger cpmr_unfile_moved_schedule before update of project_id on public.schedule_versions for each row execute function public.cpmr_unfile_moved_schedule();

revoke all on function public.cpmr_schedule_library_action(uuid,text,uuid,uuid,text,integer,integer) from public,anon;
grant execute on function public.cpmr_schedule_library_action(uuid,text,uuid,uuid,text,integer,integer) to authenticated;
commit;
