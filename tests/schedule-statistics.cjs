const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript'),path=require('node:path')
const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/scheduleStatistics.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:out})
const {calculateStatistics:calc,periodPerformance:period,numeric,scheduleDay}=out
const task=(id,extra={})=>({task_id:id,task_code:id,task_name:'Activity '+id,status_code:'TK_NotStart',cstr_type:'',cstr_type2:'',clndr_id:'c',act_start_date:'',act_end_date:'',early_start_date:'2026-10-12',early_end_date:'2026-10-20',total_float_hr_cnt:'8',remain_drtn_hr_cnt:'40',...extra})
const a={dataDate:'2026-10-17',traceTasks:{a:task('a'),b:task('b',{status_code:'TK_Active',cstr_type:'CS_MSON',cstr_type2:'CS_SNET',total_float_hr_cnt:'-8'}),c:task('c',{status_code:'TK_Complete',act_end_date:'2026-10-18'}),d:task('d')},traceRelationships:[{task_id:'b',pred_task_id:'a',pred_type:'PR_SS',lag_hr_cnt:'8'},{task_id:'b',pred_task_id:'a',pred_type:'PR_FF',lag_hr_cnt:'0'},{task_id:'c',pred_task_id:'b',pred_type:'PR_FS',lag_hr_cnt:'-8'},{task_id:'a',pred_task_id:'external',pred_type:'PR_FS',lag_hr_cnt:'0',proj_id:'1',pred_proj_id:'2'}],calendars:{c:{clndr_name:'Test',day_hr_cnt:'10'}},outOfSequence:[]}
const m=calc(a),get=id=>m.stats.find(x=>x.id===id)
assert.equal(get('total').count,4);assert.equal(get('internal').count,3);assert.equal(get('external').count,1)
assert.equal(get('withPred').count,3);assert.equal(get('withSucc').count,2)
assert.equal(get('noPred').count,1);assert.equal(get('noSucc').count,2);assert.equal(get('neither').count,1)
assert.equal(get('positiveLag').count,1);assert.equal(get('negativeLag').count,1);assert.equal(get('activitiesLag').count,3)
assert.equal(get('hard').count,1);assert.equal(get('soft').count,1);assert.equal(get('constraints').count,1)
assert.equal(get('calendars').count,1);assert.equal(get('actualAfter').count,1)
assert.equal(calc(a,true).stats.find(x=>x.id==='total').count,3)
assert.equal(calc({}).stats.find(x=>x.id==='total').count,null)
assert.equal(calc({traceTasks:a.traceTasks}).stats.find(x=>x.id==='internal').count,null)
assert.equal(numeric(''),null);assert.equal(numeric('x'),null);assert.equal(numeric('0'),0)
assert.equal(scheduleDay('2026-02-30'),'')
const old={dataDate:'2026-10-10',traceTasks:{a:task('a',{early_end_date:'2026-10-17'}),b:task('b',{early_end_date:'2026-10-15'}),c:task('c',{early_end_date:'2026-10-10'}),d:task('d',{early_end_date:'2026-10-16'})}}
const next={dataDate:'2026-10-17',traceTasks:{z:task('z',{task_code:'a',status_code:'TK_Complete',act_end_date:'2026-10-16'}),b:task('b',{status_code:'TK_Active'})}}
const p=period(old,next)
assert.equal(p.rows.length,3);assert.equal(p.rows[0].outcome,'Completed by data date');assert.equal(p.rows[1].outcome,'In progress');assert.equal(p.rows[2].outcome,'Unmatched / duplicate ID')
assert.ok(period(next,next).error)
const dup={...next,traceTasks:{...next.traceTasks,y:task('y',{task_code:'a'})}}
assert.equal(period(old,dup).rows[0].outcome,'Unmatched / duplicate ID')
console.log('PASS: population, relationships, overlapping logic, unique lag activities, secondary constraints, missing data, dates, period boundaries, changed internal IDs and duplicates')
