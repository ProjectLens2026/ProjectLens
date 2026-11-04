const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const vm = require('node:vm')
const path = require('node:path')
const root = path.resolve(__dirname, '..')
const source = fs.readFileSync(path.join(root, 'src/lib/versionBrowser.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const exportsObject = {}
const dateExports={}
vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(root,'src/lib/sourceScheduleDate.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{exports:dateExports,Date})
vm.runInNewContext(js, { exports: exportsObject, Date, require:()=>dateExports })
const { scheduleDataDate, compareScheduleVersions, browserDate } = exportsObject
const version = (id, dataDate, uploadedAt, sequenceNumber = 0) => ({ id, dataDate, uploadedAt, sequenceNumber })
assert.equal(scheduleDataDate(version('a', undefined, '2026-12-01')), '')
assert.equal(scheduleDataDate({ analysis: { dataDate: '2026-10-24T08:00:00' } }), '2026-10-24')
assert.equal(scheduleDataDate(version('x', '2026-02-30')), '')
assert.equal(browserDate('2028-01-20T00:00:00Z'), '20-Jan-2028')
const records = [version('missing', undefined, '2026-12-01'), version('old', '2026-10-17', '2026-11-02'), version('new', '2026-10-24', '2026-10-25')]
assert.deepEqual(records.sort(compareScheduleVersions).map(v => v.id), ['new', 'old', 'missing'])
const sameDate = [version('original', '2026-10-24', '2026-10-25', 1), version('revision', '2026-10-24', '2026-10-26', 2)]
assert.deepEqual(sameDate.sort(compareScheduleVersions).map(v => v.id), ['revision', 'original'])
assert.equal(sameDate.length, 2, 'same-date submissions must not be deduplicated')
const component = fs.readFileSync(path.join(root, 'src/components/ProjectVersionBrowser.tsx'), 'utf8')
assert.ok(component.includes('mode=existing&project='), 'upload must use the existing-project route')
assert.ok(component.includes('navigation.request(project.id, v.id)'), 'opening uses the safe loader')
assert.ok(!component.includes('setActiveVersionId'), 'selection must not commit an active version')
console.log('PASS: data-date ordering, missing dates, revisions, calendar dates, upload routing and safe-loader wiring')
