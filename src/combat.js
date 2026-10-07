import {evalExpr,totalHtml} from './dice.js';
import {escapeHTML as escape} from './wiki-content.js';

const uuid=id=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
const integer=(n,min,max)=>Number.isInteger(n)&&n>=min&&n<=max;
export const emptyProtection=()=>({dr:0,drBypass:'',sr:0,srMax:0});
export function prepareCombatState(c){
 c.protection??=emptyProtection();c.routines??=[];c.xp??=0;c.darkSideScore??=0;
 for(const item of c.inventory)item.uid??=crypto.randomUUID();
 return c;
}
export function validateCombatState(c,bad){
 for(const key of ['xp','darkSideScore'])if(c[key]!==undefined&&!integer(c[key],0,1000000000))bad(key);
 const uids=c.inventory.filter(i=>i.uid!==undefined).map(i=>i.uid);
 if(uids.some(id=>!uuid(id))||new Set(uids).size!==uids.length)bad('inventory IDs');
 if(c.protection!==undefined){
  const p=c.protection;
  if(!p||typeof p!=='object'||Array.isArray(p)||Object.keys(p).some(k=>!['dr','drBypass','sr','srMax'].includes(k))||!['dr','sr','srMax'].every(k=>integer(p[k],0,100000))||p.sr>p.srMax||typeof p.drBypass!=='string'||p.drBypass.length>2000)bad('DR or SR');
 }
 if(c.routines===undefined)return;
 if(!Array.isArray(c.routines)||c.routines.length>20)bad('routines');
 const ids=new Set();
 for(const r of c.routines){
  if(!r||Object.keys(r).some(k=>!['id','name','steps'].includes(k))||!uuid(r.id)||ids.has(r.id)||typeof r.name!=='string'||r.name.length>200||!Array.isArray(r.steps)||r.steps.length>50)bad('routine');
  ids.add(r.id);let count=0;
  for(const s of r.steps){
   if(!s||Object.keys(s).some(k=>!['id','attackId','count','attackMod','damageMod'].includes(k))||!uuid(s.id)||ids.has(s.id)||!uuid(s.attackId)||!integer(s.count,1,20)||!integer(s.attackMod,-1000,1000)||!integer(s.damageMod,-1000,1000))bad('routine step');
   ids.add(s.id);count+=s.count;
  }
  if(count>100)bad('maximum 100 attacks per routine');
 }
}
export function protectedDamage(protection,amount,rules,ignoreDR=false){
 if(!integer(amount,0,1000000000))throw new Error('Enter valid damage');
 const srBlocked=Math.min(amount,protection.sr),afterShield=amount-srBlocked;
 const drBlocked=ignoreDR?0:Math.min(afterShield,protection.dr);
 return {hpDamage:afterShield-drBlocked,srBlocked,drBlocked,srAfter:Math.max(0,protection.sr-(amount>protection.sr?rules.shieldLoss:0))};
}
export function defenseRangeRows(results){
 const critical=results.filter(r=>r.naturalHit).reduce((n,r)=>n+r.damage,0);
 const hits=results.filter(r=>!r.naturalHit&&!r.naturalMiss);
 const totals=[...new Set(hits.map(r=>r.total))].sort((a,b)=>b-a);
 if(!totals.length)return [{lo:null,hi:null,damage:critical}];
 const rows=[{lo:totals[0]+1,hi:null,damage:critical}];let damage=critical;
 totals.forEach((t,i)=>{damage+=hits.filter(r=>r.total===t).reduce((n,r)=>n+r.damage,0);rows.push({lo:totals[i+1]===undefined?null:totals[i+1]+1,hi:t,damage});});
 return rows;
}
const signed=n=>n>=0?'+'+n:String(n);
export function rollRoutine(routine,attacks,rules,roller=evalExpr){
 if(!routine.steps.length)throw new Error('Add an attack');
 const plan=routine.steps.map(s=>{const attack=attacks.find(a=>a.uid===s.attackId);if(!attack)throw new Error('Attack unavailable');return {step:s,attack};});
 if(plan.reduce((n,p)=>n+p.step.count,0)>100)throw new Error('Maximum 100 attacks per routine');
 const results=[];
 for(const {step:s,attack:a} of plan)for(let i=0;i<s.count;i++){
  const attackRoll=roller('1d20'+signed(a.attack+s.attackMod)),die=attackRoll.d20[0];
  const naturalHit=die===rules.naturalHit,naturalMiss=die===rules.naturalMiss;
  let damageRoll=null,damage=0;
  if(!naturalMiss){
   const expr=a.damageDisplay+(s.damageMod?signed(s.damageMod):'');
   damageRoll=roller(naturalHit?`(${expr})*${rules.criticalMultiplier}`:expr);
   damage=Math.max(rules.minimumDamage*(naturalHit?rules.criticalMultiplier:1),damageRoll.value);
   damageRoll={...damageRoll,value:damage};
  }
  results.push({name:a.name,total:attackRoll.value,damage,naturalHit,naturalMiss,attackRoll,damageRoll});
 }
 const rows=defenseRangeRows(results),range=r=>r.lo===null?(r.hi===null?'Any':`≤ ${r.hi}`):r.hi===null?`${r.lo}+`:r.lo===r.hi?String(r.lo):`${r.lo}–${r.hi}`;
 const details=results.map(r=>`<div><b>${escape(r.name)}</b>: ${r.attackRoll.display} = ${totalHtml(r.attackRoll)}${r.naturalMiss?' · Miss':`${r.naturalHit?' · Critical':''} | ${r.damageRoll.display} = ${totalHtml(r.damageRoll)}</div>`}`).join('');
 return {results,rows,text:`${routine.name||'Routine'}: ${rows.map(r=>`Reflex ${range(r)}: ${r.damage} damage`).join('; ')}`,
  html:`<b>${escape(routine.name||'Routine')}</b><table class="routine-result"><thead><tr><th>Reflex</th><th title="Before target DR and SR">Damage</th></tr></thead><tbody>${rows.map(r=>`<tr><td>${range(r)}</td><td>${r.damage}</td></tr>`).join('')}</tbody></table><details><summary>Rolls</summary>${details}</details>`};
}
