const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript')
const tooling=process.env.CPM_TEST_TOOLS
if(!tooling)throw Error('Set CPM_TEST_TOOLS to React 18/react-test-renderer node_modules.')
const React=require(path.join(tooling,'react')),R=require(path.join(tooling,'react-test-renderer'))
function compile(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:id=>id==='react'?React:id==='react/jsx-runtime'?require(path.join(tooling,id)):deps[id]});return exports}
let exported
const Panel=compile('src/components/TraceLogicPanel.tsx',{'@/lib/activityNetwork':compile('src/lib/activityNetwork.ts'),'@/lib/overviewXlsx':{downloadOverviewXlsx:s=>exported=s}}).default
const t=(id,type)=>({task_id:id,task_code:id,task_name:'Activity '+id,task_type:type})
let tree;R.act(()=>tree=R.create(React.createElement(Panel,{analysis:{traceTasks:{a:t('a','TT_Mile'),b:t('b','TT_FinMile'),c:t('c','TT_Task')},traceRelationships:[]}})))
const label=n=>n.children.map(c=>typeof c==='string'?c:label(c)).join('')
const selectActivity=id=>tree.root.findAllByType('button').find(b=>label(b)===id+'Activity '+id)
R.act(()=>selectActivity('c').props.onClick())
assert.ok(JSON.stringify(tree.toJSON()).includes('No relationships found'))
R.act(()=>tree.root.findAllByType('select')[0].props.onChange({target:{value:'start'}}))
assert.ok(selectActivity('a'));assert.equal(selectActivity('b'),undefined);assert.equal(selectActivity('c'),undefined)
R.act(()=>tree.root.findAllByType('button').find(b=>label(b).includes('Export trace')).props.onClick())
assert.equal(exported[0].rows[0][0],'c');assert.equal(exported[1].rows.length,0)
R.act(()=>tree.root.findByProps({'aria-label':'Analysis view'}).props.onChange({target:{value:'paths'}}))
assert.ok(JSON.stringify(tree.toJSON()).includes('No recorded predecessor'))
console.log('PASS: activity selection, isolated network, milestone filter, selection preservation and export')
