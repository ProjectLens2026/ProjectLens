const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const out={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/lib/activityNetwork.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out})
assert.equal(out.floatDays({total_float_hr_cnt:'-16',clndr_id:'a'},{a:{day_hr_cnt:'8'}}),-2)
assert.equal(out.floatDays({total_float_hr_cnt:'0',clndr_id:'a'},{a:{day_hr_cnt:'10'}}),0)
assert.equal(out.floatDays({total_float_hr_cnt:'16'},{}),null)
assert.equal(out.floatDays({total_float_hr_cnt:''},{},8),null)
assert.equal(out.floatDays({total_float_hr_cnt:'16'},{},8),2)
assert.equal(out.activityColor({status_code:'TK_Complete',total_float_hr_cnt:'-16'}),'#2563eb')
assert.equal(out.activityColor({total_float_hr_cnt:'0'}),'#dc2626')
assert.equal(out.activityColor({total_float_hr_cnt:'16'}),'#16a34a')
assert.equal(out.activityColor({total_float_hr_cnt:null}),'#94a3b8')
assert.equal(out.displayActivityDates({status_code:'TK_Complete',act_start_date:'2026-10-01',early_start_date:'2026-11-01'}).start,'2026-10-01')
assert.equal(out.displayActivityDates({status_code:'TK_Complete',early_start_date:'2026-11-01'}).start,undefined)
assert.equal(out.displayScheduleDate('2026-10-01 17:00'),'10-01-26')
const tasks={r:{task_id:'r'}}
const links=[]
for(let i=0;i<30;i++){tasks['a'+i]={task_id:'a'+i};links.push({pred_task_id:'a'+i,task_id:'r'})}
assert.equal(out.upstreamPaths('r',tasks,links,3).paths.length,3)
assert.equal(out.upstreamPaths('r',tasks,links,30).paths.length,30)
assert.equal(out.upstreamPaths('r',tasks,links,3).truncated,true)
assert.equal(out.upstreamPaths('r',tasks,links,30).truncated,false)
console.log('PASS: colors, missing data, actual dates, float conversion and editable path limits')
