// Small browser-only OOXML writer for Overview exports. No server upload,
// macros, external links, dependencies or interpretation of source text as formulas.
export type ExcelCell = string | number | null | { value: number; format: 'date' | 'percent' } | { formula: string; value: number; format: 'percent' }
export interface ExcelSheet { name: string; headers: string[]; rows: ExcelCell[][]; widths?: number[]; notes: string[] }
const xml = (s: unknown) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;')
const column = (n: number): string => { let s='';for(n++;n;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s }
const declaration='<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
const ns='http://schemas.openxmlformats.org/spreadsheetml/2006/main'
function cell(value: ExcelCell, ref: string, header=false): string {
  if(value===null||value===undefined)return `<c r="${ref}"/>`
  if(typeof value==='number') { if(!Number.isFinite(value))throw Error('Non-finite Excel value'); return `<c r="${ref}" s="2"><v>${value}</v></c>` }
  if(typeof value==='object')return `<c r="${ref}" s="${value.format==='percent'?3:4}">${'formula'in value?`<f>${xml(value.formula)}</f>`:''}<v>${value.value}</v></c>`
  if(value.length>32767)throw Error('An exported text cell exceeds Excel’s 32,767-character limit.')
  return `<c r="${ref}" t="inlineStr" s="${header?1:0}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
}
// Uncompressed ZIP entries are supported natively by Excel and avoid a runtime dependency.
function zip(files: { name: string; text: string }[]): Uint8Array {
  const encoder=new TextEncoder(),parts:Uint8Array[]=[],directory:Uint8Array[]=[]
  let offset=0,dirSize=0
  const crcTable=new Uint32Array(256)
  for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;crcTable[n]=c>>>0}
  for(const file of files){
    const name=encoder.encode(file.name),data=encoder.encode(file.text);let crc=0xffffffff
    for(let i=0;i<data.length;i++)crc=crcTable[(crc^data[i])&255]^(crc>>>8)
    crc=(crc^0xffffffff)>>>0
    if(offset+data.length>200*1024*1024)throw Error('Export exceeds 200 MB. Export selected items instead.')
    const local=new Uint8Array(30+name.length),l=new DataView(local.buffer)
    l.setUint32(0,0x04034b50,true);l.setUint16(4,20,true);l.setUint16(6,0x800,true);l.setUint16(12,33,true)
    l.setUint32(14,crc,true);l.setUint32(18,data.length,true);l.setUint32(22,data.length,true);l.setUint16(26,name.length,true);local.set(name,30)
    const central=new Uint8Array(46+name.length),c=new DataView(central.buffer)
    c.setUint32(0,0x02014b50,true);c.setUint16(4,20,true);c.setUint16(6,20,true);c.setUint16(8,0x800,true);c.setUint16(14,33,true)
    c.setUint32(16,crc,true);c.setUint32(20,data.length,true);c.setUint32(24,data.length,true);c.setUint16(28,name.length,true);c.setUint32(42,offset,true);central.set(name,46)
    parts.push(local,data);directory.push(central);offset+=local.length+data.length;dirSize+=central.length
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer)
  e.setUint32(0,0x06054b50,true);e.setUint16(8,files.length,true);e.setUint16(10,files.length,true);e.setUint32(12,dirSize,true);e.setUint32(16,offset,true)
  const result=new Uint8Array(offset+dirSize+22);let pos=0
  for(const part of parts.concat(directory,[end])){result.set(part,pos);pos+=part.length}
  return result
}
export function createOverviewXlsx(sheets: ExcelSheet[]): Uint8Array {
  if(!sheets.length)throw Error('Select at least one section or item to export.')
  const names=new Set<string>()
  for(const s of sheets){if(!s.name||s.name.length>31||/[\\/?*\[\]:]/.test(s.name)||names.has(s.name.toLowerCase()))throw Error('Invalid worksheet name');names.add(s.name.toLowerCase())}
  const files:{name:string;text:string}[]=[]
  files.push({name:'[Content_Types].xml',text:declaration+`<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`})
  files.push({name:'_rels/.rels',text:declaration+'<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'})
  files.push({name:'xl/workbook.xml',text:declaration+`<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s,i)=>`<sheet name="${xml(s.name)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`})
  files.push({name:'xl/_rels/workbook.xml.rels',text:declaration+`<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`})
  files.push({name:'xl/styles.xml',text:declaration+`<styleSheet xmlns="${ns}"><numFmts count="1"><numFmt numFmtId="164" formatCode="mm/dd/yyyy"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/><color rgb="FF172B4D"/></font><font><b/><sz val="11"/><name val="Calibri"/><color rgb="FFFFFFFF"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF16345C"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`})
  sheets.forEach((sheet,index)=>{
    // Header is always row 1, so filtering/sorting never includes metadata notes.
    const last=sheet.rows.length+1,end=column(sheet.headers.length-1)
    if(last+sheet.notes.length+2>1048576)throw Error('Too many rows for Excel. Export selected items instead.')
    const rows=[sheet.headers as ExcelCell[],...sheet.rows]
    const body=rows.map((row,i)=>{
      const lines=Math.max(1,...row.map((v,j)=>typeof v==='string'?Math.ceil(v.length/Math.max(12,(sheet.widths?.[j]||24)-2)):1))
      const height=i===0?32:Math.min(300,Math.max(22,lines*15))
      return `<row r="${i+1}" ht="${height}" customHeight="1">${row.map((v,j)=>cell(v,`${column(j)}${i+1}`,i===0)).join('')}</row>`
    }).join('')
    const notes=sheet.notes.map((n,i)=>`<row r="${last+2+i}" ht="45" customHeight="1">${cell(n,`A${last+2+i}`)}</row>`).join('')
    const merges=sheet.notes.length?`<mergeCells count="${sheet.notes.length}">${sheet.notes.map((_,i)=>`<mergeCell ref="A${last+2+i}:${column(Math.min(sheet.headers.length-1,7))}${last+2+i}"/>`).join('')}</mergeCells>`:''
    files.push({name:`xl/worksheets/sheet${index+1}.xml`,text:declaration+`<worksheet xmlns="${ns}"><dimension ref="A1:${end}${last+sheet.notes.length+2}"/><sheetViews><sheetView workbookViewId="0" showGridLines="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="22"/><cols>${sheet.headers.map((_,j)=>`<col min="${j+1}" max="${j+1}" width="${sheet.widths?.[j]||24}" customWidth="1"/>`).join('')}</cols><sheetData>${body}${notes}</sheetData><autoFilter ref="A1:${end}${last}"/>${merges}</worksheet>`})
  })
  return zip(files)
}

export function downloadOverviewXlsx(sheets:ExcelSheet[],filename:string):void {
  const bytes=createOverviewXlsx(sheets)
  const blob=new Blob([bytes as BlobPart],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})
  const url=URL.createObjectURL(blob),a=document.createElement('a')
  a.href=url;a.download=filename.replace(/[^a-zA-Z0-9._-]/g,'_');document.body.appendChild(a)
  try{a.click()}finally{a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}
}
