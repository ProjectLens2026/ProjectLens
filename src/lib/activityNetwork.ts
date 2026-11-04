// Pure relationship traversal; no date calculation or critical ranking.
export function exploreActivity(root:string,tasks:Record<string,any>,links:any[],direction:string,depth=0) {
 const ids=new Set<string>(tasks[root]?[root]:[]),edges=new Set<number>()
 function walk(back:boolean) {
  const adj:Record<string,{id:string;i:number}[]>={}
  links.forEach((r,i)=>{const k=back?r.task_id:r.pred_task_id,id=back?r.pred_task_id:r.task_id;if(k&&id)(adj[k]||=[]).push({id,i})})
  const seen=new Set([root]),queue=[{id:root,d:0}]
  for(let i=0;i<queue.length;i++){const n=queue[i];if(depth&&n.d>=depth)continue
   for(const e of adj[n.id]||[]){edges.add(e.i);if(!tasks[e.id]||seen.has(e.id))continue;seen.add(e.id);ids.add(e.id);queue.push({id:e.id,d:n.d+1})}
  }
 }
 if(tasks[root]){if(direction!=='succ')walk(true);if(direction!=='pred')walk(false)}
 const relationships=Array.from(edges).sort((a,b)=>a-b).map(i=>links[i])
 return {tasks:Array.from(ids).map(id=>tasks[id]),relationships,unresolved:relationships.filter(r=>!tasks[r.task_id]||!tasks[r.pred_task_id]).length}
}
export function upstreamPaths(root:string,tasks:Record<string,any>,links:any[]) {
 const adj:Record<string,string[]>={};links.forEach(r=>{if(r.task_id&&r.pred_task_id)(adj[r.task_id]||=[]).push(r.pred_task_id)})
 const stack:{ids:string[];boundary?:string}[]=tasks[root]?[{ids:[root]}]:[],paths:{ids:string[];boundary:string}[]=[]
 let steps=0
 while(stack.length&&paths.length<20&&steps++<20000){const p=stack.pop()!,id=p.ids[0]
  if(p.boundary||!adj[id]?.length||p.ids.length>=250){paths.push({ids:p.ids,boundary:p.boundary||(p.ids.length>=250?'Depth limit':'No recorded predecessor')});continue}
  const parents=Array.from(new Set(adj[id]));for(let i=parents.length-1;i>=0;i--){const n=parents[i];stack.push({ids:[n,...p.ids],boundary:p.ids.includes(n)?'Cycle detected':!tasks[n]?'External / unresolved endpoint':undefined})}
 }
 return {paths,truncated:stack.length>0}
}
