const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const root=path.join(__dirname,'..'),cache={}
function load(file){file=path.resolve(file);if(cache[file])return cache[file];const exports={};cache[file]=exports;const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText
 vm.runInNewContext(js,{exports,require:id=>id.startsWith('@/')?load(path.join(root,'src',id.slice(2))+(id.includes('components/')?'.tsx':'.ts')):id.startsWith('.')?load(path.resolve(path.dirname(file),id)+'.ts'):require(id),console,Set,Map,Date,URL,Blob,setTimeout},{filename:file});return exports}
const lib=load(path.join(root,'src/lib/phaseMilestoneReview.ts'))
function task(id,name,type='TT_Task',status='TK_NotStart',phase='') {return {task_id:id,task_code:id,task_name:name,task_type:type,status_code:status,wbs_path:phase?[phase]:[],clndr_id:'c',remain_drtn_hr_cnt:'12',early_start_date:'2026-11-10 08:00',early_end_date:'2026-11-10 17:00',act_start_date:'2026-10-01 08:00',act_end_date:'2026-10-02 17:00'}}
const tasks={a:task('a','MV source complete','TT_Task','TK_Complete'),b:task('b','PH1 Transformer L2 verification','TT_Task','TK_Active'),c:task('c','PH1 L3 Energization'),d:task('d','PH1 H2C','TT_FinMile'),e:task('e','PH1 L4 commissioning'),f:task('f','PH1 L4/L5 closeout'),g:task('g','PH1 PFHO','TT_FinMile'),h:task('h','PH2 NEA','TT_FinMile'),i:task('i','PH2 Start','TT_StartMile'),j:task('j','Building completion','TT_FinMile'),k:task('k','PH1 TAB'),n:task('n','PH1 ceiling installation')}
tasks.g.cstr_type='CS_MEO';tasks.b.driving_path_flag='Y';tasks.h.wbs_path=['Phase 1']
const edges=[['a','b','PR_FS'],['b','c','PR_FF'],['c','d','PR_FS'],['d','e','PR_FS'],['e','f','PR_FS'],['f','g','PR_FS'],['k','d','PR_FS']].map(([p,s,t])=>({pred_task_id:p,task_id:s,pred_type:t,lag_hr_cnt:'0'}))
const analysis={traceTasks:tasks,traceRelationships:edges,calendars:{c:{day_hr_cnt:'8'}},dataDate:'2026-11-09'}
const idx=lib.buildReviewIndex(analysis,[{id:'missing',name:'Phase 3 handover',phaseOrArea:'Phase 3',mappedActivityCode:'missing-code'}])
assert.equal(idx.targets.find(t=>t.id==='h').phase,'Phase 2','Task identity takes precedence over parent WBS')
assert.equal(idx.targets.find(t=>t.id==='j').phase,lib.UNASSIGNED)
assert.equal(lib.taskPhase(task('shared','PH1/7 shared catcher')).phase,lib.UNASSIGNED,'Shared compressed phase labels are not assigned to just the first phase')
assert.ok(idx.targets.some(t=>t.id==='contract:missing'))
const all=lib.filterTargets(idx,[],[])
assert.ok(all.some(t=>t.id==='i'),'Start milestones are included')
assert.ok(all.some(t=>t.id==='d'),'Unconstrained finish milestones are included')
assert.equal(lib.filterTargets(idx,[],[],'with').length,1)
assert.ok(lib.filterTargets(idx,[],[],'all',true).some(t=>t.id==='n'),'Any source activity can be selected as a target')
const target=idx.targets.find(t=>t.id==='g'),trace=lib.backwardReview(idx,target)
assert.ok(trace.tasks.some(t=>t.task_id==='a'&&t.status_code==='TK_Complete'),'Completed upstream history retained')
assert.ok(trace.tasks.some(t=>t.task_id==='b'&&t.status_code==='TK_Active'),'In-progress upstream work retained')
assert.equal(trace.tasks.at(-1).task_id,'g')
assert.equal(trace.relationships.length,7,'Converging branch relationships retained')
assert.equal(trace.sourceDriving.length,0,'Task flags do not establish a target-specific driving relationship')
assert.equal(trace.reported.length,1)
assert.equal(lib.reviewTaskDate(tasks.a).finish,'2026-10-02 17:00','Completed activity uses actual finish')
assert.equal(lib.reviewTaskDate(tasks.b).start,'2026-10-01 08:00')
assert.equal(lib.reviewTaskDate(tasks.b).finish,'2026-11-10 17:00')
assert.ok(lib.commentsForTarget(idx,target).some(c=>c.id.endsWith(':ist')))
const comments=lib.commentsForTarget(idx,target),model=lib.reportModel(idx,['g'],comments.map(c=>c.id))
assert.equal(model.length,1,'Excluding every comment keeps the selected milestone')
assert.equal(model[0].comments.length,0)
const report=load(path.join(root,'src/components/PhaseMilestoneReview.tsx')).reportHtml
let html=report(idx,{selected:['g'],excluded:[],edits:{},assignments:{}},analysis,'<img src=x onerror=alert(1)>','source.xer',true)
assert.ok(html.includes('MV source complete'),'Report includes complete historical activities')
assert.ok(html.includes('1.5'),'Remaining duration preserves fractions')
assert.ok(!html.includes('<img src=x'),'Report text is escaped')
assert.ok(!html.includes('PH2 NEA'),'Unselected milestones are not exported as review sections')
assert.ok(report(idx,{selected:[],excluded:[],edits:{},assignments:{}},analysis,'Test','x',true).includes('0 selected review targets'))
const cyc=lib.buildReviewIndex({...analysis,traceRelationships:[...edges,{pred_task_id:'g',task_id:'b',pred_type:'PR_FS',lag_hr_cnt:'0'},{pred_task_id:'external',task_id:'g',pred_type:'PR_FS',lag_hr_cnt:'0'}]})
const cg=lib.backwardReview(cyc,cyc.targets.find(t=>t.id==='g'))
assert.ok(cg.cycle);assert.equal(cg.unresolved,1)
assert.ok(cg.tasks.some(t=>t.task_id==='a'))
assert.deepEqual(Array.from(lib.LEVEL_GUIDE[2]),['L2','Installation checks, pre-startup tests and verification'])
console.log('PASS: phase scope, constrained/unconstrained start/finish milestones, arbitrary activity targets, full historical/converging traces, no fabricated driving links, report selection, dates, fractional days, escaping, cycles and external endpoints')
if(process.env.CPM_XER){
 const parser=load(path.join(root,'src/lib/xerParser.ts'))
 const a=parser.analyzeXER(parser.parseXER(fs.readFileSync(process.env.CPM_XER,'utf8')))
 const ix=lib.buildReviewIndex(a),milestones=lib.filterTargets(ix,[],[])
 let complete=0,active=0,findings=0
 for(const t of milestones){const g=lib.backwardReview(ix,t);complete+=g.tasks.filter(x=>x.status_code==='TK_Complete').length;active+=g.tasks.filter(x=>x.status_code==='TK_Active').length;findings+=lib.commentsForTarget(ix,t).length}
 assert.ok(milestones.length>0);assert.ok(complete>0);assert.ok(active>0)
 console.log(JSON.stringify({fixture:path.basename(process.env.CPM_XER),phases:ix.phases.length,milestones:milestones.length,connectedCompletedRows:complete,connectedInProgressRows:active,planningComments:findings}))
 if(process.env.CPM_PREVIEW_DATA)fs.writeFileSync(process.env.CPM_PREVIEW_DATA,JSON.stringify(a))
}
