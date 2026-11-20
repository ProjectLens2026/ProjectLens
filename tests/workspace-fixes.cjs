const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react')
const root=path.resolve(__dirname,'..')
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Map,Set,URLSearchParams,console,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),...globals});return exports}
function hooks(){let slots=[],cursor=0,pending=[];const api={...React,useId:()=>{const i=cursor++;return 'menu-'+i},useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i]},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}};return {api,render(fn,refs){cursor=0;pending=[];const out=fn();refs?.(out);for(const f of pending)f();return out},unmount(){for(const s of slots)s?.cleanup?.()}}}
const walk=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>walk(x,p)):[...(p(n)?[n]:[]),...walk(n.props?.children,p)]
async function main(){
 // Closing behavior uses the actual menu component and its event handlers.
 const h=hooks(),events=new Map(),button={focus(){this.focused=true}},container={contains:target=>target==='inside',querySelector:()=>null}
 const Menu=load('src/components/WorkspaceMenu.tsx',{'react':h.api},{document:{addEventListener:(name,fn)=>events.set(name,fn),removeEventListener:(name,fn)=>{if(events.get(name)===fn)events.delete(name)},activeElement:null}}).default
 const renderMenu=()=>h.render(()=>Menu({label:'Folder actions',children:React.createElement('button',null,'Create')}),tree=>{tree.ref.current=container;walk(tree,n=>n.type==='button')[0].ref.current=button})
 let menu=renderMenu();walk(menu,n=>n.type==='button')[0].props.onClick();menu=renderMenu();assert.equal(walk(menu,n=>n.props?.role==='menu').length,1)
 walk(menu,n=>n.props?.role==='menu')[0].props.onClick({target:{closest:()=>true}});menu=renderMenu();assert.equal(walk(menu,n=>n.props?.role==='menu').length,0,'Choosing an item closes the menu before/with the dialog')
 walk(menu,n=>n.type==='button')[0].props.onClick();menu=renderMenu();events.get('pointerdown')({target:'outside'});menu=renderMenu();assert.equal(walk(menu,n=>n.props?.role==='menu').length,0)
 walk(menu,n=>n.type==='button')[0].props.onClick();menu=renderMenu();events.get('keydown')({key:'Escape',preventDefault(){}});menu=renderMenu();assert.equal(walk(menu,n=>n.props?.role==='menu').length,0);assert.equal(button.focused,true);h.unmount();assert.equal(events.size,0)

 // Unfiled versions have exactly the same action component as foldered/table versions.
 const a=hooks(),folderDialog={default:()=>null},menuStub={default:({children})=>React.createElement('div',null,children)}
 const Actions=load('src/components/ScheduleVersionActions.tsx',{'react':a.api,'@/lib/controlWorkflow':{cloudId:x=>x},'@/lib/scheduleFolders':{folderForVersion:()=>null},'./ScheduleFoldersProvider':{useScheduleFolders:()=>({library:{can_edit:true},loading:false,error:'',busy:false})},'./ScheduleFolderDialog':folderDialog,'./WorkspaceMenu':menuStub}).default
 let actionTree=a.render(()=>Actions({version:{id:'v',fileName:'unfiled.xer'},compact:true}));const move=walk(actionTree,n=>n.type==='button'&&n.props.children==='Move to folder…')[0];assert.ok(move);move.props.onClick();actionTree=a.render(()=>Actions({version:{id:'v',fileName:'unfiled.xer'},compact:true}));assert.equal(walk(actionTree,n=>n.type===folderDialog.default)[0].props.edit.id,'v');assert.equal(walk(actionTree,n=>n.type==='button'&&n.props.children==='Archive').length,1);a.unmount()

 const editCalls=[],original={id:'p',code:'IAD174',name:'Original',address:'',stage:'',status:'active',updated_at:'2026-11-20T12:00:00.123456+00:00',can_edit:true}
 const editing=load('src/lib/portfolioEditing.ts',{'./controlWorkflow':{cloudId:x=>x},'./supabase/client':{createClient:()=>({rpc:async(name,args)=>{editCalls.push({name,args});return {data:{...original,name:args?.p_name||original.name},error:null}}})}})
 await editing.loadPortfolioProjectDetails('p');await editing.savePortfolioProjectDetails(original,{...original,name:'Changed',address:'Updated Street'})
 assert.equal(editCalls[1].args.p_expected,original.updated_at,'Do not lose timestamp precision used for stale-write protection')
 assert.equal(editCalls[1].args.p_name,'Changed');assert.equal(editCalls[1].args.p_address,'Updated Street')
 await assert.rejects(editing.savePortfolioProjectDetails({...original,can_edit:false},original),/permission/)
 const sql=fs.readFileSync(path.join(root,'migrations/20261120_portfolio_project_edit.sql'),'utf8');assert.ok(sql.includes('cpmr_can_write(p_project,false)')&&sql.includes('p.updated_at is distinct from p_expected'));assert.ok(!sql.includes('reviewBasisEnabled'));assert.ok(!/update public\.schedule_versions/i.test(sql));assert.ok(sql.includes('from public,anon'))

 // Upload filing cannot happen before the durable version/source exists, and retries do not insert.
 let sourceReady=true,folderExists=true,writeError=false,verifyPlacement=true,reads=0,writeCalls=[]
 const library={revision:7,can_edit:true,folders:[{id:'folder-1'}],filing:[]}
 const db={from:table=>{assert.equal(table,'schedule_versions');reads++;const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:sourceReady?{id:'v',raw_xer_path:'original.xer',analysis_path:'analysis.gz'}:null,error:null})};return q},rpc:async(name,args)=>{if(name.endsWith('_state'))return {data:{...library,folders:folderExists?library.folders:[]},error:null};writeCalls.push({name,args});return writeError?{error:{message:'Revision changed'}}:{data:{...library,filing:verifyPlacement?[{version_id:'v',folder_id:args.p_parent}]:[]},error:null}}}
 const upload=load('src/lib/uploadDestination.ts',{'./supabase/client':{createClient:()=>db},'./controlWorkflow':{cloudId:x=>x},'./scheduleFolders':{validLibrary:v=>!!v&&Array.isArray(v.filing)&&Array.isArray(v.folders)}})
 assert.ok(upload.scheduleUploadUrl('p','folder-1').includes('folder=folder-1'))
 assert.equal(new URLSearchParams(upload.scheduleUploadUrl('p','all').split('?')[1]).get('folder'),'')
 const target={projectId:'p',versionId:'v',folderId:'folder-1'}
 sourceReady=false;await assert.rejects(upload.completeUploadDestination(target),/not both finished/);assert.equal(writeCalls.length,0)
 sourceReady=true;folderExists=false;await assert.rejects(upload.completeUploadDestination(target),/no longer exists/);assert.equal(writeCalls.length,0)
 folderExists=true;writeError=true;await assert.rejects(upload.completeUploadDestination(target),/Revision changed/)
 writeError=false;verifyPlacement=false;await assert.rejects(upload.completeUploadDestination(target),/could not be verified/)
 verifyPlacement=true;assert.equal(await upload.completeUploadDestination(target),'/dashboard/schedules?project=p&folder=folder-1');assert.equal(writeCalls.at(-1).args.p_expected,7)
 assert.equal(await upload.completeUploadDestination({...target,folderId:null}),'/dashboard/schedules?project=p&folder=unfiled');assert.ok(reads>=5)
 assert.ok(writeCalls.every(c=>c.args.p_action==='move_version'),'Verification/filing retries never insert another submission')

 // The destination picker applies the requested folder only within its originating project.
 const destinationHooks=hooks(),choices=[];let deferred=[],delayed=false
 const Destination=load('src/components/UploadDestination.tsx',{'react':destinationHooks.api,'@/lib/supabase/client':{createClient:()=>({rpc:async()=>delayed?new Promise(resolve=>deferred.push(resolve)):{data:{...library,folders:[{id:'folder-1',name:'Baseline Rev 01',parent_id:null}]},error:null}})},'@/lib/controlWorkflow':{cloudId:x=>x},'@/lib/scheduleFolders':{validLibrary:v=>!!v&&Array.isArray(v.folders),folderPath:(f,id)=>f.find(x=>x.id===id)?.name||'Unfiled'}}).default
 const tick=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
 const props={projectId:'p',requestedProject:'p',requestedFolder:'folder-1',onChange:x=>choices.push(x)}
 let destinationTree=destinationHooks.render(()=>Destination(props));await tick();destinationTree=destinationHooks.render(()=>Destination(props));assert.equal(choices.at(-1).folderId,'folder-1');assert.equal(choices.at(-1).ready,true)
 const otherProps={...props,projectId:'other'};destinationTree=destinationHooks.render(()=>Destination(otherProps));await tick();destinationTree=destinationHooks.render(()=>Destination(otherProps));assert.equal(choices.at(-1).folderId,null,'Switching projects must not carry the old folder');assert.equal(choices.at(-1).projectId,'other')
 delayed=true;destinationHooks.render(()=>Destination({...props,projectId:'slow'}));destinationHooks.render(()=>Destination({...props,projectId:'new'}));deferred[0]({data:{...library,folders:[]},error:null});await tick();assert.equal(choices.at(-1).projectId,'new','An old request cannot publish a destination into the new project');deferred[1]({data:{...library,folders:[]},error:null});await tick();destinationHooks.unmount()

 // Existing upload writes expose their real completion promise without changing the parser.
 const store=fs.readFileSync(path.join(root,'src/lib/projectStore.ts'),'utf8'),createStart=store.indexOf('export function createProject('),createEnd=store.indexOf('\n// ===',createStart),addStart=store.indexOf('export function addVersionToProject('),addEnd=store.indexOf('\n// ===',addStart)
 let resolveSave,observed,released=[],activeProject,activeVersion
 const storeContext={exports:{},Date,Math,Promise,console,_projects:[{id:'p',versions:[]}],notifyListeners(){},idbPutProject:async()=>{},insertProjectToSupabase:()=>new Promise(resolve=>resolveSave=resolve),addVersionToSupabase:()=>new Promise(resolve=>resolveSave=resolve),releaseRawScheduleSource:(...args)=>released.push(args),setActiveProjectId:id=>activeProject=id,setActiveVersionId:id=>activeVersion=id}
 vm.runInNewContext(ts.transpileModule(store.slice(createStart,createEnd)+'\n'+store.slice(addStart,addEnd),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,storeContext)
 storeContext.exports.addVersionToProject('p',{id:'v',analysis:{},fileName:'source.xer'},{onCloudSave:p=>observed=p});assert.ok(observed&&typeof observed.then==='function');assert.equal(released.length,0);resolveSave(true);assert.equal(await observed,true);assert.equal(released[0][1],'v');assert.equal(activeVersion,'v')
 storeContext.exports.createProject({name:'New',version:{id:'new-v',analysis:{}},onCloudSave:p=>observed=p});resolveSave(false);assert.equal(await observed,false,'A failed cloud save cannot be mistaken for completion')
 const uploadPage=fs.readFileSync(path.join(root,'src/app/dashboard/upload/page.tsx'),'utf8');assert.ok(uploadPage.includes('await pendingCloudSave'));assert.ok(uploadPage.includes('completeUploadDestination(savedIdentity)'));assert.ok(!uploadPage.includes("setTimeout(() => router.push('/dashboard'), 300)"));assert.ok(uploadPage.includes('Retry verification and filing'))
 console.log('PASS: menu selection/outside/Escape closing and listener cleanup; Unfiled version actions; project edit fields, permission and exact concurrency token; upload destination link, source verification, deleted-folder and stale-write handling, placement verification, folder return route and duplicate-free filing retry.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
