const assert=require('assert/strict');const {loader}=require('./report-test-tools.cjs');
const r=loader()('src/lib/reportRichText.ts');
const original=[{align:'center',runs:[{text:'First\t  paragraph',bold:true,color:'#ff0000'}]},{list:'bullet',align:'right',runs:[{text:'Second\u00a0  item',italic:true}]}];
const tidy=r.tidyRichPaste(original);assert.equal(tidy[0].align,'left');assert.equal(tidy[0].runs[0].text,'First paragraph');assert.equal(tidy[0].runs[0].bold,true);assert.equal(tidy[0].runs[0].color,'#ff0000');assert.equal(tidy[1].list,'bullet');assert.equal(tidy[1].runs[0].italic,true);assert.equal(original[0].align,'center');assert.equal(tidy.length,2);
class E{constructor(tag,childNodes=[],style={}){this.nodeType=1;this.tagName=tag;this.childNodes=childNodes;this.style={fontWeight:'',fontStyle:'',textDecoration:'',color:'',fontSize:'',textAlign:'',...style}}getAttribute(){return null}}
const t=textContent=>({nodeType:3,textContent});const parser=loader({}, {HTMLElement:E})('src/lib/reportRichText.ts');
const imported=parser.readRich(new E('DIV',[t('\n '),new E('OL',[new E('LI',[new E('DIV',[t('First')])]),t('\n'),new E('LI',[new E('P',[t('Second')])])]),t('\n')]));
assert.equal(imported.length,2);assert.equal(imported[0].list,'number');assert.equal(imported[1].list,'number');assert.equal(parser.richPlain(imported),'First\nSecond');
console.log('PASS: pasted alignment/spacing, original preservation, rich emphasis, paragraph boundaries and nested list roundtrip.');

const wrapped=r.tidyRichPaste([{runs:[{text:'The\nbaseline is a starting point.\nIts float is healthy.\n\nThe\nelectrical scope needs review.',bold:true}]}]);
assert.equal(wrapped.length,2);assert.equal(wrapped[0].runs[0].text,'The baseline is a starting point. Its float is healthy.');assert.equal(wrapped[1].runs[0].text,'The electrical scope needs review.');assert.equal(wrapped[1].runs[0].bold,true);
console.log('PASS: copied soft line breaks reflow while blank-line paragraph boundaries survive.');
