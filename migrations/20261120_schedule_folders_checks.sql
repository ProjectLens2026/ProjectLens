-- Run after the migration in the Supabase SQL Editor. Read-only checks.
do $$ declare signature text; table_name text;
begin
 foreach signature in array array['public.cpmr_schedule_library_state(uuid)','public.cpmr_schedule_library_action(uuid,text,uuid,uuid,text,integer,integer)'] loop
  if to_regprocedure(signature) is null then raise exception 'Missing function: %',signature; end if;
  if has_function_privilege('anon',signature,'EXECUTE') then raise exception 'Anonymous execution must be revoked: %',signature; end if;
  if not has_function_privilege('authenticated',signature,'EXECUTE') then raise exception 'Authenticated execution is missing: %',signature; end if;
 end loop;
 foreach table_name in array array['cpmr_schedule_library_meta','cpmr_schedule_folders','cpmr_schedule_filing','cpmr_schedule_library_events'] loop
  if not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=table_name and c.relrowsecurity) then raise exception 'RLS is missing: %',table_name; end if;
  if has_table_privilege('authenticated','public.'||table_name,'INSERT') or has_table_privilege('authenticated','public.'||table_name,'UPDATE') or has_table_privilege('authenticated','public.'||table_name,'DELETE') then raise exception 'Direct writes must be revoked: %',table_name; end if;
 end loop;
end $$;
select 'Schedule-folder access checks passed. Test team roles and folder actions in the application.' as result;
