import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {evalExpr} from '../src/dice.js';
import {evalArith,commitMath} from '../src/math-fields.js';
import {validateRoster} from '../src/persistence.js';
import {newCharacter} from '../src/rules.js';

const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url),'utf8'));
test('copied dice evaluator preserves keep/drop and arithmetic while rejecting incomplete input',()=>{
  const roll=evalExpr('4d1kh3+2');
  assert.equal(roll.value,5);
  assert.equal(roll.terms[0].dice.filter(d=>d.dropped).length,1);
  assert.equal(evalExpr('2 * (1d1+3)').value,8);
  assert.equal(evalExpr('3d1kl2').value,2);
  for(const expr of ['1d20 garbage','1d20+','(1d20','1d20)','1d0','501d6','1d10001','4d6kh5','1d6++2','alert(1)','2(3)',''])assert.throws(()=>evalExpr(expr),expr);
});
test('math fields adjust relative to the last value, clamp bounds and reject code',()=>{
  const attributes=new Set();
  const el={value:'-3',dataset:{prev:'20',min:'0',max:'30'},hasAttribute:name=>attributes.has(name)};
  commitMath(el);assert.equal(el.value,'17');
  el.value='20+5';commitMath(el);assert.equal(el.value,'25');
  el.value='+100';commitMath(el);assert.equal(el.value,'30');
  el.value='globalThis.process.exit()';commitMath(el);assert.equal(el.value,'30');
  assert.equal(evalArith('6*(2+3)'),30);
  assert.equal(evalArith('globalThis'),null);
});
test('roster accepts older characters, validates log content and limits per-character history',()=>{
  const c=newCharacter(pack),roster={schemaVersion:1,activeId:c.id,characters:[c]};
  assert.equal(validateRoster(roster,pack),roster);
  roster.logs={[c.id]:[{kind:'roll',text:'Pilot: 10 +7 = 17'}]};
  validateRoster(roster,pack);
  roster.logs[c.id][0].text=null;assert.throws(()=>validateRoster(roster,pack),/Invalid event log/);
  roster.logs[c.id]=Array.from({length:201},()=>({kind:'roll',text:'1'}));assert.throws(()=>validateRoster(roster,pack),/Invalid event log/);
  roster.logs={orphan:[]};assert.throws(()=>validateRoster(roster,pack),/Invalid event log/);
});
