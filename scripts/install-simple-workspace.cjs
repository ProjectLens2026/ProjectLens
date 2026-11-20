const fs=require('node:fs'),path=require('node:path'),root=process.cwd()
const needed=['src/lib/projectWorkspace.ts','src/components/useProjectWorkspace.ts','src/components/WorkspaceSidebar.tsx','src/components/WorkspaceHeader.tsx','src/app/dashboard/workspace/page.tsx','src/app/dashboard/schedules/page.tsx']
for(const f of needed)if(!fs.existsSync(path.join(root,f)))throw Error('Copy all supplied src files into your project first. Missing: '+f)
const layout=fs.readFileSync(path.join(root,'src/app/dashboard/layout.tsx'),'utf8')
if(!layout.includes('WorkspaceSidebar')||!layout.includes('WorkspaceHeader'))throw Error('This dashboard uses a different shell. No existing files changed. Share src/app/dashboard/layout.tsx to adapt the wiring.')
if(!fs.readFileSync(path.join(root,'src/components/WorkspaceHeader.tsx'),'utf8').includes('PROJECT_TABS'))throw Error('The new header was not copied. Replace it with the supplied WorkspaceHeader.tsx first.')
const compare=path.join(root,'src/app/dashboard/changes/page.tsx')
if(fs.existsSync(compare)){const old=fs.readFileSync(compare,'utf8');const next=old.replace('Changes since prior version','Compare schedule versions').replace('Compare the selected submission to its immediate predecessor','Compare any two schedule versions');if(next!==old){const backup=compare+'.before-simple-workspace';if(!fs.existsSync(backup))fs.writeFileSync(backup,old);fs.writeFileSync(compare,next)}}
console.log('Simple project workspace connected. Open Portfolio in the sidebar, then select a project. Review and comparison engines preserved.')
