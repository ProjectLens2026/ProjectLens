const fs=require('fs'),vm=require('vm'),assert=require('assert/strict'),ts=require('typescript')
const source=fs.readFileSync('src/lib/projectStore.ts','utf8')
const start=source.indexOf('export async function manageProjectItem(')
const end=source.indexOf('\nexport function loadVersionAnalysis(',start)
const code=ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES5,module:ts.ModuleKind.CommonJS}}).outputText
let fail=false, saved=0, active='v1', activeProject='p1'
const context={exports:{},console,Date,Promise,Error,
 _projects:[{id:'p1',status:'Active',versions:[{id:'v1',fileName:'one.xer'}]},{id:'p2',status:'Active',versions:[]}],
 getProjectStatus:p=>p.status||'Active',
 saveLifecycleChange:async()=>{if(fail)throw Error('Permission denied');saved++},
 getActiveVersionId:()=>active,setActiveVersionId:v=>active=v,
 getActiveProjectId:()=>activeProject,setActiveProjectId:p=>activeProject=p,
 notifyListeners:()=>{},idbPutProject:async()=>{}}
vm.runInNewContext(code,context)
const act=context.exports.manageProjectItem
;(async()=>{
 fail=true
 await assert.rejects(act('p1','delete','v1'),/Permission denied/)
 assert.equal(context._projects[0].versions[0].deletedAt,undefined)
 fail=false
 await act('p1','delete','v1')
 assert.ok(context._projects[0].versions[0].deletedAt,'last version can be soft deleted')
 assert.equal(active,null)
 await act('p1','restore','v1')
 assert.equal(context._projects[0].versions[0].deletedAt,undefined)
 await act('p1','archive','v1')
 assert.ok(context._projects[0].versions[0].archivedAt)
 await act('p1','unarchive','v1')
 active='v1'
 await act('p1','move','v1','p2')
 assert.equal(context._projects[0].versions.length,0)
 assert.equal(context._projects[1].versions[0].id,'v1')
 assert.equal(activeProject,'p2')
 await act('p2','archive')
 assert.equal(context._projects[1].status,'Archived')
 await act('p2','unarchive')
 await act('p2','delete')
 assert.equal(context._projects[1].status,'Deleted')
 await act('p2','restore')
 assert.equal(context._projects[1].status,'Active')
 context._projects[1].versions[0].parentVersionId='parent'
 await assert.rejects(act('p2','move','v1','p1'),/lineage/)
 const db=fs.readFileSync('src/lib/supabase/db.ts','utf8')
 assert.ok(db.includes('deletedAt: row.deleted_at || undefined'))
 assert.ok(db.includes('archivedAt: row.archived_at || undefined'))
 assert.ok(db.includes('data.length !== 1'))
 assert.ok(db.includes('source.org_id !== target.org_id'))
 const page=fs.readFileSync('src/app/dashboard/projects/page.tsx','utf8')
 assert.ok(!page.includes('managementView'),'no sticky alternate screen')
 console.log('PASS: failed writes preserve local state, last-version deletion, restore/archive/unarchive, move and active selection, project lifecycle, lineage guard, cloud hydration mapping')
})().catch(e=>{console.error(e);process.exitCode=1})
