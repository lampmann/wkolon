import {escapeHTML as escape} from './wiki-content.js';
import {protectedDamage,rollRoutine} from './combat.js';

const input=(key,value,label,max=100000)=>`<input type="number" min="0" max="${max}" data-field="${key}" value="${value}" aria-label="${label}">`;
const percent=(current,max)=>max>0?Math.max(0,Math.min(100,current/max*100)):0;
export function statBar(kind,label,current,max,key,attrs=''){
 const name=label||{'force':'Force points','dark-side':'Dark side score'}[kind]||kind;
 return `<div class="resource-bar ${kind}-bar" ${attrs}><div class="resource-fill" style="width:${percent(current,max)}%"></div><span class="resource-label">${label?`${label} `:''}${input(key,current,name,kind==='xp'?1000000000:kind==='force'?1000:kind==='dark-side'?max:100000)}<span>/</span><span>${max.toLocaleString()}</span></span></div>`;
}
export function healthBars(c,d){
 const p=c.protection;
 return `<div class="hp-bars"><div class="resource-bar sr-bar"><div class="resource-fill" style="width:${percent(p.sr,p.srMax)}%"></div><span class="resource-label"><abbr title="Shield Rating">SR</abbr> ${input('protection.sr',p.sr,'Current SR',p.srMax)}<span>/</span>${input('protection.srMax',p.srMax,'Maximum SR')}</span></div><div class="resource-bar dr-bar"><div class="resource-fill" style="width:${percent(p.dr,d.hp)}%"></div><span class="resource-label"><abbr title="Damage Reduction">DR</abbr> ${input('protection.dr',p.dr,'Damage reduction')}</span></div><div class="hp-bar"><div class="hp-fill" style="width:${percent(c.currentHP??d.hp,d.hp)}%"></div><span class="hp-bar-text"><input id="hp-cur" aria-label="Current HP" type="number" min="0" max="100000" data-field="currentHP" value="${c.currentHP??d.hp}"><span class="hp-slash">/</span><span class="derived">${d.hp}</span></span></div></div><details id="hp-damage-controls"><summary>Damage</summary><form id="apply-damage" class="actions"><input type="number" min="0" max="1000000000" value="0" aria-label="Incoming damage" data-incoming-damage><label><input type="checkbox" data-ignore-dr>Ignore DR</label><button type="submit">Apply</button></form><label>DR exceptions <input data-field="protection.drBypass" value="${escape(p.drBypass)}" maxlength="2000"></label><div class="hint"><a href="https://swse.miraheze.org/wiki/Damage_Reduction" target="_blank" rel="noopener">DR</a> · <a href="https://swse.miraheze.org/wiki/Shield_Rating" target="_blank" rel="noopener">SR</a></div></details>`;
}
export function xpBar(c,d,rules){
 const floor=d.level*(d.level-1)/2*rules.xpStep,next=d.nextXP;
 const fill=next===null?100:percent(c.xp-floor,next-floor);
 return `<div class="resource-bar xp-bar"><div class="resource-fill" style="width:${fill}%"></div><span class="resource-label">XP ${input('xp',c.xp,'Experience points',1000000000)}${next===null?'':`<span>/</span><span>${next.toLocaleString()}</span>`}</span></div>`;
}
export function createCombatControls(pack,{current,derived,changed,save,log,error}){
 const choices=(selected)=>{
  const attacks=derived().attacks;
  return `${attacks.some(a=>a.uid===selected)?'':`<option value="${selected||''}" selected>${selected?'Attack unavailable':'Choose attack'}</option>`}${attacks.map(a=>`<option value="${a.uid}" ${a.uid===selected?'selected':''}>${escape(a.name)}</option>`).join('')}`;
 };
 function renderRoutines(){
  const c=current(),d=derived();
  return `<div id="routines-list">${c.routines.map(r=>`<fieldset data-routine="${r.id}"><legend><input data-routine-field="name" data-routine="${r.id}" value="${escape(r.name)}" maxlength="200" aria-label="Routine name"><button data-combat="run" data-routine="${r.id}" ${!r.steps.length||d.incapacitated||r.steps.some(s=>!d.attacks.some(a=>a.uid===s.attackId))?'disabled':''}>▶ Run</button><button data-combat="delete-routine" data-routine="${r.id}" aria-label="Delete routine">×</button></legend>${r.steps.map((s,i)=>`<div class="routine-step" data-routine="${r.id}" data-step-id="${s.id}"><div class="actions"><input type="number" min="1" max="20" value="${s.count}" data-routine-field="count" aria-label="Attack count">× <select data-routine-field="attackId" aria-label="Routine attack">${choices(s.attackId)}</select><button data-combat="move-up" aria-label="Move attack up" ${i===0?'disabled':''}>↑</button><button data-combat="move-down" aria-label="Move attack down" ${i===r.steps.length-1?'disabled':''}>↓</button><button data-combat="delete-step" aria-label="Remove attack">×</button></div><details id="routine-modifiers-${s.id}"><summary>Modifiers</summary><div class="actions"><label>Attack <input type="number" min="-1000" max="1000" value="${s.attackMod}" data-routine-field="attackMod" aria-label="Routine attack modifier"></label><label>Damage <input type="number" min="-1000" max="1000" value="${s.damageMod}" data-routine-field="damageMod" aria-label="Routine damage modifier"></label></div></details></div>`).join('')}<button data-combat="add-step" data-routine="${r.id}" ${!d.attacks.length||r.steps.length>=50||r.steps.reduce((n,s)=>n+s.count,0)>=100?'disabled':''}>+ Attack</button></fieldset>`).join('')}</div><button data-combat="add-routine" ${c.routines.length>=20?'disabled':''}>+ Routine</button>`;
 }
 function edit(el){
  if(!el.dataset.routineField)return false;
  const r=current().routines.find(r=>r.id===el.closest('[data-routine]').dataset.routine);
  if(!r)return true;
  const key=el.dataset.routineField;
  if(key==='name'){r.name=el.value;save();return true;}
  const step=r.steps.find(s=>s.id===el.closest('[data-step-id]')?.dataset.stepId);if(!step)return true;
  const value=key==='attackId'?el.value:Number(el.value);
  if(key!=='attackId'&&(!Number.isInteger(value)||value<Number(el.min)||value>Number(el.max))){error('Enter a valid modifier or count');changed();return true;}
  if(key==='count'&&r.steps.reduce((n,s)=>n+(s===step?value:s.count),0)>100){error('Maximum 100 attacks per routine');changed();return true;}
  step[key]=value;changed();return true;
 }
 return {renderRoutines,
  input(event){if(event.target.dataset.routineField==='name')return edit(event.target);if(event.target.dataset.field==='protection.drBypass'){current().protection.drBypass=event.target.value;save();return true;}return false;},
  change:edit,
  click(el){
   const action=el?.dataset.combat;if(!action)return false;
   const c=current(),r=c.routines.find(r=>r.id===el.closest('[data-routine]')?.dataset.routine);
   const stepIndex=r?.steps.findIndex(s=>s.id===el.closest('[data-step-id]')?.dataset.stepId);
   if(action==='add-routine'){if(c.routines.length>=20)return true;c.routines.push({id:crypto.randomUUID(),name:'',steps:[]});}
   else if(!r)return true;
   else if(action==='run'){if(derived().incapacitated)return true;try{const result=rollRoutine(r,derived().attacks,pack.rules.combat);log('roll',result.text,result.html);}catch(e){error(e.message);}return true;}
   else if(action==='delete-routine')c.routines.splice(c.routines.indexOf(r),1);
   else if(action==='add-step'){if(!derived().attacks.length||r.steps.length>=50||r.steps.reduce((n,s)=>n+s.count,0)>=100)return true;r.steps.push({id:crypto.randomUUID(),attackId:derived().attacks[0].uid,count:1,attackMod:0,damageMod:0});}
   else if(action==='delete-step')r.steps.splice(stepIndex,1);
   else if(action==='move-up'||action==='move-down'){const next=stepIndex+(action==='move-up'?-1:1);if(stepIndex<0||next<0||next>=r.steps.length)return true;[r.steps[stepIndex],r.steps[next]]=[r.steps[next],r.steps[stepIndex]];}
   changed();return true;
  },
  damage(form){
   const el=form.querySelector('[data-incoming-damage]'),amount=Number(el.value);
   try{
    const c=current(),d=derived(),before=c.protection.sr;
    const result=protectedDamage(c.protection,amount,pack.rules.combat,form.querySelector('[data-ignore-dr]').checked);
    c.currentHP=Math.max(0,(c.currentHP??d.hp)-result.hpDamage);c.protection.sr=result.srAfter;
    log('hp',`Damage ${amount}: SR −${result.srBlocked}, DR −${result.drBlocked}; HP −${result.hpDamage}${before!==result.srAfter?`; SR ${before} → ${result.srAfter}`:''}`);changed();
   }catch(e){error(e.message);}
  }
 };
}
