// Run: node tests/review-basis-regression.cjs
const fs = require('node:fs');
const assert = require('node:assert/strict');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText, filename);
};
const { buildScheduleQualityFindings: review } = require('../src/lib/approval-readiness/qualityRules.ts');
const { taskMatchesContractMilestone: matches } = require('../src/lib/milestoneVocabulary.ts');
const milestone = { id: 'm', name: 'Phase Turnover', date: '2028-01-20', sourceReference: 'Project clause 1' };
const task = (code, extra = {}) => ({ task_id: code, task_code: code, task_name: 'Phase Turnover', task_type: 'TT_FinMile', target_end_date: '2028-01-25', ...extra });
function run(tasks, criteria = {}, milestones = [milestone], requirements = {}) {
  return review({ sourceFormat: 'P6_XER', traceTasks: Object.fromEntries(tasks.map(t => [t.task_id, t])), traceRelationships: [], calendars: { c: { clndr_id: 'c', clndr_name: 'Weather 6 Day', day_hr_cnt: 8, week_hr_cnt: 48 } }, reviewBasis: { contractDates: { contractMilestones: milestones }, scheduleRequirements: { profile: 'CUSTOM', ...requirements }, p6Settings: { profile: 'PROJECT_SPECIFIC', ...criteria } } });
}
const has = (findings, text) => findings.some(f => f.title.includes(text));
let count = 0;
function test(name, fn) { fn(); count++; console.log('PASS', name); }
test('Exact Activity ID wins over alias', () => assert.equal(matches(task('A', { task_name: 'Different wording' }), { ...milestone, mappedActivityCode: 'A' }), true));
test('Stale mapping does not fall back to name', () => assert.equal(matches(task('B'), { ...milestone, mappedActivityCode: 'A' }), false));
test('Ambiguous milestones do not generate late-date conclusions', () => { const f = run([task('A'), task('B')]); assert(has(f, 'mapping needs confirmation')); assert(!has(f, 'forecast after its authorized date')); });
test('Explicit mapping resolves repeated names', () => { const f = run([task('A'), task('B')], {}, [{ ...milestone, mappedActivityCode: 'B' }]); assert(has(f, 'forecast after its authorized date')); });
test('Missing mapped date remains unverified', () => { const f = run([task('A', { target_end_date: '' })], {}, [{ ...milestone, mappedActivityCode: 'A' }]); assert(has(f, 'forecast date needs verification')); });
test('Weekday criterion checks the mapped date', () => assert(has(run([task('A')], {}, [{ ...milestone, requiredWeekday: '1' }]), 'weekday requirement')));
test('No weekday default is imposed', () => assert(!has(run([task('A')]), 'weekday requirement')));
test('Documented non-contract constraints do not trigger milestone-only policy', () => { const f = run([task('A', { task_type: 'TT_Task', cstr_type: 'CS_MSOA', cstr_date: '2028-01-10' })], { nonContractConstraintsAllowed: true, constraintExceptionReference: 'Authorization 123' }); assert(!has(f, 'constraint authorization')); assert(!has(f, 'milestone-only policy')); });
test('Undocumented exception requests verification', () => { const f = run([task('A', { task_type: 'TT_Task', cstr_type: 'CS_MSOA', cstr_date: '2028-01-10' })], { nonContractConstraintsAllowed: true }); assert(has(f, 'constraint authorization')); assert.equal(f.find(x => x.title.includes('constraint authorization')).criticalGate, false); });
test('Mandatory constraints remain separately checked', () => assert(has(run([task('A', { cstr_type: 'CS_MSON', cstr_date: '2028-01-10' })], { hardConstraintsAllowed: false, nonContractConstraintsAllowed: true, constraintExceptionReference: 'Authorization 123' }), 'Hard constraints')));
test('Units/Time duration choice distinguishes Units', () => { const t = task('A', { task_type: 'TT_Task', duration_type: 'DT_FixedDUR' }); assert(!has(run([t], { durationType: 'FIXED_DURATION_AND_UNITS_TIME' }), 'duration type differs')); assert(has(run([t], { durationType: 'FIXED_DURATION_AND_UNITS' }), 'duration type differs')); });
test('Missing duration type is not silently passed', () => assert(has(run([task('A', { task_type: 'TT_Task' })], { durationType: 'FIXED_DURATION_AND_UNITS_TIME' }), 'duration-type evidence')));
test('Milestones exempt from duration-type checks', () => assert(!has(run([task('A')], { durationType: 'FIXED_DURATION_AND_UNITS_TIME' }), 'duration-type evidence')));
test('Calendar label and hours do not prove Saturday work', () => { const f = run([task('A', { task_type: 'TT_Task', clndr_id: 'c' })], {}, [], { saturdayWorkPolicy: 'PROHIBITED', weatherCalendarPolicy: 'REQUIRED' }); assert(has(f, 'calendar evidence requires verification')); assert(!has(f, 'permit Saturday')); assert(!has(f, 'weather calendar is not assigned')); });
test('Calendar-day review duration remains unverified', () => { const f = run([task('A', { task_type: 'TT_Task', task_name: 'Review submittal', clndr_id: 'c', target_drtn_hr_cnt: 112 })], {}, [], { reviewApprovalDuration: 14, reviewApprovalDurationBasis: 'CALENDAR_DAYS' }); assert(has(f, 'calendar evidence requires verification')); assert(!has(f, 'do not match the contract allowance')); });
console.log(`${count} regression checks passed.`);
