/* No test-only packages: uses the React and TypeScript already in this app. */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm')
const assert = require('node:assert/strict'), ts = require('typescript')
const React = require('react'), {renderToStaticMarkup} = require('react-dom/server')
const root = path.resolve(__dirname, '..')
function load(file, mocks = {}, globals = {}) {
  const exports = {}, code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX}
  }).outputText
  vm.runInNewContext(code, {exports, Date, Map, Set, console, setTimeout, clearTimeout,
    require: id => Object.hasOwn(mocks,id) ? mocks[id] : id === 'react' || id === 'react/jsx-runtime' ? require(id) : (()=>{throw Error('Unmocked dependency '+id+' in '+file)})(), ...globals})
  return exports
}
// Small hook harness: keeps state, re-runs only changed effects and checks cleanup.
function hooks() {
  let slots = [], cursor = 0, pending = []
  const api = {...React,
    useState(initial) {const i=cursor++; if(!slots[i])slots[i]={value:typeof initial==='function'?initial():initial};return [slots[i].value,v=>{slots[i].value=typeof v==='function'?v(slots[i].value):v}]},
    useRef(initial) {const i=cursor++;if(!slots[i])slots[i]={current:initial};return slots[i]},
    useMemo(fn) {cursor++; return fn()},
    useEffect(fn,deps) {const i=cursor++,old=slots[i];if(!old||!deps||deps.some((d,n)=>!Object.is(d,old.deps[n])))pending.push(()=>{old?.cleanup?.();slots[i]={deps,cleanup:fn()}})}
  }
  return {api,render(fn){cursor=0;pending=[];const result=fn();for(const f of pending)f();return result},unmount(){for(const s of slots)s?.cleanup?.()}}
}
function elements(node,predicate) {
  if(!node||typeof node!=='object')return []
  if(Array.isArray(node))return node.flatMap(n=>elements(n,predicate))
  return [...(predicate(node)?[node]:[]),...elements(node.props?.children,predicate)]
}
const text = node => renderToStaticMarkup(node)
const link = {default:({children,...props})=>React.createElement('a',props,children)}
const stub = {default:()=>React.createElement('div',null)}
const dates = load('src/lib/activityNetwork.ts')
const stats = load('src/lib/scheduleStatistics.ts')
const view = load('src/lib/projectControlView.ts',{'./activityNetwork':dates,'./scheduleStatistics':stats})
const task = (code,start,finish,status='TK_NotStart')=>({task_id:code,task_code:code,task_name:code,status_code:status,early_start_date:start,early_end_date:finish})
const analysis = {sourceDataDate:'2026-11-09', traceTasks:{
  active:{...task('ACTIVE','2026-11-01','2026-11-12','TK_Active'),act_start_date:'2026-11-01'},
  planned:task('PLANNED','2026-11-10','2026-11-13'), done:task('DONE','2026-11-10','2026-11-13','TK_Complete'),
  future:task('FUTURE','2026-11-17','2026-11-20'), invalid:task('BAD','2026-11-31','2026-12-01'), reversed:task('REVERSED','2026-11-12','2026-11-10')
}}
assert.equal(view.projectPulse({}).available,false)
assert.equal(view.projectPulse(analysis).complete,1)
assert.equal(view.projectPulse(analysis).active,1)
assert.ok(view.lookAhead({}).error)
assert.ok(view.lookAhead({...analysis,sourceDataDate:'2026-11-31'}).error)
assert.equal(view.lookAhead(analysis).to,'2026-11-16')
assert.equal(view.lookAhead(analysis).rows.map(t=>t.task_code).join(','),'ACTIVE,PLANNED')
assert.equal(view.lookAhead({...analysis,projectSettings:{last_recalc_date:''}}).error,'The source data date is unavailable.','An absent source DD must not fall back to another date')
assert.ok(view.scheduleAnswer('progress',analysis,'selected.xer').includes('not weighted physical progress'))
assert.ok(view.scheduleAnswer('what holds PFHO?',analysis,'selected.xer').includes('target-specific driver is not established'))
assert.ok(view.scheduleAnswer('next week',analysis,'selected.xer').includes('2 incomplete'))
assert.ok(view.scheduleAnswer('cost',analysis,'selected.xer').includes('require their recorded sources'))

// Resize, keyboard adjustment, persistence and pointer cleanup.
const h=hooks(), listeners=new Map(), saved=new Map([['pl_sidebar_width','310']])
const win={innerWidth:1600,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:(k,f)=>{if(listeners.get(k)===f)listeners.delete(k)}}
const body={style:{cursor:'default',userSelect:'text'}}
const width=load('src/components/useSidebarWidth.ts',{'react':h.api},{window:win,document:{body},localStorage:{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v)}})
let resize=h.render(()=>width.default());resize=h.render(()=>width.default())
assert.equal(resize.width,310);assert.equal(width.clampSidebarWidth(NaN),272)
assert.equal(width.clampSidebarWidth(100),220);assert.equal(width.clampSidebarWidth(999),520)
resize.start({button:0,preventDefault(){},clientX:310,pointerId:4})
listeners.get('pointermove')({clientX:400,pointerId:5});resize=h.render(()=>width.default());assert.equal(resize.width,310,'Unrelated pointers cannot resize')
listeners.get('pointermove')({clientX:400,pointerId:4});resize=h.render(()=>width.default());assert.equal(resize.width,400)
listeners.get('pointerup')({pointerId:4});assert.equal(listeners.size,0);assert.equal(body.style.cursor,'default');assert.equal(body.style.userSelect,'text')
resize.key({key:'ArrowLeft',preventDefault(){}});resize=h.render(()=>width.default());assert.equal(resize.width,384)
resize.key({key:'Home',preventDefault(){}});resize=h.render(()=>width.default());assert.equal(resize.width,220)
resize.key({key:'End',preventDefault(){}});resize=h.render(()=>width.default());assert.equal(resize.width,520);assert.equal(saved.get('pl_sidebar_width'),'520')
resize.start({button:0,preventDefault(){},clientX:520,pointerId:4});h.unmount();assert.equal(listeners.size,0)

// Workspace tabs share one routing contract, including nested review pages.
const browser=load('src/lib/versionBrowser.ts',{'./sourceScheduleDate':{versionDataDate:v=>v.dataDate}})
const workspace=load('src/lib/projectWorkspace.ts',{'./versionBrowser':browser})
assert.equal(workspace.PROJECT_TABS.map(t=>t.label).join('|'),'Versions & uploads|QC & decisions|Project Controls|Compare & revisions')
assert.equal(workspace.workspaceTab('/dashboard/approval/paths'),'QC & decisions')
assert.equal(workspace.workspaceTab('/dashboard/changes'),'Compare & revisions')
assert.equal(workspace.workspaceTab('/dashboard/project-setup'),'Project Controls')

async function main(){
 const project={id:'p',projectId:'IAD174',name:'IAD 174',versions:[]},version={id:'v',fileName:'selected.xer',analysis},calls=[]
 const state={project,version,ready:true,projects:[project]},nav={opening:false,request:(...args)=>calls.push(args)}
 const directory={rows:[{id:'p',project_code:'IAD174',name:'IAD 174 construction',address:'123 Example Street',stage:'Construction',status:'active',data_date:'2026-11-09',uploaded_at:'2026-11-10'}],total:21,page:1,size:20,loading:false}
 const shared={'next/navigation':{useRouter:()=>({push:x=>calls.push(x)})},'@/components/PortfolioCreateProject':stub,'next/link':link,'@/lib/projectStore':{ensureWorkspaceProject:async()=>({...project,versions:[version]})},'@/lib/controlWorkflow':{cloudId:x=>x,decisionLabel:x=>x||'Not recorded'},'@/lib/usePermissions':{usePermissions:()=>({user:{orgId:'org'},can:{}})},'@/components/useProjectDirectory':{useProjectDirectory:()=>directory},'@/components/DirectoryControls':{...stub,DirectoryPager:()=>null},'@/components/useProjectWorkspace':{useProjectWorkspace:()=>state,rememberedProjectVersion:()=>version.id},'@/lib/projectWorkspace':workspace,'@/components/VersionNavigation':{useVersionNavigation:()=>nav}}
 const cardHooks=hooks(),Portfolio=load('src/app/dashboard/workspace/page.tsx',{'react':cardHooks.api,...shared}).default
 const cards=cardHooks.render(()=>Portfolio()),cardMarkup=text(cards)
 assert.ok(cardMarkup.includes('123 Example Street')&&cardMarkup.includes('Construction'))
 assert.ok(cardMarkup.includes('Result 21')&&cardMarkup.includes('2026-11-09'))
 assert.ok(cardMarkup.includes('21 matching projects'))
 await elements(cards,n=>n.type==='button'&&n.props.children==='Open project')[0].props.onClick()
 assert.deepEqual(calls.pop(),['p','v','/dashboard/schedules'])

 const sidebarHooks=hooks(),Sidebar=load('src/components/WorkspaceSidebar.tsx',{'react':sidebarHooks.api,'next/link':link,'./ScheduleFolderTree':{default:()=>React.createElement('p',null,'Selected project schedule folders')},'./useSidebarWidth':{default:()=>({width:320,start(){},key(){}})},'./useProjectWorkspace':shared['@/components/useProjectWorkspace'],'@/lib/usePermissions':{usePermissions:()=>({user:{orgId:'org'},isPlatformOwner:false}),roleLabel:x=>x}}).default
 const sidebar=sidebarHooks.render(()=>Sidebar({user:{name:'NJ',company:'Noble',initials:'NJ'}}))
 assert.equal(elements(sidebar,n=>n.type==='aside')[0].props.style.width,320)
 assert.ok(text(sidebar).includes('IAD174')&&text(sidebar).includes('Selected project schedule folders'))
 assert.ok(!text(sidebar).includes('Latest upload DD:'),'The cross-project directory must not be in a project sidebar')
 assert.ok(elements(sidebar,n=>n.props?.role==='separator').length===1)
 assert.ok(elements(sidebar,n=>n.type==='svg').length===1,'Preserve the logo')

 const workflow={reviews:[],control:{},events:[],loading:false,error:''}
 let downloadedId='', anchor=null
 const schedulesHooks=hooks(),Schedules=load('src/app/dashboard/schedules/page.tsx',{'react':schedulesHooks.api,'next/link':link,'@/components/ScheduleFoldersProvider':{useScheduleFolders:()=>({library:{folders:[],filing:[],can_edit:false},scope:'all',query:'',sort:'newest'})},'@/components/ScheduleFolderTree':stub,'@/components/ScheduleFolderDialog':stub,'@/components/ScheduleVersionActions':stub,'@/lib/scheduleFolders':{filterFolderVersions:v=>v,folderPath:()=> 'Unfiled',folderForVersion:()=>null},'@/components/ProjectControlBanner':stub,'@/components/useProjectWorkspace':shared['@/components/useProjectWorkspace'],'@/components/useControlWorkflow':{useControlWorkflow:()=>workflow},'@/lib/controlWorkflow':shared['@/lib/controlWorkflow'],'@/components/VersionNavigation':shared['@/components/VersionNavigation'],'@/lib/versionBrowser':browser,'@/lib/supabase/db':{getSavedVersionXerSignedUrl:async(id)=>{downloadedId=id;return {ok:true,signedUrl:'https://example.invalid/original'}}}},{AbortController,fetch:async()=>({ok:true,blob:async()=>new Blob(['original XER bytes'])}),URL:{createObjectURL:()=> 'blob:test',revokeObjectURL(){}},document:{createElement:()=>{anchor={click(){this.clicked=true}};return anchor}},setTimeout:fn=>{fn();return 0}}).default
 project.versions=[{...version,dataDate:'2026-11-09'}]
 const schedules=schedulesHooks.render(()=>Schedules())
 assert.ok(text(schedules).includes('Review decision')&&text(schedules).includes('Approved')&&text(schedules).includes('Reviewed'))
 elements(schedules,n=>n.type==='button'&&n.props.children==='Evaluate')[0].props.onClick()
 assert.deepEqual(calls.pop(),['p','v','/dashboard/approval'])

 await elements(schedules,n=>n.type==='button'&&n.props.children==='Download original')[0].props.onClick()
 assert.equal(downloadedId,'v');assert.equal(anchor.download,'selected.xer');assert.equal(anchor.clicked,true)

 const dashboardHooks=hooks(),Dashboard=load('src/components/ProjectControlsDashboard.tsx',{'react':dashboardHooks.api,'next/link':link,'@/lib/projectStore':{getVisibleVersions:()=>[],loadVersionAnalysis:async()=>null},'@/lib/projectControlView':view,'@/lib/activityNetwork':dates,'@/lib/completionBoundary':{detectFinalCompletionTarget:()=>null},'@/lib/versionBrowser':browser,'@/lib/scheduleStatistics':stats,'@/lib/supabase/reviews':{loadReviewWorkspaceFromSupabase:async()=>({ok:true,data:{comments:[]}})},'@/lib/phaseMilestoneReview':{phaseReviewFindings:()=>[]},'@/lib/scheduleReviewSnapshot':{reviewFindingSourceKey:x=>x},'./ProjectControlPosition':stub,'./PhaseMilestoneReview':{default:props=>React.createElement('p',null,'phase engine '+props.storageKey)}}).default
 let dashboard=dashboardHooks.render(()=>Dashboard({project,version}))
 assert.ok(text(dashboard).includes('Project Pulse')&&text(dashboard).includes('Phase Readiness')&&text(dashboard).includes('Weekly Control')&&text(dashboard).includes('Cost &amp; Changes'))
 elements(dashboard,n=>n.type==='button'&&n.props.children==='Phase Readiness')[0].props.onClick()
 dashboard=dashboardHooks.render(()=>Dashboard({project,version}))
 assert.ok(text(dashboard).includes('phase engine cpmr:milestone-review:v1:p:v'),'Same persisted phase/milestone scope as QC')
 elements(dashboard,n=>n.type==='button'&&n.props.children==='Weekly Control')[0].props.onClick()
 dashboard=dashboardHooks.render(()=>Dashboard({project,version}))
 assert.ok(text(dashboard).includes('PLANNED')&&!text(dashboard).includes('FUTURE'))
 assert.ok(text(dashboard).includes('Not recorded'))
 elements(dashboard,n=>n.type==='button'&&n.props.children==='Cost & Changes')[0].props.onClick()
 dashboard=dashboardHooks.render(()=>Dashboard({project,version}))
 assert.ok(text(dashboard).includes('Forecast cost at completion')&&text(dashboard).includes('Not recorded'))
 assert.ok(!text(dashboard).includes('$0'),'Missing costs must not become zero')
 dashboardHooks.unmount();cardHooks.unmount();sidebarHooks.unmount();schedulesHooks.unmount()

 const decisionHooks=hooks(),rpcCalls=[]
 const Decision=load('src/components/VersionDecisionPanel.tsx',{'react':decisionHooks.api,'@/lib/usePermissions':{usePermissions:()=>({isOwner:true})},'@/lib/supabase/client':{createClient:()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});return {error:null}}})},'@/lib/controlWorkflow':{cloudId:x=>x,decisionLabel:x=>x||'Not recorded',REVIEW_DECISIONS:['APPROVED']},'./useControlWorkflow':{useControlWorkflow:()=>workflow}},{window:{dispatchEvent(){}},Event:class{}}).default
 let decisionTree=decisionHooks.render(()=>Decision({projectId:'p',versionId:'v'}))
 elements(decisionTree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Review complete with evidence'}})
 decisionTree=decisionHooks.render(()=>Decision({projectId:'p',versionId:'v'}))
 assert.equal(elements(decisionTree,n=>n.type==='button'&&n.props.children==='Record decision')[0].props.disabled,true,'Must review before recording a decision')
 await elements(decisionTree,n=>n.type==='button'&&n.props.children==='Complete review')[0].props.onClick()
 assert.equal(rpcCalls[0].name,'cpmr_workflow_action');assert.equal(rpcCalls[0].args.p_action,'mark_reviewed');assert.equal(rpcCalls[0].args.p_version,'v')
 workflow.reviews=[{version_id:'v',reviewed_at:'2026-11-20T12:00:00Z',revision:1}]
 decisionTree=decisionHooks.render(()=>Decision({projectId:'p',versionId:'v'}))
 elements(decisionTree,n=>n.type==='textarea')[0].props.onChange({target:{value:'Approved under review authority'}})
 elements(decisionTree,n=>n.type==='select')[0].props.onChange({target:{value:'APPROVED'}})
 decisionTree=decisionHooks.render(()=>Decision({projectId:'p',versionId:'v'}))
 assert.equal(elements(decisionTree,n=>n.type==='button'&&n.props.children==='Record decision')[0].props.disabled,false)
 await elements(decisionTree,n=>n.type==='button'&&n.props.children==='Record decision')[0].props.onClick()
 assert.equal(rpcCalls[1].args.p_action,'APPROVED');assert.equal(rpcCalls[1].args.p_expected,1)
 workflow.control={baseline_version_id:'v'}
 decisionTree=decisionHooks.render(()=>Decision({projectId:'p',versionId:'v'}))
 assert.ok(text(decisionTree).includes('locked'))
 assert.equal(elements(decisionTree,n=>n.type==='textarea').length,0,'Assigned references remain locked')
 decisionHooks.unmount()

 const approval=fs.readFileSync(path.join(root,'src/app/dashboard/approval/page.tsx'),'utf8')
 assert.equal((approval.match(/<VersionDecisionPanel /g)||[]).length,1)
 assert.ok(approval.indexOf('<VersionDecisionPanel ')<approval.indexOf('Facility type *'),'Decision actions are above the review form')
 assert.ok(approval.includes('<ProjectControlBanner />'))
 assert.ok(approval.includes('PhaseMilestoneReview'),'Preserve the review engine')
 console.log('PASS: source dates and counts, bounded weekly forecast, evidence answers, sidebar drag/keyboard/persistence/cleanup, shared tab routes, paged project cards, guarded project/version opening, visible decision dates, original download wiring and all four project-control views.')
}
main().catch(e=>{console.error(e);process.exitCode=1})
