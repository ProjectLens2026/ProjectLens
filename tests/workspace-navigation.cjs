const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const tooling=process.env.CPM_TEST_TOOLS
if(!tooling)throw Error('Set CPM_TEST_TOOLS to React 18 / react-test-renderer 18 node_modules')
const React=require(path.join(tooling,'react')),R=require(path.join(tooling,'react-test-renderer'))
let pathname='/dashboard',calls=[]
const versions=[{id:'v1',fileName:'first.xer',dataDate:'2026-11-01'},{id:'v2',fileName:'old.xer',archivedAt:'2026-11-01'}]
let project={id:'p1',projectId:'IAD174',name:'Permitted project',versions}
const store={loadProjects:()=>project?[project]:[],getActiveProject:()=>project,getActiveVersion:()=>project?versions[0]:null,subscribeToProjects:()=>()=>{},getProjectStatus:()=> 'Active'}
function compile(file){
 const exports={}
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/components',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:id=>{
 if(id==='react')return React
 if(id==='react/jsx-runtime')return require(path.join(tooling,'react/jsx-runtime'))
 if(id==='next/link')return {default:({children,...props})=>React.createElement('a',props,children)}
 if(id==='next/navigation')return {usePathname:()=>pathname,useRouter:()=>({push:x=>calls.push(x),replace:()=>{}})}
 if(id==='@/lib/projectStore')return store
 if(id==='@/lib/versionBrowser')return {compareScheduleVersions:()=>0,scheduleDataDate:v=>v.dataDate,browserDate:x=>x}
 if(id==='./VersionNavigation')return {useVersionNavigation:()=>({opening:false,request:(...args)=>calls.push(args)})}
 if(id==='@/lib/supabase/client')return {createClient:()=>({auth:{signOut:async()=>({})}})}
 if(id==='@/lib/usePermissions')return {usePermissions:()=>({isPlatformOwner:false,user:{displayName:'Assigned PM',initials:'AP',orgName:'Company',orgRole:'pm'}}),roleLabel:x=>x}
 throw Error(id)
 }})
 return exports.default
}
const user={name:'User',company:'Company',initials:'U'}
const Sidebar=compile('WorkspaceSidebar.tsx'),Header=compile('WorkspaceHeader.tsx')
let sidebar,header
R.act(()=>{sidebar=R.create(React.createElement(Sidebar,{user}));header=R.create(React.createElement(Header,{user}))})
const text=tree=>JSON.stringify(tree.toJSON())
assert.ok(text(sidebar).includes('Assigned PM'))
assert.ok(!text(sidebar).includes('Platform administration'))
assert.ok(!text(sidebar).includes('old.xer'))
assert.ok(!text(sidebar).includes('Accessible projects'))
assert.ok(!text(sidebar).includes('first.xer'))
assert.ok(text(sidebar).includes('IAD174'))
assert.equal(sidebar.root.findAllByType('button').length,0)
assert.equal(sidebar.root.findAllByType('a').find(n=>n.props.href.includes('?projectId=')).props.href,'/dashboard/projects?projectId=p1')
assert.ok(sidebar.root.findAllByType('a').some(n=>n.props.className.includes('workspace-brand')))
const versionSelect=header.root.findByProps({'aria-label':'Showing schedule version'})
R.act(()=>versionSelect.props.onChange({target:{value:'v1'}}))
assert.deepEqual(calls[0],['p1','v1','/dashboard'])
const tabs=header.root.findByProps({'aria-label':'Project workspace'})
assert.deepEqual(tabs.findAllByType('a').map(n=>n.props.href),['/dashboard','/dashboard/approval','/dashboard/lens'])
assert.ok(text(header).includes('Schedule Analysis'))
R.act(()=>header.unmount())
pathname='/dashboard/changes'
R.act(()=>{header=R.create(React.createElement(Header,{user}))})
assert.equal(header.root.findAllByProps({'aria-label':'Showing schedule version'}).length,0)
assert.ok(text(header).includes('Project Controls'))
assert.equal(header.root.findAllByProps({'aria-label':'Project workspace'}).length,0)
assert.ok(header.root.findByProps({'aria-label':'Mobile project destinations'}))
R.act(()=>{header.unmount();sidebar.unmount()})
project=null
R.act(()=>{sidebar=R.create(React.createElement(Sidebar,{user}));header=R.create(React.createElement(Header,{user}))})
assert.equal(sidebar.root.findAllByProps({'aria-label':'Project destinations'}).length,0)
assert.equal(header.root.findByProps({'aria-label':'Mobile project destinations'}).findAllByType('a').filter(n=>n.props.href==='/dashboard/controls').length,0)
R.act(()=>{header.unmount();sidebar.unmount()})
console.log('PASS: no duplicate project tree, named project workspace, scoped version link, guarded version selector, Changes under Controls, logo and no-project state')

