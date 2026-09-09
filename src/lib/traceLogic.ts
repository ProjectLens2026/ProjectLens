// =============================================================================
// src/lib/traceLogic.ts  (Day 15 — Trace Logic)
// =============================================================================
// P6-style "Trace Logic": given any activity, walk its predecessor chain
// backward and its successor chain forward through the relationship network,
// so a PM can click a milestone and see the entire logical thread that feeds
// it (and everything it drives) — no manual filtering.
//
// Reads two fields the analyzer now persists on version.analysis:
//   - traceRelationships: Relationship[]           (the edge list)
//   - traceTasks: Record<task_id, TraceTask>        (lightweight node lookup)
//
// The walk is breadth-first with a visited-set (cycle protection — real
// schedules shouldn't loop, but out-of-sequence/bad data can create apparent
// cycles) and a hard node cap so a completion milestone doesn't try to pull
// in the whole schedule at once.
// =============================================================================

import type { Relationship, TraceTask } from './xerParser'

export interface TraceNode {
  task: TraceTask
  depth: number          // 1 = immediate neighbor of root, 2 = one hop further, …
  relType: string        // raw P6 code (PR_FS/PR_SS/PR_FF/PR_SF) of the edge toward root
  relTypeLabel: string   // friendly FS/SS/FF/SF
  lagDays: number        // relationship lag in days (hours ÷ 8, rounded)
}

export interface TraceResult {
  root: TraceTask | null
  predecessors: TraceNode[]   // ordered farthest-back → nearest (reads top-down into root)
  successors: TraceNode[]     // ordered nearest → farthest
  predCount: number
  succCount: number
  truncated: boolean          // true if the node cap was hit
}

export type TraceDirection = 'both' | 'pred' | 'succ'

const MAX_NODES = 500        // safety cap per direction

function relLabel(t: string): string {
  switch (t) {
    case 'PR_FS': return 'FS'
    case 'PR_SS': return 'SS'
    case 'PR_FF': return 'FF'
    case 'PR_SF': return 'SF'
    default: return (t || '').replace(/^PR_/, '') || '—'
  }
}

function lagToDays(hr: string): number {
  const h = parseFloat(hr || '0')
  if (isNaN(h)) return 0
  return Math.round(h / 8)
}

/**
 * Walk the relationship network from a root activity.
 *
 * @param rootId         task_id to trace from
 * @param relationships  the full edge list (analysis.traceRelationships)
 * @param tasks          lightweight task dict (analysis.traceTasks)
 * @param opts.direction 'both' | 'pred' | 'succ'
 * @param opts.maxDepth  0 = unlimited, otherwise stop after N hops
 */
export function traceLogic(
  rootId: string,
  relationships: Relationship[],
  tasks: Record<string, TraceTask>,
  opts: { direction: TraceDirection; maxDepth: number },
): TraceResult {
  const root = tasks[rootId] || null
  if (!root) {
    return { root: null, predecessors: [], successors: [], predCount: 0, succCount: 0, truncated: false }
  }

  // Build adjacency lists with edge metadata (type + lag), once per call.
  //   predEdges[succId] = predecessors of succId
  //   succEdges[predId] = successors of predId
  const predEdges: Record<string, { otherId: string; relType: string; lag: string }[]> = {}
  const succEdges: Record<string, { otherId: string; relType: string; lag: string }[]> = {}
  for (const r of relationships) {
    if (!r || !r.task_id || !r.pred_task_id) continue
    ;(predEdges[r.task_id] ||= []).push({ otherId: r.pred_task_id, relType: r.pred_type, lag: r.lag_hr_cnt })
    ;(succEdges[r.pred_task_id] ||= []).push({ otherId: r.task_id, relType: r.pred_type, lag: r.lag_hr_cnt })
  }

  let truncated = false

  function walk(edges: typeof predEdges): TraceNode[] {
    const out: TraceNode[] = []
    const visited = new Set<string>([rootId])
    let frontier = (edges[rootId] || []).map(e => ({
      id: e.otherId, depth: 1, relType: e.relType, lag: e.lag,
    }))

    while (frontier.length > 0) {
      const next: typeof frontier = []
      for (const node of frontier) {
        if (visited.has(node.id)) continue
        visited.add(node.id)
        const task = tasks[node.id]
        if (task) {
          out.push({
            task,
            depth: node.depth,
            relType: node.relType,
            relTypeLabel: relLabel(node.relType),
            lagDays: lagToDays(node.lag),
          })
          if (out.length >= MAX_NODES) { truncated = true; return out }
        }
        if (opts.maxDepth === 0 || node.depth < opts.maxDepth) {
          for (const e of (edges[node.id] || [])) {
            if (!visited.has(e.otherId)) {
              next.push({ id: e.otherId, depth: node.depth + 1, relType: e.relType, lag: e.lag })
            }
          }
        }
      }
      frontier = next
    }
    return out
  }

  let predecessors: TraceNode[] = []
  let successors: TraceNode[] = []
  if (opts.direction === 'both' || opts.direction === 'pred') predecessors = walk(predEdges)
  if (opts.direction === 'both' || opts.direction === 'succ') successors = walk(succEdges)

  // Predecessors read farthest-back → nearest so the list flows downward into
  // the root. Successors read nearest → farthest so it flows outward from root.
  predecessors.sort((a, b) =>
    b.depth - a.depth ||
    (a.task.early_start_date || a.task.target_start_date || '').localeCompare(
      b.task.early_start_date || b.task.target_start_date || ''))
  successors.sort((a, b) =>
    a.depth - b.depth ||
    (a.task.early_start_date || a.task.target_start_date || '').localeCompare(
      b.task.early_start_date || b.task.target_start_date || ''))

  return {
    root,
    predecessors,
    successors,
    predCount: predecessors.length,
    succCount: successors.length,
    truncated,
  }
}
