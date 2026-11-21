begin;
-- Organization-owned company/program labels. Project access continues to use existing RLS.
do $$ begin
 if to_regprocedure('public.cpmr_can_write(uuid,boolean)') is null then raise exception 'Apply the project-controls migration first'; end if;
end $$;
create or replace function public.cpmr_can_manage_portfolio(p_org uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select auth.uid() is not null and exists(select 1 from public.organization_members m where m.org_id=p_org and m.user_id=auth.uid() and m.role in ('owner','admin'));
$$;
revoke all on function public.cpmr_can_manage_portfolio(uuid) from public,anon;
grant execute on function public.cpmr_can_manage_portfolio(uuid) to authenticated;

create table if not exists public.cpmr_portfolio_groups(
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 name text not null check(length(trim(name)) between 1 and 80),
 kind text not null default 'program' check(kind in ('company','program')),
 revision integer not null default 0, created_at timestamptz not null default now(),
 created_by uuid not null references auth.users(id), updated_at timestamptz not null default now(),
 unique(org_id,id));
create unique index if not exists cpmr_portfolio_group_name on public.cpmr_portfolio_groups(org_id,lower(trim(name)));
alter table public.cpmr_portfolio_groups enable row level security;
drop policy if exists cpmr_portfolio_group_read on public.cpmr_portfolio_groups;
create policy cpmr_portfolio_group_read on public.cpmr_portfolio_groups for select to authenticated using(exists(select 1 from public.organization_members m where m.org_id=cpmr_portfolio_groups.org_id and m.user_id=auth.uid()));
revoke all on public.cpmr_portfolio_groups from public,anon,authenticated;
grant select on public.cpmr_portfolio_groups to authenticated;

alter table public.projects add column if not exists portfolio_group_id uuid;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='cpmr_project_group_same_org' and conrelid='public.projects'::regclass) then
  alter table public.projects add constraint cpmr_project_group_same_org foreign key(org_id,portfolio_group_id) references public.cpmr_portfolio_groups(org_id,id);
 end if;
end $$;
create index if not exists cpmr_project_group_directory on public.projects(org_id,portfolio_group_id,status,updated_at desc);

create or replace function public.cpmr_guard_project_group() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then
  if new.portfolio_group_id is null then return new; end if;
 else
  if new.portfolio_group_id is not distinct from old.portfolio_group_id and new.org_id is not distinct from old.org_id then return new; end if;
  if new.portfolio_group_id is null and old.portfolio_group_id is null then return new; end if;
  if new.org_id is distinct from old.org_id and not public.cpmr_can_manage_portfolio(old.org_id) then raise exception 'Organization management permission required'; end if;
 end if;
 if not public.cpmr_can_manage_portfolio(new.org_id) then raise exception 'Only organization owners/admins can assign company/program groups'; end if;
 if new.portfolio_group_id is not null and not exists(select 1 from public.cpmr_portfolio_groups g where g.id=new.portfolio_group_id and g.org_id=new.org_id) then raise exception 'Select a company/program in this organization'; end if;
 return new;
end $$;
revoke all on function public.cpmr_guard_project_group() from public,anon,authenticated;
drop trigger if exists cpmr_project_group_guard on public.projects;
create trigger cpmr_project_group_guard before insert or update of portfolio_group_id,org_id on public.projects for each row execute function public.cpmr_guard_project_group();

create or replace function public.cpmr_portfolio_groups_state(p_org uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('can_manage',public.cpmr_can_manage_portfolio(p_org),
 'groups',coalesce((select jsonb_agg(x order by lower(x.name),x.id) from (
  select g.id,g.name,g.kind,g.revision,(select count(*) from public.projects p where p.org_id=p_org and p.portfolio_group_id=g.id and p.status not in ('deleted','archived')) project_count
  from public.cpmr_portfolio_groups g where g.org_id=p_org)x),'[]'::jsonb),
 'unassigned_count',(select count(*) from public.projects p where p.org_id=p_org and p.portfolio_group_id is null and p.status not in ('deleted','archived')),
 'total_count',(select count(*) from public.projects p where p.org_id=p_org and p.status not in ('deleted','archived')))
 where exists(select 1 from public.organization_members m where m.org_id=p_org and m.user_id=auth.uid());
$$;
revoke all on function public.cpmr_portfolio_groups_state(uuid) from public,anon;
grant execute on function public.cpmr_portfolio_groups_state(uuid) to authenticated;

create or replace function public.cpmr_save_portfolio_group(p_org uuid,p_id uuid default null,p_name text default '',p_kind text default 'program',p_expected integer default null) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare g public.cpmr_portfolio_groups%rowtype;
begin
 if not public.cpmr_can_manage_portfolio(p_org) then raise exception 'Company/program management requires organization owner/admin permission'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 80 then raise exception 'Enter a name between 1 and 80 characters'; end if;
 if lower(trim(p_name)) in ('unassigned','all projects') then raise exception 'Choose a different name; this label is reserved'; end if;
 if p_kind is null or p_kind not in ('company','program') then raise exception 'Select Company or Program'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_org::text,20261121));
 if p_id is null then
  insert into public.cpmr_portfolio_groups(org_id,name,kind,created_by) values(p_org,trim(p_name),p_kind,auth.uid()) returning * into g;
 else
  select * into g from public.cpmr_portfolio_groups where id=p_id and org_id=p_org for update;
  if not found then raise exception 'Company/program not found in this organization'; end if;
  if p_expected is null or g.revision<>p_expected then raise exception 'This group changed in another session. Reload before saving'; end if;
  update public.cpmr_portfolio_groups set name=trim(p_name),kind=p_kind,revision=revision+1,updated_at=clock_timestamp() where id=p_id returning * into g;
 end if;
 return to_jsonb(g);
exception when unique_violation then raise exception 'A company/program with that name already exists';
end $$;
revoke all on function public.cpmr_save_portfolio_group(uuid,uuid,text,text,integer) from public,anon;
grant execute on function public.cpmr_save_portfolio_group(uuid,uuid,text,text,integer) to authenticated;

create or replace function public.cpmr_assign_portfolio_project(p_project uuid,p_group uuid,p_expected timestamptz) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.projects%rowtype;
begin
 if not public.cpmr_can_write(p_project,true) then raise exception 'Project assignment requires organization owner/admin permission'; end if;
 select * into p from public.projects where id=p_project for update;
 if not found or not public.cpmr_can_manage_portfolio(p.org_id) then raise exception 'Project unavailable or permission denied'; end if;
 if p_expected is null or p.updated_at is distinct from p_expected then raise exception 'Project changed in another session. Reload before assigning'; end if;
 if p_group is not null and not exists(select 1 from public.cpmr_portfolio_groups g where g.id=p_group and g.org_id=p.org_id) then raise exception 'Select a company/program in this organization'; end if;
 update public.projects set portfolio_group_id=p_group,updated_at=clock_timestamp() where id=p_project returning * into p;
 return jsonb_build_object('project_id',p.id,'group_id',p.portfolio_group_id,'updated_at',p.updated_at);
end $$;
revoke all on function public.cpmr_assign_portfolio_project(uuid,uuid,timestamptz) from public,anon;
grant execute on function public.cpmr_assign_portfolio_project(uuid,uuid,timestamptz) to authenticated;

-- Separate RPC preserves callers of the original directory while filtering BEFORE pagination.
create or replace function public.cpmr_group_project_directory(p_org uuid,p_group uuid default null,p_unassigned boolean default false,p_query text default '',p_status text default '',p_stage text default '',p_sort text default 'updated',p_page integer default 0,p_size integer default 25)
returns table(id uuid,name text,project_code text,status text,stage text,address text,data_date text,uploaded_at text,reviewed_at text,decision text,total_count bigint,group_id uuid,project_updated_at text)
language sql stable security invoker set search_path=pg_catalog,public as $$
 select p.id,p.name::text,p.project_code::text,p.status::text,coalesce(p.control_basis->'projectProfile'->>'stage',p.phase,''),coalesce(p.control_basis->'projectProfile'->>'address',''),v.data_date::text,v.uploaded_at::text,r.reviewed_at::text,r.disposition,count(*) over(),p.portfolio_group_id,p.updated_at::text
 from public.projects p left join lateral(select s.id,s.data_date,s.uploaded_at from public.schedule_versions s where s.project_id=p.id and s.deleted_at is null and s.archived_at is null order by s.uploaded_at desc,s.data_date desc nulls last,s.id limit 1)v on true
 left join public.cpmr_version_reviews r on r.version_id=v.id
 where p.org_id=p_org and p.status not in ('deleted','archived') and (p_group is null or p.portfolio_group_id=p_group) and (not p_unassigned or p.portfolio_group_id is null)
 and (p_status='' or p.status=p_status)
 and (p_stage='' or strpos(lower(coalesce(p.control_basis->'projectProfile'->>'stage',p.phase,'')),lower(p_stage))>0)
 and (p_query='' or strpos(lower(coalesce(p.project_code,'')||' '||p.name||' '||coalesce(p.control_basis->'projectProfile'->>'address','')),lower(left(p_query,150)))>0)
 order by case when p_sort='name' then lower(p.name) end asc,case when p_sort='data_date' then v.data_date end desc nulls last,case when p_sort='uploaded' then v.uploaded_at end desc nulls last,p.updated_at desc,p.id
 limit greatest(1,least(p_size,100)) offset greatest(0,p_page)*greatest(1,least(p_size,100));
$$;
revoke all on function public.cpmr_group_project_directory(uuid,uuid,boolean,text,text,text,text,integer,integer) from public,anon;
grant execute on function public.cpmr_group_project_directory(uuid,uuid,boolean,text,text,text,text,integer,integer) to authenticated;
notify pgrst,'reload schema';
commit;
