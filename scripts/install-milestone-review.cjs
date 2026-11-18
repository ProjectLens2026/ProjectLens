const fs=require('node:fs'),path=require('node:path')
const file=path.join(process.cwd(),'src/components/WorkspaceHeader.tsx')
if(!fs.existsSync(file))throw Error('Run this from the project root containing src/components/WorkspaceHeader.tsx.')
const source=fs.readFileSync(file,'utf8'),marker='Milestone review navigation'
if(source.includes(marker)){console.log('Milestone review link already installed.');process.exit(0)}
if(!source.includes('usePathname')||!source.includes('next/link'))throw Error('Header structure differs. Add a link to /dashboard/approval/paths inside your existing Review Version navigation.')
const at=source.lastIndexOf('</header>')
if(at<0)throw Error('Header anchor was not found. No existing file changed.')
const addition=`\n    {(pathname==='/dashboard/approval'||pathname.startsWith('/dashboard/approval/'))&&<nav aria-label="Milestone review navigation" className="border-t flex flex-wrap gap-4 px-5 py-3 text-sm"><Link href="/dashboard/approval" className="text-blue-700">Review comments</Link><Link href="/dashboard/approval/paths" className="text-blue-700 font-semibold">Phase and milestone paths</Link></nav>}\n  `
const backup=file+'.before-milestone-review'
if(!fs.existsSync(backup))fs.writeFileSync(backup,source)
fs.writeFileSync(file,source.slice(0,at)+addition+source.slice(at))
console.log('Added the Review Version navigation link. Existing review logic was preserved.')
