begin;
do $$ begin
 if has_table_privilege('authenticated','public.cpmr_version_reviews','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.cpmr_control_references','INSERT,UPDATE,DELETE') or has_table_privilege('authenticated','public.cpmr_control_events','INSERT,UPDATE,DELETE') then raise exception 'Workflow tables must not permit direct authenticated writes'; end if;
 if not has_function_privilege('authenticated','public.cpmr_workflow_action(uuid,uuid,text,text,integer)','EXECUTE') then raise exception 'Authenticated workflow RPC grant missing'; end if;
 if has_function_privilege('anon','public.cpmr_workflow_action(uuid,uuid,text,text,integer)','EXECUTE') then raise exception 'Anonymous workflow execution must be revoked'; end if;
end $$;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true);
do $$ declare denied boolean:=false; begin
 begin perform public.cpmr_workflow_action('00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','APPROVED','Unauthorized probe',0);
 exception when raise_exception then if sqlerrm like 'Only an authorized%' then denied:=true; else raise; end if; end;
 if not denied then raise exception 'Unrelated actor was not denied'; end if;
end $$;
rollback;
