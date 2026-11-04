const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm'), assert = require('node:assert/strict')
const ts = require('typescript'), tooling = process.env.CPM_TEST_TOOLS
const React = require(path.join(tooling, 'react')), R = require(path.join(tooling, 'react-test-renderer'))
let api, listener, calls = [], fail = false
const project = { id: 'p', name: 'Project', versions: [{ id: 'old' }, { id: 'new' }] }
const exportsObject = {}
const dateExports={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../src/lib/sourceScheduleDate.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:dateExports,Date})
const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '../src/components/VersionNavigation.tsx'), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } }).outputText
vm.runInNewContext(code, { Error, exports: exportsObject, document: { activeElement: null, addEventListener: (type, fn) => { listener = fn }, removeEventListener: () => {} }, require: id => {
  if (id === 'react') return React
  if (id === '@/lib/sourceScheduleDate') return dateExports
  if (id === 'react/jsx-runtime') return require(path.join(tooling, 'react/jsx-runtime'))
  if (id === 'next/navigation') return { usePathname: () => '/dashboard/approval', useRouter: () => ({ push: p => calls.push(['route', p]) }) }
  if (id === '@/lib/projectStore') return { getActiveProject: () => project, getActiveVersion: () => project.versions[0], loadProjects: () => [project], loadVersionAnalysis: async id => { calls.push(['load', id]); if (fail) throw Error('Download failed'); return { analysisState: 'loaded', analysis: {} } }, setActiveProjectId: id => calls.push(['project', id]), setActiveVersionId: id => calls.push(['version', id]) }
  throw Error(id)
} })
function Child() { api = exportsObject.useVersionNavigation(); return React.createElement('div') }
function mount() { let tree; R.act(() => { tree = R.create(React.createElement(exportsObject.default, null, React.createElement(Child))) }); return tree }
function text(node) { return JSON.stringify(node.toJSON()) }
;(async () => {
  let tree = mount()
  await R.act(async () => { api.request('p', 'new') })
  assert.deepEqual(calls.map(c => c[0]), ['load', 'project', 'version', 'route'])
  assert.ok(!text(tree).includes('Leaving'))
  R.act(() => tree.unmount())
  calls = []; tree = mount()
  await R.act(async () => { api.request('p', 'new', '/dashboard/lens') })
  assert.deepEqual(calls[calls.length-1], ['route','/dashboard/lens'])
  assert.equal(api.targetPath,'/dashboard/lens')
  R.act(() => tree.unmount())
  calls = []; tree = mount()
  R.act(() => listener({ target: { closest: () => null, matches: () => true } }))
  await R.act(async () => { api.request('p', 'new') })
  assert.equal(calls.length, 0)
  assert.ok(text(tree).includes('Leave edited page?'))
  R.act(() => tree.unmount())
  calls = []; fail = true; tree = mount()
  await R.act(async () => { api.request('p', 'new') })
  assert.deepEqual(calls.map(c => c[0]), ['load'])
  assert.ok(text(tree).includes('Download failed'))
  R.act(() => tree.unmount())
  console.log('PASS: direct open, preload before selection, edited-page warning, failed load preserves selection')
})().catch(e => { console.error(e); process.exitCode = 1 })
