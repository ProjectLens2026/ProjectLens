// A schedule data date is a calendar date, never an upload timestamp.
export function sourceDay(value:unknown):string {
  const day=String(value||'').trim().slice(0,10)
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day))return ''
  const d=new Date(day+'T00:00:00Z')
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===day?day:''
}
export function analysisDataDate(a:any):string {
  if(!a)return ''
  // Presence matters: an empty source field must not fall back to an override.
  if(a.projectSettings&&Object.prototype.hasOwnProperty.call(a.projectSettings,'last_recalc_date'))return sourceDay(a.projectSettings.last_recalc_date)
  if(Object.prototype.hasOwnProperty.call(a,'sourceDataDate'))return sourceDay(a.sourceDataDate)
  return sourceDay(a.dataDate||a.data_date)
}
export function versionDataDate(v:any):string {
  if(!v)return ''
  const a=v.analysis
  if(a?.projectSettings&&Object.prototype.hasOwnProperty.call(a.projectSettings,'last_recalc_date'))return analysisDataDate(a)
  if(a?.traceTasks||a?.sourceDataDate!==undefined)return analysisDataDate(a)
  // Old flat database dates may have been populated from a manual override.
  // Wait for original detailed analysis instead of presenting that as XER truth.
  if(v.versionDates?.manualDataDate)return ''
  return analysisDataDate(a)||sourceDay(v.dataDate)
}
