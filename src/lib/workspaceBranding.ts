/** Display branding only; account identity and authorization remain unchanged. */
export function workspaceDisplayName(name:string,supportAccount=false){
 return supportAccount||/^(?:control[\s-]*lens|cpmreview)\s+support$/i.test(name.trim())?'CPMreview Support':name
}
export function workspaceAccountLabel(user:{name:string;initials:string},supportAccount=false){
 const name=workspaceDisplayName(user.name,supportAccount)
 return name==='CPMreview Support'?name:`${user.initials} · ${name}`
}
