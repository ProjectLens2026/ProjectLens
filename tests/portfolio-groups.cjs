const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react')
const root=path.resolve(__dirname,'..')
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Map,Set,Number,JSON,AbortController,console,crypto:require('node:crypto').webcrypto,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),...globals});return exports}
function hooks(){let slots=[],cursor=0,pending=[];const api={...React,useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return[slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i]},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}};return{api,render(fn){cursor=0;pending=[];const out=fn();for(const f of pending)f();return out},unmount(){for(const s of slots)s?.cleanup?.()}}}
const walk=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>walk(x,p)):[...(p(n)?[n]:[]),...walk(n.props?.children,p)]
const org='10000000-0000-4000-8000-000000000001',org2='10000000-0000-4000-8000-000000000002',g1='20000000-0000-4000-8000-000000000001',g2='20000000-0000-4000-8000-000000000002',project='30000000-0000-4000-8000-000000000001'
const workflow=load('src/lib/controlWorkflow.ts')
const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
async function main(){
 let calls=[],reply,error=null
 const lib=load('src/lib/portfolioGroups.ts',{'./controlWorkflow':workflow,'./supabase/client':{createClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:reply,error}}})}})
 const params=lib.groupDirectoryParams(org,g1,' find ','active',' Construction ','name',2,25)
 assert.equal(params.p_group,g1);assert.equal(params.p_page,2);assert.equal(params.p_query,'find');assert.equal(params.p_unassigned,false)
 assert.equal(lib.groupDirectoryParams(org,'unassigned','','','','updated',0,25).p_unassigned,true)
 assert.equal(lib.groupDirectoryParams(org,'all','','','','updated',0,25).p_group,null)
 await assert.rejects(lib.savePortfolioGroup(org,null,'Unassigned','program'),/reserved/)
 await assert.rejects(lib.savePortfolioGroup(org,null,' '.repeat(5),'program'),/name/)
 const original={id:g1,name:'IAD',kind:'program',revision:3,project_count:5}
 reply={...original,org_id:org,revision:4,name:'IAD programs'};await lib.savePortfolioGroup(org,original,' IAD programs ','program');assert.equal(calls.at(-1).args.p_expected,3);assert.equal(calls.at(-1).args.p_name,'IAD programs')
 reply={...reply,org_id:org2};await assert.rejects(lib.savePortfolioGroup(org,original,'IAD programs','program'),/verified/)
 error={message:'Only organization owners/admins can assign'};await assert.rejects(lib.assignPortfolioProject({id:project,project_updated_at:'2026-11-21T12:00:00.123456+00:00'},g1),/owners\/admins/)
 error=null;reply={project_id:project,group_id:g1,updated_at:'new'};await lib.assignPortfolioProject({id:project,project_updated_at:'2026-11-21T12:00:00.123456+00:00'},g1);assert.equal(calls.at(-1).args.p_expected,'2026-11-21T12:00:00.123456+00:00')
 reply={project_id:project,group_id:g2};await assert.rejects(lib.assignPortfolioProject({id:project,project_updated_at:'stamp'},g1),/verified/)
 await assert.rejects(lib.assignPortfolioProject({id:project,project_updated_at:''},g1),/Reload/)
 let saved,saveOk=true
 const create=load('src/lib/portfolioCreation.ts',{'./controlWorkflow':workflow,'./supabase/db':{insertProjectToSupabase:async p=>{saved=p;return saveOk}}}).createPortfolioProject
 await create({code:'IAD-290',name:'Example',address:'Street',stage:'Construction',status:'Active',groupId:g1});assert.equal(saved.portfolioGroupId,g1);assert.equal(saved.versions.length,0);assert.equal(saved.controlBasis.projectProfile.address,'Street')
 saveOk=false;await assert.rejects(create({code:'IAD-290',name:'Example',address:'',stage:'',status:'Active',groupId:g1}),/not saved/)

 // Directory filtering is passed to the server; a new scope cannot briefly display old rows.
 const dh=hooks(),requests=[],timers=new Map();let nextTimer=0
 const ddb={rpc:(name,args)=>({abortSignal:signal=>new Promise(resolve=>requests.push({name,args,signal,resolve}))})}
 const Directory=load('src/components/useProjectDirectory.ts',{'react':dh.api,'@/lib/supabase/client':{createClient:()=>ddb},'@/lib/portfolioGroups':lib},{setTimeout:fn=>{timers.set(++nextTimer,fn);return nextTimer},clearTimeout:id=>timers.delete(id)}).useProjectDirectory
 const flush=()=>{for(const [id,fn]of [...timers]){timers.delete(id);void fn()}}
 let scope=g1;const renderDirectory=()=>dh.render(()=>Directory(org,25,scope))
 renderDirectory();flush();assert.equal(requests[0].args.p_group,g1)
 requests[0].resolve({data:[{id:'first',total_count:1}],error:null});await tick();let state=renderDirectory();assert.equal(state.rows[0].id,'first')
 state.reload();renderDirectory();flush();const stale=requests.at(-1)
 scope=g2;state=renderDirectory();assert.equal(state.rows.length,0,'Old program rows must disappear on the first new-scope render');flush();assert.equal(requests.at(-1).args.p_group,g2);assert.equal(stale.signal.aborted,true)
 stale.resolve({data:[{id:'stale',total_count:1}],error:null});await tick();assert.equal(renderDirectory().rows.length,0)
 requests.at(-1).resolve({data:[{id:'second',total_count:1}],error:null});await tick();assert.equal(renderDirectory().rows[0].id,'second');dh.unmount();assert.equal(timers.size,0)

 // Organization switches isolate group lists and reject late responses.
 const gh=hooks(),groupRequests=[]
 const GroupHook=load('src/components/usePortfolioGroups.ts',{'react':gh.api,'@/lib/portfolioGroups':lib,'@/lib/supabase/client':{createClient:()=>({rpc:()=>({abortSignal:signal=>new Promise(resolve=>groupRequests.push({signal,resolve}))})})}}).usePortfolioGroups
 let activeOrg=org;const renderGroups=()=>gh.render(()=>GroupHook(activeOrg));renderGroups();activeOrg=org2;assert.equal(renderGroups().groups.length,0)
 groupRequests[0].resolve({data:{can_manage:true,groups:[original],unassigned_count:0,total_count:5}});await tick();assert.equal(renderGroups().groups.length,0)
 groupRequests[1].resolve({data:{can_manage:false,groups:[],unassigned_count:2,total_count:2}});await tick();assert.equal(renderGroups().total_count,2);assert.equal(renderGroups().can_manage,false);gh.unmount()

 // A rename retains the revision read when the dialog opened.
 const eh=hooks(),renames=[];let propGroup=original
 const Editor=load('src/components/PortfolioGroupEditor.tsx',{'react':eh.api,'./WorkspaceDialog':{default:()=>null},'@/lib/portfolioGroups':{savePortfolioGroup:async(...args)=>{renames.push(args);return original}}}).default
 const renderEditor=()=>eh.render(()=>Editor({orgId:org,group:propGroup,onSaved(){}}));let editor=renderEditor();walk(editor,n=>n.type==='button')[0].props.onClick();propGroup={...original,revision:9};editor=renderEditor();await walk(editor,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});assert.equal(renames[0][1].revision,3);eh.unmount()
 const branding=load('src/lib/workspaceBranding.ts');assert.equal(branding.workspaceAccountLabel({name:'ControlLens Support',initials:'CS'}),'CPMreview Support');assert.equal(branding.workspaceAccountLabel({name:'NJ',initials:'NJ'}),'NJ · NJ')
 const sql=fs.readFileSync(path.join(root,'migrations/20261121_portfolio_groups.sql'),'utf8')
 assert.ok(sql.includes('foreign key(org_id,portfolio_group_id) references public.cpmr_portfolio_groups(org_id,id)'))
 assert.ok(sql.includes('p.updated_at is distinct from p_expected'))
 assert.ok(sql.includes('before insert or update of portfolio_group_id,org_id'))
 assert.ok(sql.includes("m.role in ('owner','admin')"))
 assert.ok(!sql.includes('drop policy')||!sql.includes('drop policy if exists cpmr_project_'))
 for(const name of ['cpmr_portfolio_groups_state','cpmr_group_project_directory'])assert.match(sql,new RegExp('function public\\.'+name+'[\\s\\S]*?security invoker'))
 console.log('PASS: grouped server pagination, stale-response isolation, permission errors, exact revision/timestamp guards, atomic grouped creation, verified assignment, rename snapshot and original-user/support branding. SQL live execution remains a separate deployment check.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
