begin;
-- Reuses the installed project-controls authorization; no new project access grants.
do $$ begin
 if to_regprocedure('public.cpmr_can_write(uuid,boolean)') is null then raise exception 'Install the project-controls migration first'; end if;
end $$;
create table if not exists public.cpmr_scheduler_reports(
 version_id uuid primary key references public.schedule_versions(id),project_id uuid not null references public.projects(id),
 payload jsonb not null,revision integer not null default 1,updated_at timestamptz not null default now(),updated_by uuid not null references auth.users(id),
 foreign key(project_id,version_id) references public.schedule_versions(project_id,id),
 check(jsonb_typeof(payload)='object' and pg_column_size(payload)<=12000000));
create table if not exists public.cpmr_scheduler_report_history(
 version_id uuid not null references public.cpmr_scheduler_reports(version_id),project_id uuid not null references public.projects(id),revision integer not null,
 payload jsonb not null,saved_at timestamptz not null default now(),saved_by uuid not null references auth.users(id),primary key(version_id,revision),
 foreign key(project_id,version_id) references public.schedule_versions(project_id,id));
alter table public.cpmr_scheduler_reports enable row level security;
alter table public.cpmr_scheduler_report_history enable row level security;
drop policy if exists cpmr_scheduler_report_read on public.cpmr_scheduler_reports;
create policy cpmr_scheduler_report_read on public.cpmr_scheduler_reports for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
drop policy if exists cpmr_scheduler_report_history_read on public.cpmr_scheduler_report_history;
create policy cpmr_scheduler_report_history_read on public.cpmr_scheduler_report_history for select to authenticated using(exists(select 1 from public.projects p where p.id=project_id));
revoke all on public.cpmr_scheduler_reports,public.cpmr_scheduler_report_history from public,anon,authenticated;
grant select on public.cpmr_scheduler_reports,public.cpmr_scheduler_report_history to authenticated;
create or replace function public.cpmr_save_scheduler_report(p_project uuid,p_version uuid,p_expected integer,p_payload jsonb) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare actual integer;stamp timestamptz:=now();
begin
 if not public.cpmr_can_write(p_project,false) then raise exception 'Project editing permission required'; end if;
 if not exists(select 1 from public.schedule_versions s where s.id=p_version and s.project_id=p_project and s.deleted_at is null and s.archived_at is null) then raise exception 'Active schedule version required'; end if;
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or coalesce(p_payload->>'format','')<>'1' or coalesce(p_payload->>'type','') not in ('baseline','update') or jsonb_typeof(p_payload->'sections') is distinct from 'array' or jsonb_array_length(p_payload->'sections')>100 or octet_length(p_payload::text)>12000000 then raise exception 'Invalid or oversized report'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_version::text,22));
 select r.revision into actual from public.cpmr_scheduler_reports r where r.version_id=p_version;
 if p_expected is null or p_expected<>coalesce(actual,0) then raise exception 'This report changed on another device. Reload before saving; your draft has not been overwritten'; end if;
 actual:=coalesce(actual,0)+1;
 insert into public.cpmr_scheduler_reports(version_id,project_id,payload,revision,updated_at,updated_by) values(p_version,p_project,p_payload,actual,stamp,auth.uid())
 on conflict(version_id) do update set payload=excluded.payload,revision=excluded.revision,updated_at=excluded.updated_at,updated_by=excluded.updated_by;
 insert into public.cpmr_scheduler_report_history(version_id,project_id,revision,payload,saved_at,saved_by) values(p_version,p_project,actual,p_payload,stamp,auth.uid());
 return jsonb_build_object('revision',actual,'saved_at',stamp);
end $$;
revoke all on function public.cpmr_save_scheduler_report(uuid,uuid,integer,jsonb) from public,anon;
grant execute on function public.cpmr_save_scheduler_report(uuid,uuid,integer,jsonb) to authenticated;
commit;
