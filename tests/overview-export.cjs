const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path'),os=require('node:os')
const root=path.join(__dirname,'..'),cache={}
function compile(name){if(cache[name])return cache[name];const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib',name+'.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES5}}).outputText,{exports,TextEncoder,Uint8Array,Uint32Array,DataView,require:id=>compile(id.replace('./',''))});cache[name]=exports;return exports}
const metrics=compile('scheduleStatistics'),exporter=compile('overviewExport'),writer=compile('overviewXlsx')
const task=(id,extra={})=>({task_id:id,task_code:id,task_name:'Test '+id,status_code:'TK_NotStart',cstr_type:'',cstr_type2:'',clndr_id:'c',act_start_date:'',act_end_date:'',early_start_date:'2026-10-18',early_end_date:'2026-10-20',total_float_hr_cnt:'-8',remain_drtn_hr_cnt:'40',...extra})
const analysis={dataDate:'2026-10-17',traceTasks:{a:task('a',{task_code:'001',task_name:'=HYPERLINK("bad", "do not execute")'}),b:task('b',{task_name:'Pumps & valves <test>'})},traceRelationships:[{pred_task_id:'a',task_id:'b',pred_type:'PR_FS',lag_hr_cnt:'8'},{pred_task_id:'a',task_id:'b',pred_type:'PR_FS',lag_hr_cnt:'8'}],calendars:{c:{clndr_name:'Project'}},outOfSequence:[]}
const m=metrics.calculateStatistics(analysis)
const old={...analysis,dataDate:'2026-10-10',traceTasks:{a:task('a',{task_code:'001',early_end_date:'2026-10-15'})}}
const input={project:{id:'p',name:'Test project'},version:{id:'v2',fileName:'test.xer'},summary:[['Project','Test']],analysis,stats:m.stats,checks:m.checks,performance:metrics.periodPerformance(old,analysis),comparison:{id:'v1',fileName:'prior.xer'},comparisonDataDate:old.dataDate,incomplete:false,excluded:[],targets:{logic:{direction:'<',value:'5'}},mode:'all'}
let sheets=exporter.buildOverviewSheets(input)
assert.deepEqual(Array.from(sheets,s=>s.name),['Submission Summary','Schedule Statistics','Schedule Checks','Period Performance','Detailed Findings','Comments & Recommendations'])
const total=sheets[1].rows.find(r=>r[0]==='Total activities');assert.equal(total[1],2);assert.equal(total[3].value,1)
const details=sheets.find(s=>s.name==='Detailed Findings')
assert.equal(details.rows.filter(r=>r[0]==='relationship').length,2,'duplicate source links remain distinct; memberships do not duplicate them')
assert.ok(details.rows.some(r=>r[2]==='001'));assert.ok(details.rows.some(r=>typeof r[10]==='object'&&r[10]?.format==='date'))
assert.equal(sheets[5].rows.length,1)
const selected=exporter.buildOverviewSheets({...input,mode:'selected',excluded:['section-0','section-2','section-3','total']})
assert.deepEqual(Array.from(selected,s=>s.name),['Schedule Statistics','Detailed Findings']);assert.ok(!selected[0].rows.some(r=>r[0]==='Total activities'))
assert.throws(()=>exporter.buildOverviewSheets({...input,mode:'selected',excluded:[0,1,2,3].map(i=>'section-'+i)}),/Select at least/)
assert.equal(exporter.buildOverviewSheets({...input,performance:null}).find(s=>s.name==='Period Performance').rows[0][0],'Not evaluated')
assert.equal(writer.createOverviewXlsx(sheets)[0],0x50)
// Optional generated-fixture path for independent file-reader validation.
if(process.env.CPM_EXPORT_FIXTURE)fs.writeFileSync(process.env.CPM_EXPORT_FIXTURE,writer.createOverviewXlsx(sheets))
assert.throws(()=>writer.createOverviewXlsx([{name:'bad/name',headers:['A'],rows:[],notes:[]}]),/Invalid worksheet/)
console.log('PASS: six sheets, selected exports, percentages, typed dates, leading-zero IDs, duplicate relationships, empty selection, unavailable comparison and ZIP serialization')
