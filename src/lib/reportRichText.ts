export type RichRun={text:string;bold?:boolean;italic?:boolean;underline?:boolean;color?:string;size?:number}
export type RichParagraph={runs:RichRun[];align?:'left'|'center'|'right';list?:'bullet'|'number'}
export type RichText=RichParagraph[]
export const plainRich=(s:string):RichText=>s.split('\n').map(text=>({runs:[{text}]}))
export const richPlain=(doc:RichText)=>doc.map(p=>p.runs.map(r=>r.text).join('')).join('\n')
export function validateRich(doc:any):RichText{
 if(!Array.isArray(doc)||doc.length>4000)throw Error('Invalid formatted text.')
 let length=0;for(const p of doc){if(!p||!Array.isArray(p.runs)||p.runs.length>10000||p.align&&!['left','center','right'].includes(p.align)||p.list&&!['bullet','number'].includes(p.list))throw Error('Invalid paragraph.');for(const r of p.runs){if(!r||typeof r.text!=='string')throw Error('Invalid text run.');length+=r.text.length;if(r.color&&!/^#[0-9a-f]{6}$/i.test(r.color))throw Error('Invalid text color.');if(r.size!==undefined&&(!Number.isFinite(r.size)||r.size<8||r.size>36))throw Error('Invalid text size.');for(const k of ['bold','italic','underline'])if(r[k]!==undefined&&typeof r[k]!=='boolean')throw Error('Invalid text formatting.')}}if(length>100000)throw Error('Formatted text exceeds the size limit.');return doc
}
const esc=(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
export function richHtml(value:RichText){
 let output='',list:RichParagraph['list'];
 for(const p of validateRich(value)){if(list!==p.list){if(list)output+='</'+(list==='bullet'?'ul':'ol')+'>';list=p.list;if(list)output+='<'+(list==='bullet'?'ul':'ol')+'>';}
 const content=p.runs.map(r=>{const css=[r.bold?'font-weight:700':'',r.italic?'font-style:italic':'',r.underline?'text-decoration:underline':'',r.color?'color:'+r.color:'',r.size?'font-size:'+r.size+'pt':''].filter(Boolean).join(';');return '<span'+(css?' style="'+css+'"':'')+'>'+esc(r.text).replace(/\n/g,'<br>')+'</span>'}).join('');
 output+=(list?'<li>':'')+'<div style="text-align:'+(p.align||'left')+'">'+(content||'<br>')+'</div>'+(list?'</li>':'');}
 if(list)output+='</'+(list==='bullet'?'ul':'ol')+'>';return output
}
// Parse a detached, inert fragment. Only text and the explicitly supported
// formatting enter the saved model; no HTML, event handlers or URLs are stored.
export function readRich(root:HTMLElement):RichText{
 const output:RichText=[];let current:RichParagraph={runs:[]};
 const flush=()=>{if(current.runs.length){output.push(current);current={runs:[]}}}
 const color=(s:string)=>{if(/^#[a-f0-9]{6}$/i.test(s))return s;const m=s.match(/^rgb\(\s*(\d+),\s*(\d+),\s*(\d+)\s*\)$/);return m?'#'+m.slice(1).map(n=>Math.min(255,Number(n)).toString(16).padStart(2,'0')).join(''):undefined}
 function walk(node:Node,style:Omit<RichRun,'text'>={},list?:RichParagraph['list']){if(node.nodeType===3){if(node.textContent)current.runs.push({...style,text:node.textContent});return}if(!(node instanceof HTMLElement))return;const tag=node.tagName;if(['SCRIPT','STYLE','IFRAME','IMG','OBJECT','SVG','FORM','INPUT'].includes(tag))return;if(tag==='BR'){current.runs.push({text:'\n'});return}const block=['P','DIV','LI','H1','H2','H3','BLOCKQUOTE'].includes(tag);if(block){flush();current={runs:[],align:['left','center','right'].includes(node.style.textAlign)?node.style.textAlign as any:'left',...(tag==='LI'?{list:list||'bullet'}:{})}}
 const next={...style};if(['B','STRONG'].includes(tag)||Number(node.style.fontWeight)>=600||node.style.fontWeight==='bold')next.bold=true;if(['I','EM'].includes(tag)||node.style.fontStyle==='italic')next.italic=true;if(tag==='U'||node.style.textDecoration.includes('underline'))next.underline=true;const c=color(node.style.color||node.getAttribute('color')||'');if(c)next.color=c;const font=node.style.fontSize;if(font){const n=parseFloat(font)*(font.endsWith('px')?.75:1);if(n>=8&&n<=36)next.size=n}if(tag==='FONT'&&node.getAttribute('size'))next.size=({1:8,2:10,3:12,4:14,5:18,6:24,7:36} as any)[node.getAttribute('size')!]||12;
 node.childNodes.forEach(c=>walk(c,next,tag==='UL'?'bullet':tag==='OL'?'number':list));if(block)flush();}
 root.childNodes.forEach(n=>walk(n));flush();return validateRich(output.length?output:plainRich(''))
}
