-- Run after 20261121_portfolio_groups.sql. Read-only deployment checks.
do $$
declare fn regprocedure;
begin
 if not exists(select 1 from pg_class where oid='public.cpmr_portfolio_groups'::regclass and relrowsecurity) then raise exception 'Portfolio group RLS must be enabled'; end if;
 if not exists(select 1 from pg_constraint where conname='cpmr_project_group_same_org' and conrelid='public.projects'::regclass and contype='f') then raise exception 'Same-organization project/group constraint is missing'; end if;
 if has_table_privilege('anon','public.cpmr_portfolio_groups','SELECT') or has_table_privilege('authenticated','public.cpmr_portfolio_groups','INSERT,UPDATE,DELETE') then raise exception 'Direct group writes must remain revoked'; end if;
 foreach fn in array array['public.cpmr_portfolio_groups_state(uuid)'::regprocedure,'public.cpmr_save_portfolio_group(uuid,uuid,text,text,integer)'::regprocedure,'public.cpmr_assign_portfolio_project(uuid,uuid,timestamp with time zone)'::regprocedure,'public.cpmr_group_project_directory(uuid,uuid,boolean,text,text,text,text,integer,integer)'::regprocedure] loop
  if has_function_privilege('anon',fn,'EXECUTE') then raise exception 'Anonymous execution must be revoked: %',fn; end if;
  if not has_function_privilege('authenticated',fn,'EXECUTE') then raise exception 'Authenticated execution is missing: %',fn; end if;
 end loop;
 if exists(select 1 from pg_proc where oid in ('public.cpmr_portfolio_groups_state(uuid)'::regprocedure,'public.cpmr_group_project_directory(uuid,uuid,boolean,text,text,text,text,integer,integer)'::regprocedure) and prosecdef) then raise exception 'Read functions must preserve caller project RLS'; end if;
 if not exists(select 1 from pg_trigger where tgrelid='public.projects'::regclass and tgname='cpmr_project_group_guard' and tgenabled<>'D') then raise exception 'Project-group write guard is missing'; end if;
end $$;
