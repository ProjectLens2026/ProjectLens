const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react')
const root=path.resolve(__dirname,'..')
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,Map,Set,console,crypto:require('node:crypto').webcrypto,require:id=>Object.hasOwn(mocks,id)?mocks[id]:require(id),...globals});return exports}
const dates=load('src/lib/sourceScheduleDate.ts'),browser=load('src/lib/versionBrowser.ts',{'./sourceScheduleDate':dates}),lib=load('src/lib/scheduleFolders.ts',{'./versionBrowser':browser})
const folders=[{id:'base',parent_id:null,name:'Baseline Schedules',sort_order:0},{id:'update',parent_id:null,name:'Updates',sort_order:1},{id:'year',parent_id:'update',name:'2026',sort_order:0}]
const library={folders,filing:[{version_id:'v1',folder_id:'base'},{version_id:'v2',folder_id:'year'}],revision:4,can_edit:true}
const versions=[{id:'v1',fileName:'base.xer',dataDate:'2026-10-01'},{id:'v2',fileName:'update.xer',dataDate:'2026-11-09'},{id:'v3',fileName:'undated.xer'},{id:'gone',fileName:'gone.xer',deletedAt:'2026-11-01'}]
assert.equal(lib.folderPath(folders,'year'),'Updates / 2026')
assert.equal(lib.descendants(folders,'update').size,2)
assert.equal(lib.filterFolderVersions(versions,library,'update','','newest',x=>x).map(v=>v.id).join(','),'v2')
assert.equal(lib.filterFolderVersions(versions,library,'unfiled','','newest',x=>x).map(v=>v.id).join(','),'v3')
assert.equal(lib.filterFolderVersions(versions,library,'all','','newest',x=>x).map(v=>v.id).join(','),'v2,v1,v3')
assert.equal(lib.filterFolderVersions(versions,library,'all','','oldest',x=>x).map(v=>v.id).join(','),'v1,v2,v3')
assert.equal(lib.filterFolderVersions(versions,library,'all','update','name',x=>x).length,1)
assert.equal(lib.descendants([{id:'a',parent_id:'b'},{id:'b',parent_id:'a'}],'a').size,2,'Cycles cannot hang the selector')
assert.ok(lib.validLibrary(library));assert.ok(!lib.validLibrary({...library,revision:null}))
function hooks(){let slots=[],cursor=0,pending=[];const api={...React,useState(initial){const i=cursor++;if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>slots[i].value=typeof v==='function'?v(slots[i].value):v]},useRef(value){const i=cursor++;if(!slots[i])slots[i]={current:value};return slots[i]},useCallback(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))slots[i]={value:fn,deps};return slots[i].value},useEffect(fn,deps){const i=cursor++,old=slots[i];if(!old||deps.some((d,j)=>!Object.is(d,old.deps[j])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}};return {api,render(fn){cursor=0;pending=[];const out=fn();for(const f of pending)f();return out},unmount(){for(const s of slots)s?.cleanup?.()}}}
const settle=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve()}
async function main(){
 let project={id:'p1'},pathname='/dashboard/schedules',rpcCalls=[],pending=[],failWrite=false,readOnly=false
 const h=hooks(),Provider=load('src/components/ScheduleFoldersProvider.tsx',{'react':h.api,'next/navigation':{usePathname:()=>pathname},'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});if(name.endsWith('_state'))return {data:{...library,can_edit:!readOnly},error:null};if(failWrite)return {error:{message:'Revision changed'}};return new Promise(resolve=>pending.push(resolve))}})},'@/lib/controlWorkflow':{cloudId:x=>x},'@/lib/projectStore':{ensureWorkspaceProject:async()=>project},'@/lib/scheduleFolders':lib,'./useProjectWorkspace':{useProjectWorkspace:()=>({project})}}).default
 const render=()=>h.render(()=>Provider({children:null})).props.value
 let state=render();await settle();state=render();assert.equal(state.library.revision,4)
 state.setScope('base');state=render();assert.equal(state.scope,'base')
 failWrite=true;await assert.rejects(state.mutate({action:'rename',id:'base',name:'Changed'}),/Revision changed/);state=render();assert.equal(state.library.folders[0].name,'Baseline Schedules','Failed writes must not mutate displayed data')
 failWrite=false;const writing=state.mutate({action:'rename',id:'base',name:'Approved Plans'});await settle()
 await assert.rejects(state.mutate({action:'create',name:'Double click'}),/already being saved/)
 assert.equal(rpcCalls.at(-1).args.p_expected,4);assert.equal(rpcCalls.at(-1).args.p_project,'p1')
 project={id:'p2'};state=render();assert.equal(state.scope,'all');assert.equal(state.library.folders.length,0,'No old project folders during new load');await settle();state=render()
 project={id:'p1'};state=render();await settle();state=render()
 pending.shift()({data:{...library,revision:5,folders:[{...folders[0],name:'Stale response'}]},error:null});await writing;state=render();assert.equal(state.library.revision,4,'Switching away and back invalidates an old write response')
 readOnly=true;await state.reload();state=render();await assert.rejects(state.mutate({action:'create',name:'Denied'}),/unavailable/)
 pathname='/dashboard/workspace';state=render();await settle();state=render();assert.equal(state.library.folders.length,0,'Portfolio does not show the last project tree');h.unmount()
 let saved,ok=false
 const create=load('src/lib/portfolioCreation.ts',{'./supabase/db':{insertProjectToSupabase:async p=>{saved=p;return ok}},'./controlWorkflow':{cloudId:()=> 'saved-uuid'}}).createPortfolioProject
 await assert.rejects(create({code:'',name:'Example',address:'',stage:'',status:'Active'}),/project number/)
 await assert.rejects(create({code:'IAD-290',name:'Example',address:'',stage:'',status:'Active'}),/not saved/)
 ok=true;assert.match(await create({code:' IAD-290 ',name:' Example ',address:'123 Street',stage:'Construction',status:'On Hold'}),/^[a-f0-9-]{36}$/)
 assert.equal(saved.projectId,'IAD-290');assert.equal(saved.versions.length,0);assert.equal(saved.controlBasis.projectProfile.address,'123 Street')

 // Render the actual project tree and exercise its navigation and editing entry points.
 const {renderToStaticMarkup}=require('react-dom/server'),html=n=>renderToStaticMarkup(n)
 const walk=(n,p)=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(x=>walk(x,p)):[...(p(n)?[n]:[]),...walk(n.props?.children,p)]
 const treeHooks=hooks(),opened=[],iconMock=new Proxy({},{get:()=>props=>React.createElement('svg',props)})
 const ctx={library,loading:false,busy:false,error:'',scope:'all',query:'',sort:'newest',setScope:v=>ctx.scope=v,setQuery:v=>ctx.query=v,reload:async()=>{},mutate:async()=>{}}
 const dialogStub={default:()=>null}
 const Tree=load('src/components/ScheduleFolderTree.tsx',{'react':treeHooks.api,'next/navigation':{usePathname:()=>'/dashboard/schedules',useRouter:()=>({push:x=>opened.push(x)})},'lucide-react':iconMock,'@/lib/controlWorkflow':{cloudId:x=>x},'@/lib/scheduleFolders':lib,'@/lib/versionBrowser':browser,'@/lib/projectWorkspace':{PROJECT_TABS:[{label:'Versions',href:'/dashboard/schedules'}],workspaceTab:()=> 'Versions'},'./useProjectWorkspace':{useProjectWorkspace:()=>({project:{id:'p1',name:'IAD174',versions},version:versions[1]})},'./VersionNavigation':{useVersionNavigation:()=>({opening:false,request:(...args)=>opened.push(args)})},'./ScheduleFoldersProvider':{useScheduleFolders:()=>ctx},'./ScheduleFolderDialog':dialogStub}).default
 let tree=treeHooks.render(()=>Tree({dark:true}))
 assert.ok(html(tree).includes('Baseline Schedules')&&html(tree).includes('undated.xer'))
 const updateButton=walk(tree,n=>n.type==='button'&&html(n).includes('update.xer'))[0]
 updateButton.props.onClick();assert.deepEqual(opened.pop(),['p1','v2','/dashboard/schedules'])
 walk(tree,n=>n.type==='button'&&n.props['aria-label']==='New schedule folder')[0].props.onClick()
 tree=treeHooks.render(()=>Tree({dark:true}));assert.equal(walk(tree,n=>n.type===dialogStub.default)[0].props.edit.action,'create')
 walk(tree,n=>n.type==='input'&&n.props.type==='search')[0].props.onChange({target:{value:'base'}});assert.equal(ctx.query,'base')
 ctx.library={...library,can_edit:false};tree=treeHooks.render(()=>Tree({dark:true}));assert.equal(walk(tree,n=>n.type==='button'&&n.props['aria-label']==='New schedule folder').length,0,'Viewer has no write controls');treeHooks.unmount()
 const dialogHooks=hooks(),writes=[]
 const Dialog=load('src/components/ScheduleFolderDialog.tsx',{'react':dialogHooks.api,'@/lib/scheduleFolders':lib,'./WorkspaceDialog':{default:({children})=>React.createElement('section',null,children)},'./ScheduleFoldersProvider':{useScheduleFolders:()=>({library,busy:false,mutate:async x=>writes.push(x)})}}).default
 let closed=false,dialogTree=dialogHooks.render(()=>Dialog({edit:{action:'rename',id:'base'},onClose:()=>closed=true}))
 walk(dialogTree,n=>n.type==='input')[0].props.onChange({target:{value:'Contract Baseline'}})
 dialogTree=dialogHooks.render(()=>Dialog({edit:{action:'rename',id:'base'},onClose:()=>closed=true}))
 await walk(dialogTree,n=>n.type==='form')[0].props.onSubmit({preventDefault(){}})
 assert.equal(writes[0].name,'Contract Baseline');assert.equal(writes[0].action,'rename');assert.equal(closed,true);dialogHooks.unmount()
 const sql=fs.readFileSync(path.join(root,'migrations/20261120_schedule_folders.sql'),'utf8')
 assert.ok(sql.includes('security invoker')&&sql.includes('security definer'))
 assert.ok(sql.includes('rev<>p_expected')&&sql.includes('cpmr_can_write(p_project,false)'))
 assert.ok(sql.includes('baseline_version_id=p_id or update_version_id=p_id'))
 assert.ok(sql.includes('p_project::text,0'),'Uses the same assignment lock as the workflow')
 assert.ok(sql.includes('foreign key(project_id,parent_id)')&&sql.includes('foreign key(project_id,folder_id)'))
 assert.ok(sql.includes('revoke all on function public.cpmr_schedule_library_action')&&sql.includes('from public,anon'))
 assert.ok(!/delete from public\.schedule_versions/i.test(sql),'No permanent version or source deletion')
 assert.ok(!/update public\.cpmr_(?:version_reviews|control_references)/i.test(sql),'Folder actions cannot alter approval or control assignments')
 assert.ok(sql.includes('cpmr_unfile_moved_schedule'),'Cross-project lifecycle moves do not retain the old folder')
 console.log('PASS: folder ancestry/cycles, descendant filtering, source-date sorting, unfiled and deleted visibility, project isolation, failed/overlapping/stale writes, viewer guard, server-first project creation and SQL authorization/identity/source-preservation contracts. Database execution is a separate deployment check.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
