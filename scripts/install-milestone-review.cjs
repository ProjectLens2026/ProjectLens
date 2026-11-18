const fs=require('node:fs'),path=require('node:path')
const base=process.cwd(),page=path.join(base,'src/app/dashboard/approval/page.tsx'),header=path.join(base,'src/components/WorkspaceHeader.tsx')
if(!fs.existsSync(page)||!fs.existsSync(header))throw Error('Run this from the project root containing src/app/dashboard/approval/page.tsx and src/components/WorkspaceHeader.tsx.')
let source=fs.readFileSync(page,'utf8'),nav=fs.readFileSync(header,'utf8')
const marker='Integrated phase milestone comments'
if(!source.includes(marker)){
 const block=/\{activeTab\s*===\s*['"]comments['"]\s*&&\s*\(\s*(<CommentRegisterPanel\b[\s\S]*?\/>)\s*\)\}/
 if(!block.test(source))throw Error('Your Comments page structure differs. No files changed. Share the current src/app/dashboard/approval/page.tsx so integration can preserve your existing review engine.')
 for(const name of ['reviewData.comments','project.contractDates','version.fileName']){
  // Optional access syntax is accepted; fail before writing if the expected state is absent.
  if(!source.replace(/\?\./g,'.').includes(name))throw Error('Current review state differs ('+name+'). No files changed. Share the current approval/page.tsx for a compatible integration.')
 }
 const replacement=`{/* Integrated phase milestone comments */}
      {activeTab === 'comments' && <div className="space-y-5 min-w-0">
        <PhaseMilestoneReview
          key={project.id+':'+version.id}
          analysis={analysis}
          contractMilestones={project.contractDates?.contractMilestones}
          storageKey={'cpmr:milestone-review:v1:'+project.id+':'+version.id}
          label={project.projectId||project.name}
          source={version.fileName}
          findings={result?.findings||[]}
          register={reviewData.comments}
        />
        <details className="border rounded-xl bg-white p-4">
          <summary className="cursor-pointer font-semibold">Project-wide comment register — issue, respond and close comments</summary>
          <p className="text-sm text-slate-500 my-3">All formal comments remain here, including items without an activity mapping. The milestone review above shows comments with a confirmed link to the selected upstream network.</p>
          $1
        </details>
      </div>}`
 source=source.replace(block,replacement)
 if(!/import\s+PhaseMilestoneReview\s+from/.test(source)){
  const directive=/(['"]use client['"];?)/
  if(!directive.test(source))throw Error('Client page directive not found. No files changed.')
  source=source.replace(directive,"$1\nimport PhaseMilestoneReview from '@/components/PhaseMilestoneReview'")
 }
}
// The main Comments page owns vertical scrolling within the fixed dashboard shell.
source=source.replace('className="flex flex-col h-full min-h-0 min-w-0"','className="flex flex-col flex-1 min-h-0 min-w-0"').replace('className="flex flex-col h-full"','className="flex flex-col flex-1 min-h-0 min-w-0"').replace('className="flex-1 overflow-y-auto p-5 bg-slate-50"','className="flex-1 min-h-0 overflow-y-auto p-5 bg-slate-50"')
nav=nav.replace(/\s*\{\(pathname==='\/dashboard\/approval'\|\|pathname\.startsWith\('\/dashboard\/approval\/'\)\)&&<nav aria-label="Milestone review navigation"[\s\S]*?<\/nav>\}/,'')
for(const [file,content] of [[page,source],[header,nav]]){
 const current=fs.readFileSync(file,'utf8')
 if(current!==content){const backup=file+'.before-integrated-review';if(!fs.existsSync(backup))fs.writeFileSync(backup,current);fs.writeFileSync(file,content)}
}
console.log('Phase and milestone selection is now inside Review Version > Comments. Existing review engine and formal register preserved; separate path navigation removed.')
