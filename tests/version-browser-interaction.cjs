// Local verification harness. Run with CPM_TEST_TOOLS pointing to a directory
// containing React 18 and react-test-renderer 18. No account or database access.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const assert = require('node:assert/strict')
const ts = require('typescript')
const tooling = process.env.CPM_TEST_TOOLS
if (!tooling) throw new Error('Set CPM_TEST_TOOLS to the test tooling node_modules directory.')
const React = require(path.join(tooling, 'react'))
const Renderer = require(path.join(tooling, 'react-test-renderer'))
const root = path.resolve(__dirname, '..')
const requests = []
const permissions = { user: { email: 'test@example.invalid', orgName: 'Test enterprise' }, can: { uploadSchedule: true } }
const storage = new Map()
const fakeStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) }
function compile(file, dependencies) {
  const exports = {}
  const result = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX } })
  vm.runInNewContext(result.outputText, { exports, URLSearchParams, Date, localStorage: fakeStorage, require: id => {
    if (id === 'react') return React
    if (id === 'react/jsx-runtime') return require(path.join(tooling, 'react/jsx-runtime'))
    if (id in dependencies) return dependencies[id]
    throw new Error(`Unexpected import ${id}`)
  } })
  return exports
}
const dateHelpers = compile('src/lib/versionBrowser.ts', {'./sourceScheduleDate':compile('src/lib/sourceScheduleDate.ts',{})})
const Browser = compile('src/components/ProjectVersionBrowser.tsx', {
  'next/link': { default: ({ children, ...props }) => React.createElement('a', props, children) },
  'next/navigation': { useSearchParams: () => new URLSearchParams() },
  '@/lib/projectStore': { getVisibleVersions: p => p.versions.filter(v => !v.deletedAt) },
  '@/lib/versionBrowser': dateHelpers,
  './VersionNavigation': { useVersionNavigation: () => ({ request: (...args) => requests.push(args), opening: false }) },
  '@/lib/usePermissions': { usePermissions: () => permissions },
}).default
const v = (id, dataDate, extra = {}) => ({ id, dataDate, versionLabel: id, fileName: `${id}.xer`, uploadedAt: '2026-11-01', analysis: { totalActivities: 12 }, ...extra })
const projects = [{ id: 'p1', projectId: 'P1', name: 'Test Project', versions: [v('older', '2026-10-17'), v('latest', '2026-10-24'), v('revision', '2026-10-24', { sequenceNumber: 2 }), v('missing', undefined), v('deleted', '2026-11-01', { deletedAt: '2026-11-02' })] }]
let tree
Renderer.act(() => { tree = Renderer.create(React.createElement(Browser, { projects })) })
const buttons = () => tree.root.findAllByType('button')
const label = node => node.children.map(c => typeof c === 'string' ? c : label(c)).join('')
const button = text => buttons().find(b => label(b).includes(text))
assert.equal(tree.root.findAllByType('tr').filter(r => r.props.tabIndex === 0).length, 0)
Renderer.act(() => button('P1').props.onClick())
let versions = tree.root.findAllByType('tr').filter(r => r.props.tabIndex === 0)
assert.equal(versions.length, 4)
assert.ok(label(versions[0]).includes('revision.xer'))
assert.ok(label(versions[3]).includes('Not reported'))
Renderer.act(() => versions[0].props.onClick())
assert.equal(requests.length, 0, 'selecting must not load or switch')
Renderer.act(() => button('Open Version').props.onClick())
assert.deepEqual(requests[0], ['p1', 'revision'])
assert.ok(tree.root.findAllByType('a').some(a => a.props.href === '/dashboard/upload?mode=existing&project=p1'))
Renderer.act(() => tree.root.findAllByType('input').find(i => i.props.placeholder === 'Search…').props.onChange({ target: { value: 'older.xer' } }))
versions = tree.root.findAllByType('tr').filter(r => r.props.tabIndex === 0)
assert.equal(versions.length, 1)
assert.equal(button('Open Version').props.disabled, true, 'hidden selection cannot be opened')
Renderer.act(() => button('Columns').props.onClick())
const uploaded = tree.root.findAllByType('label').find(l => label(l) === 'Uploaded')
Renderer.act(() => uploaded.findByType('input').props.onChange())
assert.ok(storage.get('cpmreview:project-columns:test@example.invalid').includes('Uploaded'))
permissions.can.uploadSchedule = false
Renderer.act(() => tree.update(React.createElement(Browser, { projects })))
assert.ok(!tree.root.findAllByType('a').some(a => a.props.href.includes('mode=existing')))
Renderer.act(() => tree.unmount())
console.log('PASS: expand, select without switching, explicit open, same-date versions, hidden deleted versions, upload target, search, column persistence, viewer upload visibility')
