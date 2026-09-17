export type CLSeverity = 'HIGH' | 'MEDIUM' | 'REVIEW'

export interface CLPathFinding {
  id: string
  severity: CLSeverity
  title: string
  detail: string
  evidence: string[]
}

export interface CLProjectUnderstanding {
  projectNature: string
  deliveryNature: string[]
  areas: string[]
  systems: string[]
  completionTarget?: { id: string; code: string; name: string; finish?: string }
}

export interface CLDerivedPath {
  title: string
  basis: string
  activities: any[]
  connectionToTarget: 'SUBMITTED' | 'REFERENCE_GAP' | 'UNRESOLVED'
  connectionNote: string
}

export interface CLPathIntelligenceResult {
  understanding: CLProjectUnderstanding
  findings: CLPathFinding[]
  criticalPath: CLDerivedPath | null
  longestPath: CLDerivedPath | null
}

type Rel = { task_id?: string; pred_task_id?: string; pred_type?: string; lag_hr_cnt?: string }

const norm = (s: any) => String(s || '').toLowerCase().replace(/[–—_]+/g, ' ').replace(/\s+/g, ' ').trim()
const codeOf = (t: any) => String(t?.task_code || '').trim()
const nameOf = (t: any) => String(t?.task_name || '').trim()
const textOf = (t: any) => norm(`${codeOf(t)} ${nameOf(t)} ${(t?.wbs_path || []).join(' ')}`)
const finishOf = (t: any) => String(t?.early_end_date || t?.target_end_date || t?.act_end_date || '')
const startOf = (t: any) => String(t?.early_start_date || t?.target_start_date || t?.act_start_date || '')
const ms = (s: string) => { const d = s ? new Date(s.replace(' ', 'T')).getTime() : NaN; return Number.isFinite(d) ? d : 0 }
const floatDays = (t: any) => { const n = parseFloat(String(t?.total_float_hr_cnt || '')); return Number.isFinite(n) ? n / 8 : null }
const durationDays = (t: any) => {
  const n = parseFloat(String(t?.remain_drtn_hr_cnt || t?.target_drtn_hr_cnt || ''))
  return Number.isFinite(n) ? Math.max(0, n / 8) : 0
}

function scopeOf(t: any): string {
  const s = textOf(t)
  if (/\bquarantine\b|\bqb\b|\bcons qb\b|\bcomm qb\b/.test(s)) return 'Quarantine Building'
  if (/\badmin\b|\badm\b/.test(s)) return 'Admin Building'
  if (/\bdog kennel\b|\bkennel\b|\bkb\b|\bk b1\b|\bk b2\b|\bk b3\b/.test(s)) return 'Kennel Buildings'
  if (/\bcivil\b|\bsite\b|\butil\b|grading|landscap|parking|fencing|duct bank/.test(s)) return 'Site / Civil'
  return 'Project Wide'
}

function semantic(t: any): string {
  const s = textOf(t)
  if (/substantial completion/.test(s)) return 'SUBSTANTIAL_COMPLETION'
  if (/final completion|projected completion|contract completion/.test(s)) return 'FINAL_COMPLETION'
  if (/closeout qc checklist|facility acceptance recommendation|final inspection|government acceptance|gov acceptance/.test(s)) return 'ACCEPTANCE'
  if (/conduct training|training/.test(s)) return 'TRAINING'
  if (/integrated systems? test|\bist\b/.test(s)) return 'IST'
  if (/commission|\bcx\b|performance verification|\bpvt\b|test and balance|\btab\b|functional performance/.test(s)) return 'COMMISSIONING'
  if (/start[ -]?up/.test(s)) return 'STARTUP'
  if (/testing| test\b|hydro test|acceptance test/.test(s)) return 'TESTING'
  if (/switchgear|main distribution|\bmdp\b|electrical panels?/.test(s)) return 'ELECTRICAL_DISTRIBUTION'
  if (/generator|genset/.test(s)) return 'GENERATOR'
  if (/natural gas|gas main|gas piping/.test(s)) return 'GAS'
  if (/hvac|ahu|rtu|chiller|duct work|ductwork|mechanical/.test(s)) return 'HVAC'
  if (/building control|\bbms\b|\bbas\b|controls? install|controller configuration|programming software/.test(s)) return 'CONTROLS'
  if (/fire alarm|sprinkler/.test(s)) return 'LIFE_SAFETY'
  if (/roof|air barrier|wall panels?|window|doors? and hardware|dry[ -]?in|water[ -]?tight|insulation/.test(s)) return 'ENVELOPE'
  if (/foundation|footer|footing|slab|steel truss|steel deck|block installation|structural/.test(s)) return 'STRUCTURE'
  if (/proc-|procurement|fabricate and delivery|review and approve|prepare and submit/.test(s)) return 'PROCUREMENT'
  if (/electrical rough|lighting install|cable tray|conduit/.test(s)) return 'ELECTRICAL_INSTALL'
  if (/construction complete|building complete|clin 000[1245]/.test(s)) return 'AREA_COMPLETE'
  return 'OTHER'
}

function hasAny(text: string, terms: RegExp[]) { return terms.some(r => r.test(text)) }

function chooseCompletionTarget(tasks: any[]): any | null {
  const substantial = tasks.filter(t => /substantial completion/.test(textOf(t))).sort((a,b) => ms(finishOf(b))-ms(finishOf(a)))
  if (substantial.length) return substantial[0]
  const projected = tasks.filter(t => /projected completion|contract completion|final completion/.test(textOf(t))).sort((a,b) => ms(finishOf(b))-ms(finishOf(a)))
  return projected[0] || null
}

function reachable(startId: string, succ: Map<string, Rel[]>, maxDepth = 8): Set<string> {
  const out = new Set<string>()
  let q: {id:string,d:number}[] = [{id:startId,d:0}]
  while (q.length) {
    const {id,d} = q.shift()!
    if (d >= maxDepth) continue
    for (const r of succ.get(id) || []) {
      const n = String(r.task_id || '')
      if (!n || out.has(n)) continue
      out.add(n); q.push({id:n,d:d+1})
    }
  }
  return out
}

function sameScopeBonus(a: any, b: any): number {
  const sa = scopeOf(a), sb = scopeOf(b)
  if (sa === sb && sa !== 'Project Wide') return 50
  if (sa === sb) return 10
  return 0
}

function readinessRank(t: any): number {
  switch (semantic(t)) {
    case 'ACCEPTANCE': return 100
    case 'TRAINING': return 95
    case 'IST': return 92
    case 'COMMISSIONING': return 90
    case 'TESTING': return 85
    case 'STARTUP': return 80
    case 'CONTROLS': return 74
    case 'HVAC': return 70
    case 'LIFE_SAFETY': return 68
    case 'ELECTRICAL_DISTRIBUTION': return 66
    case 'ELECTRICAL_INSTALL': return 60
    case 'ENVELOPE': return 55
    case 'STRUCTURE': return 45
    case 'PROCUREMENT': return 30
    default: return 10
  }
}

function greedyCredibleBacktrace(endpoint: any, byId: Map<string, any>, pred: Map<string, Rel[]>, maxNodes = 18): any[] {
  const rev: any[] = [endpoint]
  let cur = endpoint
  const seen = new Set<string>([String(endpoint.task_id)])
  while (rev.length < maxNodes) {
    const candidates = (pred.get(String(cur.task_id)) || [])
      .map(r => byId.get(String(r.pred_task_id || '')))
      .filter(Boolean)
      .filter((t: any) => !seen.has(String(t.task_id)))
    if (!candidates.length) break
    const curScope = scopeOf(cur)
    candidates.sort((a: any,b: any) => {
      const score = (t:any) => {
        const tf = floatDays(t)
        const lowFloat = tf == null ? 0 : Math.max(0, 20 - Math.min(20, Math.abs(tf)))
        const scope = sameScopeBonus(t, cur)
        const semanticScore = readinessRank(t)
        const dateScore = ms(finishOf(t)) / 1e12
        return scope + semanticScore + lowFloat + dateScore
      }
      return score(b)-score(a)
    })
    let next = candidates[0]
    // Once we are in a named building, avoid jumping to an unrelated building unless no alternative exists.
    const same = candidates.find((t:any) => scopeOf(t) === curScope && curScope !== 'Project Wide')
    if (same) next = same
    seen.add(String(next.task_id)); rev.push(next); cur = next
  }
  return rev.reverse()
}

function longestCredibleChain(endpoint: any, byId: Map<string, any>, pred: Map<string, Rel[]>, maxDepth = 26): any[] {
  const targetScope = scopeOf(endpoint)
  const allowed = new Set(['PROCUREMENT','STRUCTURE','ENVELOPE','ELECTRICAL_DISTRIBUTION','ELECTRICAL_INSTALL','GENERATOR','GAS','HVAC','CONTROLS','LIFE_SAFETY','STARTUP','TESTING','COMMISSIONING','IST','TRAINING','ACCEPTANCE','AREA_COMPLETE','OTHER'])
  const memo = new Map<string,{score:number,path:any[]}>()
  function dfs(id: string, stack: Set<string>, depth: number): {score:number,path:any[]} {
    if (depth > maxDepth || stack.has(id)) return {score:0,path:[]}
    if (memo.has(id)) return memo.get(id)!
    const t = byId.get(id); if (!t) return {score:0,path:[]}
    const nextStack = new Set(stack); nextStack.add(id)
    let best = {score: durationDays(t), path:[t] as any[]}
    for (const r of pred.get(id) || []) {
      const p = byId.get(String(r.pred_task_id || '')); if (!p) continue
      const sem = semantic(p); const ps = scopeOf(p)
      if (!allowed.has(sem)) continue
      if (targetScope !== 'Project Wide' && ps !== targetScope && ps !== 'Project Wide' && ps !== 'Site / Civil') continue
      const sub = dfs(String(p.task_id), nextStack, depth+1)
      const scopeWeight = ps === targetScope ? 4 : 0
      const semanticWeight = readinessRank(p) / 100
      const score = sub.score + durationDays(t) + scopeWeight + semanticWeight
      if (score > best.score) best = {score, path:[...sub.path,t]}
    }
    memo.set(id,best); return best
  }
  return dfs(String(endpoint.task_id), new Set(), 0).path
}

export function analyzeCLPathIntelligence(analysis: any): CLPathIntelligenceResult | null {
  if (!analysis) return null
  const traceTasksObj = analysis.traceTasks || {}
  const fullTasks: any[] = Array.isArray(analysis.allTasksForPaths) ? analysis.allTasksForPaths : []
  const fullById = new Map<string, any>(fullTasks.map(t => [String(t.task_id), t]))
  const tasks = Object.values(traceTasksObj).map((t:any) => ({ ...t, ...(fullById.get(String(t.task_id)) || {}) }))
  if (!tasks.length) return null
  const byId = new Map<string, any>(tasks.map((t:any) => [String(t.task_id),t]))
  const rels: Rel[] = Array.isArray(analysis.traceRelationships) ? analysis.traceRelationships : []
  const pred = new Map<string, Rel[]>(), succ = new Map<string, Rel[]>()
  for (const r of rels) {
    const sid=String(r.task_id||''), pid=String(r.pred_task_id||''); if (!sid || !pid) continue
    pred.set(sid,[...(pred.get(sid)||[]),r]); succ.set(pid,[...(succ.get(pid)||[]),r])
  }

  const target = chooseCompletionTarget(tasks)
  const targetFinish = target ? ms(finishOf(target)) : 0
  const allText = tasks.map(textOf).join(' | ')
  const areas = ['Admin Building','Kennel Buildings','Quarantine Building','Site / Civil'].filter(a => tasks.some(t => scopeOf(t)===a))
  const systems: string[] = []
  const sysDefs: [string,RegExp[]][] = [
    ['Electrical Distribution',[/switchgear/,/\bmdp\b/,/main distribution/,/electrical panels?/]],
    ['Generator / Emergency Power',[/generator/,/genset/]],
    ['Natural Gas',[/natural gas/,/gas main/,/gas piping/]],
    ['HVAC / Mechanical',[/hvac/,/ahu/,/rtu/,/chiller/,/duct work/,/mechanical/]],
    ['Controls',[/building control/,/\bbms\b/,/\bbas\b/,/controller configuration/,/programming software/]],
    ['Fire Alarm / Sprinkler',[/fire alarm/,/sprinkler/]],
    ['Commissioning / PVT',[/\bcx\b/,/commission/,/performance verification/,/\bpvt\b/,/test and balance/]],
  ]
  for (const [label, pats] of sysDefs) if (hasAny(allText,pats)) systems.push(label)

  const projectNature = /kennel|quarantine/.test(allText)
    ? 'Multi-building facility construction — kennel / support campus'
    : 'Building / facility construction'
  const deliveryNature = ['Preconstruction','Procurement','Site / Civil','Building Construction']
  if (systems.some(s=>/Commissioning/.test(s))) deliveryNature.push('Startup / Testing / Commissioning')
  deliveryNature.push('Closeout / Acceptance')

  const findings: CLPathFinding[] = []
  let fid=0
  const add=(severity:CLSeverity,title:string,detail:string,evidence:string[])=>findings.push({id:`CLP-${String(++fid).padStart(3,'0')}`,severity,title,detail,evidence})

  if (target) {
    const directPreds=(pred.get(String(target.task_id))||[]).map(r=>byId.get(String(r.pred_task_id||''))).filter(Boolean)
    const readiness=directPreds.filter((t:any)=>['STARTUP','TESTING','COMMISSIONING','IST','TRAINING','ACCEPTANCE'].includes(semantic(t)))
    if (!readiness.length) add('HIGH','Substantial Completion lacks a direct readiness / commissioning predecessor',
      `${codeOf(target)} — ${nameOf(target)} is fed by submitted completion/procurement/site branches, but no direct startup, testing, commissioning, training, acceptance or integrated-test activity is tied into the milestone.`,
      [codeOf(target),...directPreds.slice(0,8).map(codeOf)])
  }

  // Cross-scope predecessor on an area-completion milestone.
  for (const t of tasks.filter(t=>semantic(t)==='AREA_COMPLETE')) {
    const s=scopeOf(t); if (s==='Project Wide' || s==='Site / Civil') continue
    for (const r of pred.get(String(t.task_id))||[]) {
      const p=byId.get(String(r.pred_task_id||'')); if (!p) continue
      const ps=scopeOf(p)
      if (ps!=='Project Wide' && ps!=='Site / Civil' && ps!==s) add('HIGH','Cross-scope predecessor drives an area completion milestone',
        `${codeOf(t)} — ${nameOf(t)} is driven by ${codeOf(p)} — ${nameOf(p)}, which Control Lens classifies under ${ps}, not ${s}. Verify whether the predecessor is mislinked or the milestone is mislabeled.`,[codeOf(p),codeOf(t)])
    }
  }

  // Same-area readiness continuing after an area completion milestone.
  for (const t of tasks.filter(t=>semantic(t)==='AREA_COMPLETE')) {
    const s=scopeOf(t), f=ms(finishOf(t)); if (!f || s==='Project Wide' || s==='Site / Civil') continue
    const later=tasks.filter(x=>scopeOf(x)===s && ['STARTUP','TESTING','COMMISSIONING','TRAINING','ACCEPTANCE'].includes(semantic(x)) && ms(finishOf(x))>f)
      .sort((a,b)=>ms(finishOf(a))-ms(finishOf(b)))
    if (later.length) add('MEDIUM','Area completion milestone occurs before later readiness work',
      `${codeOf(t)} — ${nameOf(t)} finishes ${finishOf(t).slice(0,10)}, while same-area startup/commissioning/turnover activities continue through ${finishOf(later[later.length-1]).slice(0,10)}. The milestone may represent construction completion, but it does not demonstrate turnover readiness.`,
      [codeOf(t),...later.slice(-4).map(codeOf)])
  }

  // Electrical distribution representation and downstream readiness.
  const dist=tasks.filter(t=>semantic(t)==='ELECTRICAL_DISTRIBUTION')
  const explicitSwitchgear=tasks.some(t=>/switchgear/.test(textOf(t)))
  if (dist.length && !explicitSwitchgear) add('REVIEW','Switchgear is not explicitly represented; MDP/panel activities may be the equivalent state',
    `The XER contains electrical-distribution activities such as ${dist.slice(0,3).map(t=>`${codeOf(t)} — ${nameOf(t)}`).join('; ')}, but no activity explicitly identified as switchgear. Map the submitted equipment to the project electrical one-line before declaring the state missing.`,dist.slice(0,4).map(codeOf))
  for (const d of dist.filter(t=>/fabricate and delivery.*mdp|\bmdp\b/.test(textOf(t)))) {
    const reach=reachable(String(d.task_id),succ,6)
    const downstream=Array.from(reach).map(id=>byId.get(id)).filter(Boolean)
    if (!downstream.some(t=>['STARTUP','TESTING','COMMISSIONING','IST'].includes(semantic(t)) || /energiz|acceptance/.test(textOf(t)))) {
      add('HIGH','Electrical distribution chain does not demonstrate energization / testing readiness',
        `${codeOf(d)} — ${nameOf(d)} has downstream installation logic, but Control Lens does not find an energization, protection/test, or commissioning state within the submitted successor chain.`,[codeOf(d),...downstream.slice(0,5).map(codeOf)])
      break
    }
  }

  // Generator-specific readiness.
  const genInstall=tasks.find(t=>semantic(t)==='GENERATOR' && /install/.test(textOf(t)))
  if (genInstall) {
    const downstream=Array.from(reachable(String(genInstall.task_id),succ,5)).map(id=>byId.get(id)).filter(Boolean)
    if (!downstream.some(t=>/generator.*test|load bank|start[ -]?up|commission|ats|transfer switch|energiz/.test(textOf(t))))
      add('HIGH','Generator installation is not followed by generator-specific startup / test / acceptance logic',
        `${codeOf(genInstall)} — ${nameOf(genInstall)} is present, but its submitted downstream logic does not demonstrate generator startup, ATS/source verification, load-bank testing, energization or acceptance.`,[codeOf(genInstall),...downstream.slice(0,5).map(codeOf)])
  }

  // Natural-gas utility readiness.
  const gas=tasks.filter(t=>semantic(t)==='GAS')
  if (gas.length && !tasks.some(t=>/gas.*(meter|service available|turn on|turn-on|utility release|utility approval|pressure test)|washington gas/.test(textOf(t))))
    add('MEDIUM','Natural-gas utility readiness is not explicitly represented',
      'Gas-main / natural-gas installation activities exist, but the XER does not clearly show utility-provider release, meter/service availability, turn-on, or an equivalent readiness milestone. Verify the utility interface and the equipment that depends on gas service.',gas.slice(0,5).map(codeOf))

  // Integrated testing — advisory unless contract profile says required.
  const hasCx=tasks.some(t=>semantic(t)==='COMMISSIONING')
  const hasElectrical=systems.includes('Electrical Distribution')
  const hasHvac=systems.includes('HVAC / Mechanical')
  const hasControls=systems.includes('Controls')
  const hasIst=tasks.some(t=>semantic(t)==='IST')
  if (hasCx && hasElectrical && hasHvac && hasControls && !hasIst)
    add('REVIEW','No explicit integrated-systems test / IST activity identified',
      'The schedule contains electrical, HVAC/controls and commissioning work, but no activity explicitly represents an integrated-systems test. This is a reviewer check, not an automatic contractual deficiency; confirm whether the commissioning plan/specification requires combined-system testing.',[])

  // Find the latest credible readiness endpoint at/before the completion target.
  let endpoint: any | null = null
  if (target) {
    const candidates=tasks.filter(t=>['ACCEPTANCE','TRAINING','IST','COMMISSIONING','TESTING','STARTUP'].includes(semantic(t)) && ms(finishOf(t))>0 && ms(finishOf(t))<=targetFinish)
    candidates.sort((a,b)=>{
      const da=Math.abs(targetFinish-ms(finishOf(a))), db=Math.abs(targetFinish-ms(finishOf(b)))
      if (da!==db) return da-db
      const fa=Math.abs(floatDays(a) ?? 999), fb=Math.abs(floatDays(b) ?? 999)
      return fa-fb
    })
    endpoint=candidates[0]||null
  }

  let criticalPath: CLDerivedPath | null = null
  let longestPath: CLDerivedPath | null = null
  if (endpoint && target) {
    const crit=greedyCredibleBacktrace(endpoint,byId,pred,18)
    const directToTarget=(succ.get(String(endpoint.task_id))||[]).some(r=>String(r.task_id)===String(target.task_id))
    criticalPath={
      title:'CL Critical Path',
      basis:'Engineering control chain selected from the submitted XER after recognizing project scope, system readiness and turnover states. Dates, durations and float remain the contractor-submitted attributes.',
      activities:[...crit,target],
      connectionToTarget: directToTarget?'SUBMITTED':'REFERENCE_GAP',
      connectionNote: directToTarget
        ? `${codeOf(endpoint)} is relationship-connected to ${codeOf(target)} in the submitted XER.`
        : `${codeOf(endpoint)} — ${nameOf(endpoint)} reaches the completion date as a credible readiness endpoint, but the submitted XER does not relationship-connect it directly to ${codeOf(target)} — ${nameOf(target)}.`,
    }
    const long=longestCredibleChain(endpoint,byId,pred,26)
    longestPath={
      title:'CL Longest Path',
      basis:'Longest credible work-state chain to the selected readiness endpoint using the submitted relationships and activity durations, constrained by the recognized nature/scope of the work. This is not a P6 CPM recalculation.',
      activities:[...long,target],
      connectionToTarget: directToTarget?'SUBMITTED':'REFERENCE_GAP',
      connectionNote: directToTarget
        ? 'The selected readiness endpoint is submitted as a predecessor to the completion target.'
        : 'Control Lens identifies a credible readiness chain that should be reviewed against the completion milestone because the submitted logic does not close the chain into that target.',
    }
  }

  return {
    understanding:{projectNature,deliveryNature,areas,systems,completionTarget:target?{id:String(target.task_id),code:codeOf(target),name:nameOf(target),finish:finishOf(target)}:undefined},
    findings,
    criticalPath,
    longestPath,
  }
}
