const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..'),dir=fs.mkdtempSync(path.join(root,'.controls-test-'));
try{
 const fixtures={
 'src/lib/supabase/db.ts':`export async function loadProjectsFromSupabase(){let rows=[];let q=db.order('updated_at', { ascending: false });const fallback=db.order('updated_at', { ascending: false });\n  return rows.map(rowToProject)\n}`,
 'src/lib/projectStore.ts':'export const unchangedStore=true',
 'src/lib/projectReviewBasis.ts':`function sourceBasis(){\n  const contractDates: ContractDates | undefined = undefined\n  const scheduleRequirements: ScheduleRequirementsBasis | undefined = undefined\n  const p6Settings: P6SettingsBasis | undefined = undefined\n}`,
 'src/app/dashboard/approval/page.tsx':`'use client'\nfunction currentPlanningEngine(){return 'preserved'}\nexport default function Review(){return <main><PhaseMilestoneReview analysis={analysis}/></main>}`,
 'src/app/dashboard/project-setup/page.tsx':`'use client'\nexport default function ProjectControlBasisPage(){return <p>Project Setup is temporarily hidden</p>}\nfunction PreservedProjectControlBasisPage(){return <p>Existing contract setup</p>}`,
 'src/components/ScheduleOverview.tsx':`'use client'\nexport default function Overview(){return <main className="overview-root p-5">Current statistics</main>}`
 };
 for(const [file,content] of Object.entries(fixtures)){const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content)}
 for(const file of ['src/components/VersionDecisionPanel.tsx','src/components/ProjectControlPosition.tsx','src/components/ProjectSetupAccess.tsx','src/components/useProjectDirectory.ts','migrations/20261120_project_controls.sql','src/components/ProjectControlBanner.tsx','src/components/DirectoryControls.tsx','src/components/useControlWorkflow.ts','src/lib/controlWorkflow.ts','tests/project-controls.cjs','tests/project-controls-installer.cjs','patches/project-controls/db-append.txt','patches/project-controls/store-append.txt']){const p=path.join(dir,file);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(root,file),p)}
 const run=()=>spawnSync(process.execPath,[path.join(root,'scripts/install-project-controls.cjs')],{cwd:dir,encoding:'utf8'});
 fs.writeFileSync(path.join(dir,'src/components/ScheduleOverview.tsx'),'different source');let result=run();assert.notEqual(result.status,0);for(const [file,content]of Object.entries(fixtures))if(!file.includes('ScheduleOverview'))assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),content,'Preflight must not partially modify '+file);
 fs.writeFileSync(path.join(dir,'src/components/ScheduleOverview.tsx'),fixtures['src/components/ScheduleOverview.tsx']);result=run();assert.equal(result.status,0,result.stderr);
 const before={};for(const file of Object.keys(fixtures)){before[file]=fs.readFileSync(path.join(dir,file),'utf8');assert.equal(fs.readFileSync(path.join(dir,file+'.before-project-controls'),'utf8'),fixtures[file])}
 assert.ok(before['src/app/dashboard/approval/page.tsx'].includes("function currentPlanningEngine(){return 'preserved'}"));assert.ok(before['src/app/dashboard/approval/page.tsx'].includes('<VersionDecisionPanel'));
 result=run();assert.equal(result.status,0,result.stderr);for(const file of Object.keys(fixtures))assert.equal(fs.readFileSync(path.join(dir,file),'utf8'),before[file]);
 console.log('PASS: atomic installer failure, existing planning engine preservation, setup restoration, backups and idempotence.');
}finally{fs.rmSync(dir,{recursive:true,force:true})}
