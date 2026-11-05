export function ganttScale(min:number,max:number,scale:string) {
 const day=86400000,span=Math.max(day,max-min)
 const pixels=scale==='day'?80:scale==='week'?12:scale==='month'?3:1
 const width=scale==='fit'?420:Math.max(420,Math.min(60000,span/day*pixels))
 const ticks:{time:number;label:string}[]=[]
 const date=(n:number)=>new Date(n).toISOString().slice(0,10)
 if(scale==='fit')for(let i=0;i<5;i++)ticks.push({time:min+span*i/4,label:date(min+span*i/4)})
 else if(scale==='day'||scale==='week') {
  const step=Math.max(scale==='day'?1:7,Math.ceil(span/day/500))*day
  for(let t=min;t<=min+span;t+=step)ticks.push({time:t,label:date(t)})
 }else {
  const d=new Date(min);d.setUTCDate(1);d.setUTCHours(0,0,0,0)
  if(scale==='quarter')d.setUTCMonth(Math.floor(d.getUTCMonth()/3)*3)
  while(d.getTime()<=min+span&&ticks.length<500){if(d.getTime()>=min)ticks.push({time:d.getTime(),label:scale==='quarter'?`Q${Math.floor(d.getUTCMonth()/3)+1} ${d.getUTCFullYear()}`:d.toLocaleDateString('en-US',{month:'short',year:'numeric',timeZone:'UTC'})});d.setUTCMonth(d.getUTCMonth()+(scale==='quarter'?3:1))}
 }
 return {width,span,ticks}
}
