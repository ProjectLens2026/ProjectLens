// Optional UI harness: CPM_TEST_TOOLS must contain React 18 + react-test-renderer 18.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const tooling=process.env.CPM_TEST_TOOLS
if(!tooling)throw Error('Set CPM_TEST_TOOLS to test tooling node_modules')
const React=require(path.join(tooling,'react')),Renderer=require(path.join(tooling,'react-test-renderer'))
const store=new Map();let printed=0
function compile(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,Date,localStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)},window:{print:()=>printed++},require:id=>id==='react'?React:id==='react/jsx-runtime'?require(path.join(tooling,'react/jsx-runtime')):deps[id]});return exports}
const stats=compile('src/lib/scheduleStatistics.ts'),dates=compile('src/lib/calendarDate.ts')
const current={id:'v2',versionLabel:'Update 2',fileName:'current.xer',analysis:{dataDate:'2026-10-17',traceTasks:{a:{task_id:'a',task_code:'A001',task_name:'Excavation',status_code:'TK_NotStart',early_start_date:'2026-10-18',early_end_date:'2026-10-20',act_start_date:'',act_end_date:'',cstr_type:'',cstr_type2:'',clndr_id:'c',remain_drtn_hr_cnt:'24',total_float_hr_cnt:'8'}},traceRelationships:[],outOfSequence:[],calendars:{c:{clndr_name:'Project'}}}}
const previous={id:'v1',fileName:'previous.xer',dataDate:'2026-10-10',analysis:{...current.analysis,dataDate:'2026-10-10',traceTasks:{a:{...current.analysis.traceTasks.a,early_end_date:'2026-10-15'}}}}
const Component=compile('src/components/ScheduleOverview.tsx',{'@/lib/projectStore':{loadVersionAnalysis:async id=>id==='v1'?previous:current},'@/lib/scheduleStatistics':stats,'@/lib/calendarDate':dates}).default
const project={id:'p',name:'Sample project',versions:[current,previous]};let tree
const text=n=>n.children.map(c=>typeof c==='string'?c:text(c)).join('')
const button=s=>tree.root.findAllByType('button').find(n=>text(n).includes(s))
;(async()=>{
await Renderer.act(async()=>{tree=Renderer.create(React.createElement(Component,{project,version:current}))})
assert.equal(tree.root.findAllByType('section').length,4)
assert.ok(!text(tree.root).includes('calendar days ahead'))
Renderer.act(()=>button('2. Schedule statistics').props.onClick())
const total=tree.root.findAllByType('tr').find(n=>text(n).includes('Total activities'))
Renderer.act(()=>total.findByType('button').props.onClick())
assert.ok(text(tree.root.findByProps({role:'dialog'})).includes('A001'))
Renderer.act(()=>button('Close').props.onClick())
Renderer.act(()=>tree.root.findByProps({'aria-label':'Include Total activities in report'}).props.onChange())
Renderer.act(()=>button('Preview selected report').props.onClick())
assert.ok(!tree.root.findAllByType('tr').some(n=>text(n).includes('Total activities')))
assert.ok(store.get('cpm-overview-v1:p').includes('total'))
Renderer.act(()=>button('Print / Save PDF').props.onClick());assert.equal(printed,1)
Renderer.act(()=>button('Back to overview').props.onClick())
const target=tree.root.findByProps({'aria-label':'Missing predecessor or successor target percent'})
Renderer.act(()=>target.props.onChange({target:{value:'5'}}))
assert.ok(text(tree.root).includes('Review recommended'))
const priorSelect=tree.root.findAllByType('select').find(n=>n.findAllByType('option').some(o=>text(o)==='Select previous submission'))
await Renderer.act(async()=>priorSelect.props.onChange({target:{value:'v1'}}))
assert.ok(text(tree.root).includes('Oct')||text(tree.root).includes('10/10/2026'))
Renderer.act(()=>tree.unmount())
console.log('PASS: sections, drilldown, selections, preview, storage, print handler, threshold comments and previous-version loading')
})().catch(e=>{console.error(e);process.exitCode=1})
