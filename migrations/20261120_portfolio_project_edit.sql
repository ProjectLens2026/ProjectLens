begin;
-- Edit project metadata atomically; schedule labels, source XER and review basis are not rewritten.
create or replace function public.cpmr_portfolio_project_details(p_project uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'code',coalesce(p.project_code,''),'name',p.name,'address',coalesce(p.control_basis->'projectProfile'->>'address',''),'stage',coalesce(p.control_basis->'projectProfile'->>'stage',p.phase,''),'status',p.status,'updated_at',p.updated_at,'can_edit',public.cpmr_can_write(p.id,false))
 from public.projects p where p.id=p_project and p.status not in ('deleted','archived');
$$;
revoke all on function public.cpmr_portfolio_project_details(uuid) from public,anon;
grant execute on function public.cpmr_portfolio_project_details(uuid) to authenticated;
create or replace function public.cpmr_edit_portfolio_project(p_project uuid,p_expected timestamptz,p_code text,p_name text,p_address text,p_stage text,p_status text) returns jsonb
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.projects%rowtype;
begin
 if not public.cpmr_can_write(p_project,false) then raise exception 'Project edit permission required'; end if;
 if p_code is null or length(trim(p_code)) not between 1 and 50 or p_name is null or length(trim(p_name)) not between 1 and 160 then raise exception 'Enter a project number and project name'; end if;
 if length(coalesce(p_address,''))>500 or length(coalesce(p_stage,''))>100 then raise exception 'Address or stage is too long'; end if;
 if p_status is null or p_status not in ('active','on_hold','completed') then raise exception 'Select Active, On Hold or Completed'; end if;
 select * into p from public.projects where id=p_project for update;
 if not found then raise exception 'Project not found'; end if;
 if p_expected is null or p.updated_at is distinct from p_expected then raise exception 'Project changed in another session. Reload its details before saving'; end if;
 p.status:=p_status;
 update public.projects set project_code=trim(p_code),name=trim(p_name),status=p.status,
 control_basis=jsonb_set(coalesce(control_basis,'{}'::jsonb),'{projectProfile}',coalesce(control_basis->'projectProfile','{}'::jsonb)||jsonb_build_object('address',trim(coalesce(p_address,'')),'stage',trim(coalesce(p_stage,'')))),updated_at=clock_timestamp()
 where id=p_project;
 return public.cpmr_portfolio_project_details(p_project);
end $$;
revoke all on function public.cpmr_edit_portfolio_project(uuid,timestamptz,text,text,text,text,text) from public,anon;
grant execute on function public.cpmr_edit_portfolio_project(uuid,timestamptz,text,text,text,text,text) to authenticated;
commit;
