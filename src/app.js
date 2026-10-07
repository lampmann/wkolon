import {ABILITIES, GROUPS, signed, indexPack, derive, progression, eligible, classSkills} from './rules.js';
import {createStore, downloadJSON} from './persistence.js';
import {commitMath} from './math-fields.js';
import {evalExpr} from './dice.js';
import {CREATOR_STEPS} from './creation-steps.js';
import {referenceEntries} from './rules-reference.js';
import {generationState, setGenerationMethod, assignScore, setPoolScore, setRolledPool} from './ability-generation.js';

const $ = id => document.getElementById(id);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const title = value => value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
const SECTIONS = [['overview','Sheet'],['creation','Builder'],['skills','Skills'],['features','Features'],['equipment','Equipment'],['advancement','Level up'],['rules','Rules']];
let section = SECTIONS.some(([key]) => key === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let pack, ix, store, derived;
const knowledgeDrafts = new Map();
let creatorStep = 0, editorMode = null, returnFocus = null;
let saveState = ['Saved', false];
let toastTimer;
let recoveryExported = false;
const status = (message, error) => { saveState = [message,error]; $('save-status').textContent = message; $('save-status').classList.toggle('error',error); };
const notify = message => { $('message').textContent = message; $('message').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('message').hidden = true, 7000); };
const current = () => store.current();
const option = (value, name, selected, disabled=false) => `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escape(name)}</option>`;
const choices = (records, selected) => [...records].sort((a,b) => a.name.localeCompare(b.name)).map(r => option(r.id, r.name, selected)).join('');
const field = (label, key, value, type='text', attrs='') => `<label>${escape(label)}<input type="${type}" data-field="${key}" value="${escape(value)}" ${attrs}></label>`;
function ruleReference(r, label=r.name, selection=null, scope='ref') {
  return `<details class="rules-ref-detail" id="${escape(scope+'-'+r.id+(selection?.choice?'-'+selection.choice:''))}"><summary aria-label="${escape(r.name)} mechanics">${escape(label)}</summary><div class="rules-ref-body"><dl>${referenceEntries(r,pack,selection).map(e=>`<dt>${escape(e.heading)}</dt><dd>${escape(e.text)}</dd>`).join('')}</dl></div></details>`;
}
const panel = (heading, body, className='') => `<section class="panel ${className}">${heading ? `<div class="panel-heading"><h2>${heading}</h2></div>` : ''}${body}</section>`;
const metric = (label, value, detail='') => `<div class="metric"><span>${label}</span><strong>${value}</strong>${detail ? `<small>${detail}</small>` : ''}</div>`;
const entryLabel = s => { const r = ix.feats.get(s.id) || ix.talents.get(s.id); return r.name + (s.choice ? ` (${ix.skills.get(s.choice)?.name || title(s.choice)})` : ''); };
function selectionValue(s) { return s ? `${s.id}|${s.choice || ''}` : ''; }
function parseSelection(value) { if (!value) return null; const [id,choice] = value.split('|'); return choice ? {id,choice} : {id}; }
function variants(r) {
  const values = r.choiceType === 'skill' ? pack.skills.map(s => s.id) : r.choiceType === 'weaponGroup' ? GROUPS : [null];
  return values.map(choice => ({id:r.id,...(choice ? {choice} : {})}));
}

// A selector is evaluated before its own grant and before later selections.
function selectorContext(levelIndex, kind, slotIndex=0) {
  const draft = clone(current());
  draft.levels = draft.levels.slice(0,levelIndex+1);
  const l = draft.levels[levelIndex];
  if (kind === 'startingFeat') { l.startingFeat = null; l.feats = []; l.talent = null; }
  if (kind === 'feat') { l.feats = l.feats.slice(0,slotIndex); l.talent = null; }
  if (kind === 'talent') l.talent = null;
  return progression(draft,pack).ctx;
}
function selectChoice(levelIndex, kind, slotIndex, slot, selected) {
  const type = kind === 'talent' ? 'talents' : 'feats';
  const l = current().levels[levelIndex], cls = ix.classes.get(l.classId);
  const ctx = selectorContext(levelIndex,kind,slotIndex);
  let records = pack[type];
  if (kind === 'talent') records = records.filter(r => cls.talentTrees.includes(r.tree));
  if (kind === 'startingFeat') records = records.filter(r => cls.startingFeats.includes(r.id));
  if (slot?.kind === 'bonus') records = records.filter(r => cls.bonusFeats.includes(r.id) || cls.startingFeats.includes(r.id));
  const available = r => variants(r).filter(s=>eligible(r,s,ctx,ix,type) && (slot?.kind !== 'bonus' || !cls.bonusRestrictions[r.id] || cls.bonusRestrictions[r.id].includes(s.choice)));
  // Some weapon/armor feats have separate rules IDs. Present their shared name once.
  const family = r => type==='feats' && /^(Weapon Proficiency|Armor Proficiency) \(/.test(r.name) ? r.name.replace(/ \(.*\)$/, '') : null;
  const groups = new Map();
  for (const r of records) {
    if (!available(r).length && r.id!==selected?.id) continue;
    const name=family(r), key=name?`family:${name}`:selectionValue({id:r.id});
    if (!groups.has(key)) groups.set(key,{value:key,name:name||r.name,records:[]});
    groups.get(key).records.push(r);
  }
  const record=selected && ix[type].get(selected.id);
  const primary=record ? (family(record)?`family:${family(record)}`:selectionValue({id:record.id})) : '';
  if (record && !groups.has(primary)) groups.set(primary,{value:primary,name:family(record)||record.name,records:[record]});
  const items=[...groups.values()].sort((a,b)=>a.name.localeCompare(b.name));
  const group=groups.get(primary), secondary=group && (group.value.startsWith('family:') || record.choiceType);
  const label = kind === 'talent' ? 'Talent' : kind === 'startingFeat' ? 'Starting feat' : slot.label;
  const attrs=`data-choice="${kind}" data-level="${levelIndex}" data-slot="${slotIndex}"`;
  let secondaryHTML='';
  if (secondary) {
    const options=group.records.flatMap(r=>available(r).map(s=>({value:selectionValue(s),name:group.value.startsWith('family:')?r.name.match(/\((.*)\)$/)[1]:(ix.skills.get(s.choice)?.name||title(s.choice))})));
    const value=!selected?.pending && (selected?.choice || group.value.startsWith('family:')) ? selectionValue(selected) : '';
    if(value && !options.some(o=>o.value===value)) options.unshift({value,name:`${entryLabel(selected)} (ineligible)`});
    const secondaryLabel=group.value.startsWith('family:')?'Type':record.choiceType==='skill'?'Skill':'Weapon group';
    secondaryHTML=`<label>${secondaryLabel}<select ${attrs} data-secondary>${option('','Choose…',value)}${options.sort((a,b)=>a.name.localeCompare(b.name)).map(o=>option(o.value,o.name,value)).join('')}</select></label>`;
  }
  return `<div class="choice-field"><label>${escape(label)}<select ${attrs} data-primary>${option('',kind==='startingFeat'&&!items.length?'No eligible starting feats':'Choose…',primary)}${items.map(o=>option(o.value,o.name,primary)).join('')}</select></label>${secondaryHTML}${record ? ruleReference(record,'ⓘ',selected,`choice-${levelIndex}-${kind}-${slotIndex}`) : ''}</div>`;

}
function levelEditor(i) {
  const l = current().levels[i], row = derived.rows[i], cls = row.cls;
  return `<div class="level-editor">${i ? `<div class="form-grid">${field(`HP roll (d${cls.hitDie})`,'hpRoll',l.hpRoll,'number',`min="1" max="${cls.hitDie}" data-level="${i}"`)}</div>` : ''}
    ${pack.rules.abilityLevels.includes(i+1) ? `<div class="form-grid">${[0,1].map(j => `<label>Ability increase ${j+1}<select data-increase="${j}" data-level="${i}">${option('','Choose…',l.abilityIncreases[j] || '')}${ABILITIES.map(a => option(a,a.toUpperCase(),l.abilityIncreases[j])).join('')}</select></label>`).join('')}</div>` : ''}
    ${i && row.classLevel === 1 ? selectChoice(i,'startingFeat',0,null,l.startingFeat) : ''}
    <div class="form-grid">${row.slots.map((slot,j) => selectChoice(i,'feat',j,slot,l.feats[j])).join('')}${row.classLevel % 2 ? selectChoice(i,'talent',0,null,l.talent) : ''}</div>
    ${trainingAfterIncrease(i)}
  </div>`;
}
function trainingList(scope) {return scope==='initial'?current().trainedSkills:current().levels[Number(scope)].trainedSkills;}
function replaceTraining(scope, skills) {if(scope==='initial')current().trainedSkills=skills;else current().levels[Number(scope)].trainedSkills=skills;}
function knowledgeKey(scope) {return current().id+':'+scope;}
function skillPicks(records, chosen, scope='initial') {
  const knowledge=records.filter(r=>r.id.startsWith('skill:knowledge-'));
  const selected=chosen.filter(id=>id.startsWith('skill:knowledge-'));
  const pending=knowledgeDrafts.get(knowledgeKey(scope))||0;
  let knowledgeShown=false;
  const picks=records.map(r=>{
    if(r.id.startsWith('skill:knowledge-')) {
      if(knowledgeShown)return '';knowledgeShown=true;
      const slots=[...selected,...Array(pending).fill('')];
      return `<div class="knowledge-pick"><label><input type="checkbox" data-knowledge-group="${scope}" ${slots.length?'checked':''}>Knowledge</label>${slots.length?`<div class="knowledge-fields">${slots.map((id,i)=>`<div class="knowledge-field"><select aria-label="Knowledge field ${i+1}" data-knowledge-field="${scope}" data-previous-knowledge="${escape(id)}">${option('','Choose Knowledge Field',id)}${knowledge.map(r=>option(r.id,r.name.replace(/^Knowledge \((.*)\)$/, '$1'),id,selected.includes(r.id)&&r.id!==id)).join('')}</select><button type="button" data-remove-knowledge="${scope}" data-knowledge-id="${escape(id)}" aria-label="Remove Knowledge field ${i+1}" title="Remove Knowledge field ${i+1}">×</button></div>`).join('')}${slots.length<knowledge.length?`<button type="button" data-add-knowledge="${scope}" aria-label="Add Knowledge field">+</button>`:''}</div>`:''}</div>`;
    }
    const attrs=scope==='initial'?`data-trained="${r.id}"`:`data-extra-skill="${r.id}" data-level="${scope}"`;
    return `<label><input type="checkbox" ${attrs} ${chosen.includes(r.id)?'checked':''}>${escape(r.name)}</label>`;
  }).join('');
  return `<div class="skill-picks">${picks}</div>`;
}
function trainingAfterIncrease(i) {
  const before = i ? progression(current(),pack,i).ctx.scores.int : derived.rows[0].scores.int;
  const amount = Math.max(0,Math.floor((derived.rows[i].scores.int-10)/2)-Math.floor((before-10)/2));
  if (!amount) return '';
  const ctx = derived.rows[i].ctx;
  return `<fieldset><legend>Train ${amount} skill${amount===1?'':'s'}</legend>${skillPicks(pack.skills.filter(s=>classSkills(ctx,ix).has(s.id)||current().levels[i].trainedSkills.includes(s.id)),current().levels[i].trainedSkills,String(i))}</fieldset>`;
}
function abilityPool(state, used=false) {
  const assigned=new Set(Object.values(state.assign).filter(i=>i!==null));
  return `<div class="ability-pool">${state.pool.map((n,i)=>`<span class="cr-pool${used && assigned.has(i)?' used':''}">${n}</span>`).join(' ')}</div>`;
}
function generateAbilities() {
  const c=current(), state=generationState(c,pack);
  const methods=[['standard','Standard array'],['point-buy','Point buy'],['rolled','Roll 4d6 drop lowest'],['manual','Enter manually']];
  const controls=`<div class="actions">${methods.map(([method,label])=>`<button type="button" class="cr-method${method===c.abilityMethod?' active':''}" data-crmethod="${method}" aria-pressed="${method===c.abilityMethod}">${label}</button>`).join('')}</div>`;
  if(c.abilityMethod==='standard')return controls;
  if(c.abilityMethod==='rolled')return controls+'<button type="button" data-action="roll-abilities">Roll</button>';
  const budget=c.abilityMethod==='point-buy'?`<div class="actions">${field('Budget','pointBudget',c.pointBudget,'number','min="0" max="100"')}<span class="budget ${derived.pointCost>c.pointBudget?'error':''}">${Number.isFinite(derived.pointCost)?derived.pointCost:'Invalid'} / ${c.pointBudget} points</span></div>`:'';
  return controls+budget+`<table class="cr-generated"><tbody>${state.pool.map((n,i)=>`<tr><td>${i+1}</td><td>${c.abilityMethod==='point-buy'?`<select class="cr-points" aria-label="Score ${i+1}" data-generation-pool="${i}">${Object.entries(pack.rules.pointBuyCosts).map(([value,cost])=>option(value,`${value} (${cost} pt)`,n)).join('')}</select>`:`<input type="number" class="tiny cr-manual" aria-label="Score ${i+1}" data-generation-manual="${i}" min="3" max="30" required value="${n}">`}</td></tr>`).join('')}</tbody></table>`;
}
function abilityCards() {
  const c=current(), state=generationState(c,pack);
  const rows=ABILITIES.map(a=>{
    const taken=new Set(Object.entries(state.assign).filter(([key,i])=>key!==a && i!==null).map(([,i])=>i));
    const control=`<select class="cr-assign" aria-label="Base ${a.toUpperCase()}" data-generation-assign="${a}">${option('','—',state.assign[a]??'')}${state.pool.map((n,i)=>option(i,n,state.assign[a],taken.has(i))).join('')}</select>`;
    return `<tr><td>${a.toUpperCase()}</td><td>${control}</td><td>${signed(ix.species.get(c.species).abilityAdjustments[a]||0)}</td><td id="cr-final-${a}">${derived.scores[a]}</td><td id="cr-mod-${a}">${signed(derived.mods[a])}</td></tr>`;
  }).join('');
  return abilityPool(state,true)+`<table class="cr-scores"><thead><tr><th>Ability</th><th>Base</th><th>Species</th><th>Score</th><th>Mod</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function calculations(id, entries) {
  return `<details id="${id}" class="calculation-details"><summary>Calculations</summary><dl>${entries.map(([name,value])=>`<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></details>`;
}
function skillTable() {
  return `<div class="table-scroll"><table><thead><tr><th>Skill</th><th>Ability</th><th>Trained</th><th>Check</th></tr></thead><tbody>${derived.skills.map(s=>`<tr><td>${ruleReference(ix.skills.get(s.id))}</td><td>${s.ability.toUpperCase()}</td><td>${s.trained ? '✓' : '—'}</td><td><button class="roll" data-roll="${s.total}" data-roll-label="${escape(s.name)}" ${!s.available || derived.incapacitated ? 'disabled' : ''}>${s.available ? signed(s.total) : '—'}</button></td></tr>`).join('')}</tbody></table></div>${calculations('skill-calculations',derived.skills.map(s=>[s.name,s.breakdown]))}`;
}
function attackTable(scope='') {
  return derived.attacks.length ? `<div class="table-scroll"><table><thead><tr><th>Weapon</th><th>Attack</th><th>Damage</th></tr></thead><tbody>${derived.attacks.map((a,i)=>`<tr><td>${ruleReference(ix.equipment.get(a.id),a.name,null,`${scope}attack-${i}`)}<small>${escape(a.damageType)}${a.proficient?'':' | Not proficient'}</small></td><td><button class="roll" data-roll="${a.attack}" data-roll-label="${escape(a.name)} attack" ${derived.incapacitated?'disabled':''}>${signed(a.attack)}</button></td><td><button class="roll" data-damage="${escape(a.damageDisplay)}" data-roll-label="${escape(a.name)} damage">${a.damageDisplay}</button></td></tr>`).join('')}</tbody></table></div>${calculations(scope+'attack-calculations',derived.attacks.map(a=>[a.name,a.breakdown]))}` : '';
}
function conditionTrack() {
  const step=current().condition, species=ix.species.get(current().species);
  const states = [
    'Normal State (No Penalties)',
    '-1 Penalty to Defenses, Attacks, Ability Checks, and Skill Checks',
    '-2 Penalty to Defenses, Attacks, Ability Checks, and Skill Checks',
    '-5 Penalty to Defenses, Attacks, Ability Checks, and Skill Checks',
    'Move at Half Speed; -10 Penalty to Defenses, Attacks, Ability Checks, and Skill Checks',
    `Helpless (${species.isDroid ? 'Disabled' : 'Unconscious'})`,
  ];
  return `<input id="condition-level" type="hidden" data-field="condition" value="${step}"><table id="condition-effect"><tbody>${states.map((state,level)=>`<tr data-condition-step="${level}" class="${(level>0 && level<=step) || level===step?'condition-on':''} ${level===step?'condition-current':''}"><td><button type="button" data-condition-step="${level}" aria-pressed="${level===step}">${state}</button></td></tr>`).join('')}</tbody></table>`;
}
function creation() {
  const c=current(), species=ix.species.get(c.species), cls=ix.classes.get(c.levels[0].classId);
  const ctx=clone(derived.rows[0].ctx);
  if(c.levels[0].feats.some(s=>s?.id==='feat:force-sensitivity'))ctx.feats.push({id:'feat:force-sensitivity'});
  const allowed=classSkills(ctx,ix);
  const budget=Math.max(1,cls.trainedSkills+Math.floor((derived.rows[0].scores.int-10)/2))+species.bonusSkills;
  const row=derived.rows[0];
  const gear=panelParts(equipment('cr')).filter(p=>p.querySelector('.purchase-form,.inventory-list,.table-scroll'));
  gear[0].querySelector('.panel-heading')?.remove();
  const bodies=[
    generateAbilities()+abilityCards(),
    `<div class="form-grid"><label>Species<select data-field="species">${choices(pack.species,c.species)}</select></label></div>${ruleReference(species,species.name,null,'creator-species')}`,
    `<div class="form-grid"><label>Class<select data-class="0">${choices(pack.classes,cls.id)}</select></label></div>${ruleReference(cls,cls.name,null,'creator-class')}`,
    `<div class="panel-subheading"><span>${c.trainedSkills.length} / ${budget}</span></div>${skillPicks(pack.skills.filter(s=>allowed.has(s.id)||c.trainedSkills.includes(s.id)),c.trainedSkills)}`,
    `<div class="form-grid">${row.slots.map((slot,j)=>selectChoice(0,'feat',j,slot,c.levels[0].feats[j])).join('')}</div>`,
    selectChoice(0,'talent',0,null,c.levels[0].talent),
    `<div class="actions">${field('Credits','credits',c.credits,'number','min="0" max="1000000000"')}<button data-action="starting-credits" ${c.credits||c.inventory.length?'disabled':''}>Roll credits</button>${cls.id==='class:jedi'?'<button data-action="jedi-lightsaber">Add lightsaber</button>':''}</div>${gear.map(p=>p.outerHTML).join('')}`,
    `<div class="form-grid">${field('Name','name',c.name,'text','maxlength="200"')}${field('Player','player',c.player,'text','maxlength="200"')}${field(`Extra languages (${languageCount()})`,'languages',c.languages)}</div><label>Notes<textarea data-field="notes" rows="6" maxlength="100000">${escape(c.notes)}</textarea></label>`
  ];
  return bodies.map((body,i)=>panel(`${i+1}. ${CREATOR_STEPS[i]}`,body)).join('');
}
function languageCount() {
  const linguists = derived.ctx.feats.filter(s=>s.id==='feat:linguist').length;
  return Math.max(0,derived.mods.int)+linguists*Math.max(1,1+derived.mods.int);
}
function featureList() {
  const species = ix.species.get(current().species);
  const features = [...derived.ctx.feats,...derived.ctx.talents].map(s=>({s,r:ix.feats.get(s.id)||ix.talents.get(s.id)}));
  return panel('Features',`<div class="feature-list">${features.map(({s,r},i)=>`<article><div>${ruleReference(r,entryLabel(s),s,`feature-${i}`)}${s.automatic?'':`<span class="badge">Level ${s.level}</span>`}</div></article>`).join('')}<article>${ruleReference(species,species.name,null,'features-species')}</article></div>`);
}
function equipment(scope='') {
  const c = current(), prefix=scope?'cr-':'';
  return `${panel('Equipment catalog',`<form id="${prefix}purchase" data-equipment-scope="${scope||'sheet'}" class="purchase-form"><label>Item<select id="${prefix}purchase-item" data-catalog-item>${['armor','gear','weapon'].map(kind=>`<optgroup label="${title(kind)}">${pack.equipment.filter(r=>r.kind===kind).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>option(r.id,`${r.name} | ${r.cost.toLocaleString()} cr | ${r.weight} kg`)).join('')}</optgroup>`).join('')}</select></label><label>Quantity<input id="${prefix}purchase-quantity" data-catalog-quantity type="number" min="1" max="999" value="1" required></label><button class="primary" type="submit">Buy</button><button type="button" data-action="add-gear">Add owned</button></form><div id="${prefix}equipment-reference">${ruleReference(pack.equipment.find(r=>r.kind==='armor'),'ⓘ',null,prefix+'catalog')}</div><div class="actions">${scope?'':field('Credits','credits',c.credits,'number','min="0" max="1000000000"')}<div class="weight"><strong>${derived.weight.toFixed(1)} kg</strong></div></div>`)}
    ${panel('Inventory',c.inventory.length?`<div class="inventory-list">${c.inventory.map((e,i)=>{const r=ix.equipment.get(e.id);return `<article><div class="inventory-title"><div>${ruleReference(r,r.name,null,`${prefix}inventory-${i}`)} <span class="badge">×${e.quantity}</span><small>${r.weight*e.quantity} kg | ${r.cost.toLocaleString()} cr each</small></div></div><div class="inventory-controls">${r.kind!=='gear'?`<label class="checkbox"><input type="checkbox" data-inventory="equipped" data-index="${i}" ${e.equipped?'checked':''}>Equipped</label>`:''}${r.kind==='weapon'?`<label class="checkbox"><input type="checkbox" data-inventory="twoHanded" data-index="${i}" ${e.twoHanded?'checked':''} ${r.mode!=='melee'||pack.rules.weaponSizeOrder.indexOf(r.size)<pack.rules.weaponSizeOrder.indexOf(ix.species.get(c.species).size)?'disabled':''}>Two hands</label><label>Attack misc<input type="number" min="-100" max="100" value="${e.attackMod}" data-inventory="attackMod" data-index="${i}"></label><label>Damage misc<input type="number" min="-100" max="100" value="${e.damageMod}" data-inventory="damageMod" data-index="${i}"></label>`:''}<button data-remove-item="${i}">Remove</button></div>${r.kind==='armor'?`<p class="rule-summary">Reflex +${r.armorBonus} | Fortitude +${r.fortitudeBonus} with proficiency | Max DEX +${r.maxDex}</p>`:''}</article>`}).join('')}</div>`:'')}
    ${panel('Attacks',attackTable(prefix))}`;
}
function advancement() {
  const c=current();
  return `${panel('',`<div class="actions"><label>Class<select id="next-class">${choices(pack.classes,c.levels.at(-1).classId)}</select></label><button class="primary" data-action="add-level" ${c.levels.length>=20?'disabled':''}>Add level ${c.levels.length+1}</button><button data-action="undo-level" ${c.levels.length===1?'disabled':''}>Remove last level</button></div>`)}
    ${c.levels.map((l,i)=>`<section class="panel"><div class="panel-heading"><h2>Level ${i+1}</h2><span class="badge">${escape(derived.rows[i].cls.name)} ${derived.rows[i].classLevel}</span></div>${i?`<label>Class<select data-class="${i}">${choices(pack.classes,l.classId)}</select></label>`:''}${levelEditor(i)}</section>`).join('')}`;
}
function rules() {
  return `${panel('Rules catalog',`<div class="stats-grid">${['species','classes','skills','feats','talents','equipment'].map(key=>metric(title(key),pack[key].length)).join('')}</div><p>Pack ${escape(pack.id)} / ${escape(pack.version)}. This starter catalog includes a selection of core feats, talents, and equipment.</p><p>Prestige classes, droid creation, Force power selection, and additional books are not available yet. Conditional abilities appear as reminders. Use sheet and attack modifiers for circumstances and table rulings.</p><p><a href="./docs/rules-data.md">Rules-data contract</a> | <a href="./data/core.json">Download the rules pack</a></p>`)}
    ${panel('Mechanics', ['species','classes','skills','feats','talents','equipment'].map(key=>`<details><summary>${escape(title(key))}</summary>${pack[key].map(r=>ruleReference(r,r.name,null,'rules')).join('')}</details>`).join(''))}
    ${panel('Data attribution',`<p>${escape(pack.license.attribution)}</p><p>${escape(pack.license.changes)}</p><a href="${escape(pack.license.url)}" target="_blank" rel="noopener">${escape(pack.license.name)} ↗</a>`)}
    ${panel('Source revisions',`<div class="table-scroll"><table><thead><tr><th>Source</th><th>Revision</th><th>Updated</th><th>History</th></tr></thead><tbody>${pack.sources.map(s=>`<tr><td><a href="${escape(s.url)}" target="_blank" rel="noopener">${escape(s.title)}${s.section?` / ${escape(s.section)}`:''}</a></td><td>${s.revision}</td><td>${escape(s.timestamp.slice(0,10))}</td><td><a href="${escape(s.history)}" target="_blank" rel="noopener">Contributors ↗</a></td></tr>`).join('')}</tbody></table></div>`)}`;
}
function moduleHTML(key, heading, body, classes='') {
  return `<section class="module ${classes}" data-module="${key}" id="module-${key}"><h2>${heading}</h2>${body}</section>`;
}
function panelParts(html) {
  const template = document.createElement('template'); template.innerHTML = html;
  return [...template.content.children].filter(el => el.matches('.panel'));
}
function panelBody(panel) { panel.querySelector('.panel-heading')?.remove(); return panel.innerHTML; }
function sheet() {
  const c = current(), species = ix.species.get(c.species);
  const inventoryPanels = panelParts(equipment());
  const character = `<div class="character-fields">${field('Name','name',c.name,'text','maxlength="200"')}${field('Player','player',c.player,'text','maxlength="200"')}${ruleReference(species,species.name,null,'header-species')}<span>Level ${derived.level}</span><a href="#creation">Edit</a></div><div class="hint">${escape(species.languages.join(', '))}${c.languages ? ', '+escape(c.languages) : ''}</div>`;
  const classes = `<table id="class-table"><thead><tr><th>Class</th><th>Level</th><th>Hit die</th><th>Base attack</th></tr></thead><tbody>${[...derived.ctx.classLevels].map(([id,n])=>{const cls=ix.classes.get(id);return `<tr><td>${ruleReference(cls)}</td><td class="derived">${n}</td><td>d${cls.hitDie}</td><td>${signed(cls.bab[n-1])}</td></tr>`;}).join('')}</tbody></table><div class="class-summary"><span>Next level: ${derived.nextXP?.toLocaleString() ?? 'Maximum'} XP</span><a href="#advancement" class="button">Level Up</a></div>`;
  const abilities = `<table><thead><tr><th>Ability</th><th>Mod</th><th>Score</th><th>Base</th><th>Species</th></tr></thead><tbody>${ABILITIES.map(a=>`<tr><td>${a.toUpperCase()}</td><td><button class="roll" data-roll="${derived.mods[a]+pack.rules.conditionPenalties[c.condition]}" data-roll-label="${a.toUpperCase()}" aria-label="${a.toUpperCase()} check ${signed(derived.mods[a]+pack.rules.conditionPenalties[c.condition])}" ${derived.incapacitated?'disabled':''}>${signed(derived.mods[a])}</button></td><td class="derived">${derived.scores[a]}</td><td><input type="number" min="3" max="30" aria-label="Base ${a.toUpperCase()}" data-ability="${a}" value="${c.abilities[a]}"></td><td>${signed(species.abilityAdjustments[a]||0)}</td></tr>`).join('')}</tbody></table>`;
  const defenses = `<table><thead><tr><th>Defense</th><th>Total</th></tr></thead><tbody>${['reflex','fortitude','will'].map(k=>`<tr title="${escape(derived.breakdowns[k])}"><td>${title(k)}</td><td class="derived defense-total" data-defense="${k}">${derived.defenses[k]}</td></tr>`).join('')}</tbody></table><details><summary class="hint">Calculations</summary>${['reflex','fortitude','will'].map(k=>`<div class="hint">${title(k)}: ${escape(derived.breakdowns[k])}</div>`).join('')}</details>`;
  const hp = `<div class="hp-bars"><div class="hp-bar"><div class="hp-fill" style="width:${Math.min(100,Math.max(0,100*(c.currentHP ?? derived.hp)/derived.hp))}%"></div><span class="hp-bar-text"><input id="hp-cur" aria-label="Current HP" type="number" min="0" max="100000" data-field="currentHP" value="${c.currentHP ?? derived.hp}"><span class="hp-slash">/</span><span class="derived">${derived.hp}</span></span></div></div>`;

  return moduleHTML('header','Character',character,'wide') + moduleHTML('classes','Classes',classes,'wide')
    + moduleHTML('abilities','Ability Scores',abilities) + moduleHTML('defenses','Defenses',defenses)
    + moduleHTML('hp','HP',hp) + moduleHTML('threshold','Damage Threshold',`<div class="stat-big">${derived.threshold}</div>`,'small')
    + moduleHTML('bab','Base Attack',`<div class="stat-big">${signed(derived.bab)}</div>`,'small')
    + moduleHTML('speed','Speed',`<div class="stat-big">${derived.speed}</div><span class="hint">squares</span>`,'small')
    + moduleHTML('force','Force Points',field('','forcePoints',c.forcePoints,'number','min="0" max="1000" aria-label="Force points"'),'small')
    + moduleHTML('condition','Condition Track',conditionTrack()) + moduleHTML('skills','Skills',skillTable())
    + moduleHTML('attacks','Attacks',attackTable())
    + moduleHTML('inventory','Inventory',`${field('Credits','credits',c.credits,'number','min="0" max="1000000000"')}<span class="hint">${derived.weight.toFixed(1)} kg</span><details class="shop" id="equipment-catalog"><summary>Catalog</summary>${panelBody(inventoryPanels[0]).replace(/<div class="actions">[\s\S]*?<\/div>$/, '')}</details>${panelBody(inventoryPanels[1])}`)
    + moduleHTML('features','Features',`${panelBody(panelParts(featureList())[0])}<a href="#advancement" class="screen-only">Edit</a>`)
    + moduleHTML('modifiers','Modifiers',`<div class="form-grid">${Object.entries(c.modifiers).map(([key,val])=>field(title(key),`modifiers.${key}`,val,'number','min="-1000" max="1000"')).join('')}</div>`)
    + moduleHTML('notes','Notes',`<label><span class="sr-only">Character notes</span><textarea data-field="notes" rows="5">${escape(c.notes)}</textarea></label>`)
    + moduleHTML('dice','Event Log',`<div id="dicelog" role="log"></div><input id="cmd-input" placeholder="1d20+5" aria-label="Dice expression"><button data-action="clear-log">Clear</button>`);
}
function numericFields(root) {
  root.querySelectorAll('input[type=number]:not([data-generation-manual])').forEach(el=>{
    el.dataset.number='true'; el.dataset.math=''; el.dataset.prev=el.value;
    if(el.hasAttribute('min')) el.dataset.min=el.min;
    if(el.hasAttribute('max')) el.dataset.max=el.max;
    el.type='text';el.inputMode='numeric';
  });
}
function renderCreatorIssues() {
  const blocker=$('cr-blocker'), open=Boolean(blocker.querySelector('details[open]'));
  blocker.innerHTML=derived.issues.length?`<details${open?' open':''}><summary>${derived.issues.length} unresolved choice${derived.issues.length===1?'':'s'}</summary><ul>${derived.issues.map(issue=>`<li>${escape(issue)}</li>`).join('')}</ul></details>`:'';
}
function renderEditor() {
  if (!editorMode) return;
  $('cr-title').textContent = {creation:'Character Creation',advancement:'Level up',rules:'Rules'}[editorMode];
  const isCreation = editorMode === 'creation';
  $('cr-stepper').hidden = !isCreation;
  $('cr-prev').hidden = $('cr-next').hidden = !isCreation;
  $('cr-step-status').textContent = isCreation ? `${creatorStep+1} / ${CREATOR_STEPS.length}` : '';
  renderCreatorIssues();
  $('cr-prev').disabled = creatorStep === 0;
  $('cr-next').disabled = creatorStep === CREATOR_STEPS.length-1;
  $('cr-stepper').innerHTML = CREATOR_STEPS.map((label,i)=>`<button class="cr-tab ${i===creatorStep?'active':''}" role="tab" id="cr-tab-${i}" aria-selected="${i===creatorStep}" aria-controls="cr-body" data-step="${i}">${i+1}. ${escape(label)}</button>`).join('');
  $('cr-body').setAttribute('role', isCreation ? 'tabpanel' : 'region');
  if (isCreation) $('cr-body').setAttribute('aria-labelledby',`cr-tab-${creatorStep}`); else $('cr-body').removeAttribute('aria-labelledby');
  const oldScroll = $('cr-body').scrollTop;
  const openDetails=[...$('cr-body').querySelectorAll('details[open][id]')].map(el=>el.id);
  $('cr-body').innerHTML = isCreation ? panelBody(panelParts(creation())[creatorStep]) : ({advancement,rules}[editorMode])();
  openDetails.forEach(id=>{const detail=$('cr-body').querySelector(`[id="${CSS.escape(id)}"]`);if(detail)detail.open=true;});
  numericFields($('cr-body')); $('cr-body').scrollTop=oldScroll;
}
function logEntries() { return store.roster.logs?.[current().id] || []; }
function paintLogs() {
  $('dicelog').innerHTML=logEntries().map(e=>`<div class="ev ev-${escape(e.kind)}">${escape(e.text)}</div>`).join('');
  window.repaintRollMirror();
}
function logEvent(kind,text) {
  store.roster.logs ||= {}; const entries = store.roster.logs[current().id] ||= [];
  entries.unshift({kind,text:String(text).slice(0,2000)}); entries.length=Math.min(entries.length,200);
  store.schedule();paintLogs();window.mirrorLogEntry(kind,escape(text));
  // paintLogs already includes the new entry; the mirror call only reopens a hidden roll panel.
  window.repaintRollMirror();
}
function runCommand(raw) {
  try { const rolled=evalExpr(raw);logEvent('roll',`${raw}: ${rolled.terms.map(t=>t.dice.map(d=>`${d.v}${d.dropped?' (dropped)':''}`).join(', ')).join(' | ')} = ${rolled.value}`); }
  catch(error) { notify(error.message); }
}
function openEditor(mode) {
  if (!$('creator-modal').open) returnFocus = document.activeElement;
  editorMode = mode; renderEditor();
  if (!$('creator-modal').open) $('creator-modal').showModal();
}
function refreshPointBudget() {
  derived=derive(current(),pack);
  const budget=$('cr-body').querySelector('.budget');
  if(budget){budget.textContent=`${Number.isFinite(derived.pointCost)?derived.pointCost:'Invalid'} / ${current().pointBudget} points`;budget.classList.toggle('error',derived.pointCost>current().pointBudget);}
  renderCreatorIssues();
}
function refreshCredits(el) {
  document.querySelectorAll('[data-field="credits"]').forEach(input=>{if(input!==el)input.value=current().credits;});
  const roll=$('cr-body').querySelector('[data-action="starting-credits"]');
  if(roll)roll.disabled=Boolean(current().credits||current().inventory.length);
}
function validCreatorInput() {const invalid=$('cr-body').querySelector('[data-generation-manual]:invalid');if(invalid){invalid.reportValidity();return false;}return true;}
function closeEditor() { if(validCreatorInput()){$('creator-modal').close();editorMode=null;render();} }
function focusModule(key) {
  const module = $(`module-${key}`); if (!module) return;
  if (window.__layout.state.collapsed[key]) window.__layout.toggleCollapse(module);
  const stack = window.__layout.stackIdOf(key); if (stack) window.__layout.switchTab(key);
  module.scrollIntoView({block:'start',behavior:'smooth'});
}
function route() {
  const key = location.hash.slice(1);
  section = SECTIONS.some(([id])=>id===key) ? key : 'overview';
  if (['creation','advancement','rules'].includes(section)) openEditor(section);
  else {
    if ($('creator-modal').open) closeEditor();
    if (section !== 'overview') focusModule({equipment:'inventory',features:'features',skills:'skills'}[section]);
  }
}
function render() {
  derived = derive(current(),pack);
  const scroll = window.scrollY;
  const openDetails = [...document.querySelectorAll('.modules details[open][id]')].map(el=>el.id);
  $('roster').innerHTML = store.roster.characters.map(c=>`<button data-character="${escape(c.id)}" aria-pressed="${c.id===store.roster.activeId}" class="char-tab ${c.id===store.roster.activeId?'active':''}">${escape(c.name||'Unnamed hero')}</button>`).join('');
  $('navigation').innerHTML=SECTIONS.map(([key,label])=>`<a href="#${key}">${label}</a>`).join('');
  $('recovery').hidden=!store.recovery;
  $('replace-storage').hidden = !store.recovery || !recoveryExported;
  const c=current();
  $('build-status').innerHTML = derived.issues.length ? `<details class="validation"><summary>${derived.issues.length} unresolved choice${derived.issues.length===1?'':'s'}</summary><ul>${derived.issues.map(t=>`<li>${escape(t)}</li>`).join('')}</ul></details>` : '';
  document.querySelector('.modules').innerHTML=sheet();
  openDetails.forEach(id=>{if($(id)) $(id).open=true;});
  numericFields($('main'));window.__layout.refresh();paintLogs();renderEditor();
  document.title=`${c.name||'wkolon'} | Saga Edition`;
  window.scrollTo({top:scroll});
}
function changed() { store.schedule(); queueMicrotask(render); }
function d(sides) { const a=new Uint32Array(1); const ceiling=Math.floor(2**32/sides)*sides; do { crypto.getRandomValues(a); } while(a[0]>=ceiling); return a[0]%sides+1; }
function addInventory(id,quantity=1) {
  if (ix.equipment.get(id).kind==='armor') current().inventory.filter(e=>ix.equipment.get(e.id).kind==='armor').forEach(e=>e.equipped=false);
  current().inventory.push({id,quantity,equipped:ix.equipment.get(id).kind!=='gear',twoHanded:false,attackMod:0,damageMod:0});
}
function purchase(debit, form=$('purchase')) {
  const id=form.querySelector('[data-catalog-item]').value, quantity=Number(form.querySelector('[data-catalog-quantity]').value), item=ix.equipment.get(id);
  if (!Number.isInteger(quantity)||quantity<1||quantity>999) return notify('Choose a quantity from 1 to 999.');
  const cost=item.cost*quantity;
  if (debit&&current().credits<cost) return notify(`Insufficient credits. ${cost.toLocaleString()} required.`);
  if (debit) current().credits-=cost;
  addInventory(id,quantity); changed();
}
function confirmDelete(titleText, text, callback) {
  $('confirm-title').textContent=titleText; $('confirm-text').textContent=text;
  const dialog=$('confirm-dialog'); dialog.returnValue='';
  dialog.addEventListener('close',()=>{if(dialog.returnValue==='confirm') callback();},{once:true}); dialog.showModal();
}
function events() {
  document.addEventListener('input',event=>{
    const el=event.target;
    if (el.hasAttribute('data-generation-manual')) {
      const value=Number(el.value), valid=el.value!=='' && Number.isInteger(value) && value>=3 && value<=30;
      el.setCustomValidity(valid?'':'Enter a whole number from 3 to 30.');
      if(!valid)return;
      setPoolScore(current(),Number(el.dataset.generationManual),value,pack);store.schedule();
      derived=derive(current(),pack);
      const state=generationState(current(),pack);
      $('cr-body').querySelectorAll('.cr-pool').forEach((score,i)=>{score.textContent=state.pool[i];});
      for(const a of ABILITIES){
        $('cr-body').querySelectorAll(`[data-generation-assign="${a}"] option`).forEach(option=>{if(option.value!=='')option.textContent=state.pool[Number(option.value)];});
        $(`cr-final-${a}`).textContent=derived.scores[a];
        $(`cr-mod-${a}`).textContent=signed(derived.mods[a]);
      }
      renderCreatorIssues();
      return;
    }
    if(el.dataset.field==='credits' && el.closest('#cr-body')){const value=Number(el.value);if(el.value!=='' && Number.isInteger(value) && value>=0 && value<=1000000000){current().credits=value;store.schedule();refreshCredits(el);}return;}
    if(el.dataset.field==='pointBudget' && el.closest('#cr-body')){const value=Number(el.value);if(el.value!=='' && Number.isInteger(value) && value>=0 && value<=100){current().pointBudget=value;store.schedule();refreshPointBudget();}return;}
    if (el.dataset.field && ['name','player','notes','languages'].includes(el.dataset.field)) {
      current()[el.dataset.field]=el.value; store.schedule();
      if(el.dataset.field==='name') { document.querySelectorAll('[data-field="name"]').forEach(input=>{if(input!==el)input.value=el.value;}); document.querySelector(`[data-character="${current().id}"]`).textContent=el.value||'Unnamed hero'; }
    }
  });
  document.addEventListener('change',event=>{
    const el=event.target, c=current();
    if(el.hasAttribute('data-generation-manual')) return;
    if(el.hasAttribute('data-catalog-item')){const scope=el.closest('form').dataset.equipmentScope==='cr'?'cr-':'';$(scope+'equipment-reference').innerHTML=ruleReference(ix.equipment.get(el.value),'ⓘ',null,scope+'catalog');return;}
    if(el.hasAttribute('data-math')) commitMath(el);
    if (el.dataset.field) {
      if (['name','player','notes','languages'].includes(el.dataset.field)) return;
      const keys=el.dataset.field.split('.');
      const obj=keys.length>1?c[keys[0]]:c, key=keys.at(-1);
      const numeric=el.dataset.number==='true'||['condition','hpRoll'].includes(key);
      const value=numeric?Number(el.value):el.value;
      if (numeric&&(!Number.isInteger(value)||value<Number(el.min||-1000)||value>Number(el.max||1000000000))) { notify('Enter a whole number within the field limits.'); render(); return; }
      if(key==='credits' && el.closest('#cr-body')){obj[key]=value;store.schedule();refreshCredits(el);return;}
      if(key==='pointBudget' && el.closest('#cr-body')){obj[key]=value;store.schedule();refreshPointBudget();return;}
      if(key==='hpRoll') c.levels[Number(el.dataset.level)].hpRoll=value; else obj[key]=value;
    } else if (el.dataset.generationAssign) {
      assignScore(c,el.dataset.generationAssign,el.value===''?null:Number(el.value),pack);
    } else if (el.hasAttribute('data-generation-pool')) {
      setPoolScore(c,Number(el.dataset.generationPool),Number(el.value),pack);
    } else if (el.dataset.ability) {
      const value=Number(el.value); if(!Number.isInteger(value)||value<3||value>30) {notify('Base abilities must be whole numbers from 3 to 30.');render();return;}
      c.abilities[el.dataset.ability]=value;delete c.abilityGeneration;
    } else if(el.dataset.class) {
      const l=c.levels[Number(el.dataset.class)]; l.classId=el.value;
      if(Number(el.dataset.class)>0) l.hpRoll=Math.floor(ix.classes.get(el.value).hitDie/2)+1;
    } else if(el.dataset.knowledgeGroup) {
      const scope=el.dataset.knowledgeGroup, list=trainingList(scope);
      if(el.checked) knowledgeDrafts.set(knowledgeKey(scope),list.some(id=>id.startsWith('skill:knowledge-'))?0:1);
      else {replaceTraining(scope,list.filter(id=>!id.startsWith('skill:knowledge-')));knowledgeDrafts.delete(knowledgeKey(scope));}
    } else if(el.dataset.knowledgeField) {
      const scope=el.dataset.knowledgeField, old=el.dataset.previousKnowledge, list=[...trainingList(scope)];
      const i=list.indexOf(old), pending=knowledgeDrafts.get(knowledgeKey(scope))||0;
      if(i>=0){if(el.value)list[i]=el.value;else {list.splice(i,1);knowledgeDrafts.set(knowledgeKey(scope),pending+1);}}
      else if(el.value){if(!list.includes(el.value))list.push(el.value);knowledgeDrafts.set(knowledgeKey(scope),Math.max(0,pending-1));}
      replaceTraining(scope,list);
    } else if(el.dataset.trained) {
      const id=el.dataset.trained; c.trainedSkills=el.checked?[...c.trainedSkills,id]:c.trainedSkills.filter(v=>v!==id);
    } else if(el.dataset.extraSkill) {
      const l=c.levels[Number(el.dataset.level)], id=el.dataset.extraSkill;
      l.trainedSkills=el.checked?[...l.trainedSkills,id]:l.trainedSkills.filter(v=>v!==id);
    } else if(el.dataset.choice) {
      const l=c.levels[Number(el.dataset.level)];
      const familyName=el.value.startsWith('family:')?el.value.slice(7):null;
      const representative=familyName && pack.feats.find(r=>r.name.startsWith(familyName+' ('));
      let s=familyName?{id:representative.id,pending:true}:parseSelection(el.value);
      if(el.hasAttribute('data-secondary') && !s){const old=el.dataset.choice==='feat'?l.feats[Number(el.dataset.slot)]:l[el.dataset.choice];s=old?{id:old.id,...(/^(Weapon Proficiency|Armor Proficiency) \(/.test(ix.feats.get(old.id)?.name||'')?{pending:true}:{})}:null;}
      if(el.dataset.choice==='feat') l.feats[Number(el.dataset.slot)]=s; else l[el.dataset.choice]=s;
    } else if(el.dataset.increase) {
      const l=c.levels[Number(el.dataset.level)]; l.abilityIncreases[Number(el.dataset.increase)]=el.value;
      l.abilityIncreases=l.abilityIncreases.map(v=>v||'');
    } else if(el.dataset.inventory) {
      const e=c.inventory[Number(el.dataset.index)];
      if(el.dataset.number==='true'&&(!Number.isInteger(Number(el.value))||Number(el.value)<-100||Number(el.value)>100)) {notify('Attack and damage modifiers must be whole numbers from −100 to 100.');render();return;}
      if(el.dataset.inventory==='equipped'&&el.checked&&ix.equipment.get(e.id).kind==='armor') c.inventory.filter(other=>ix.equipment.get(other.id).kind==='armor').forEach(other=>other.equipped=false);
      e[el.dataset.inventory]=el.type==='checkbox'?el.checked:Number(el.value);
    } else return;
    changed();
  });
  document.addEventListener('submit',event=>{if(event.target.matches('form[data-equipment-scope]')){event.preventDefault();purchase(true,event.target);}});
  document.addEventListener('click',event=>{
    const conditionRow=event.target.closest('[data-condition-step]');
    if(conditionRow){
      if(window.__layout.state.free && !window.matchMedia('(max-width: 700px)').matches) return;
      const step=Number(conditionRow.dataset.conditionStep);
      const input=$('condition-level');input.value=String(current().condition===step ? Math.max(0,step-1) : step);
      input.dispatchEvent(new Event('change',{bubbles:true}));
      if(event.target.closest('button')) queueMicrotask(()=>document.querySelector(`#condition-effect button[data-condition-step="${step}"]`)?.focus({preventScroll:true}));
      return;
    }
    const el=event.target.closest('button'); if(!el) return;
    const c=current();
    if(el.dataset.removeKnowledge){
      const scope=el.dataset.removeKnowledge, id=el.dataset.knowledgeId, key=knowledgeKey(scope);
      if(id)replaceTraining(scope,trainingList(scope).filter(skill=>skill!==id));
      else knowledgeDrafts.set(key,Math.max(0,(knowledgeDrafts.get(key)||0)-1));
      changed();return;
    }
    if(el.dataset.addKnowledge){const key=knowledgeKey(el.dataset.addKnowledge);knowledgeDrafts.set(key,(knowledgeDrafts.get(key)||0)+1);changed();return;}
    if(el.dataset.crmethod){setGenerationMethod(c,el.dataset.crmethod,pack);changed();return;}
    if(el.dataset.damage){const rolled=evalExpr(el.dataset.damage);logEvent('roll',`${el.dataset.rollLabel}: ${el.dataset.damage} = ${rolled.value}`);return;}
    if(el.hasAttribute('data-roll') && !el.classList.contains('die')){const die=d(20);logEvent('roll',`${el.dataset.rollLabel}: ${die} ${signed(Number(el.dataset.roll))} = ${die+Number(el.dataset.roll)}`);return;}
    if(el.hasAttribute('data-remove-item')){c.inventory.splice(Number(el.dataset.removeItem),1);changed();return;}
    switch(el.dataset.action){
      case 'clear-log': if(store.roster.logs) delete store.roster.logs[c.id];store.schedule();paintLogs();return;
      case 'roll-abilities': {const sets=ABILITIES.map(()=>{const dice=[d(6),d(6),d(6),d(6)].sort((a,b)=>b-a);return {dice,value:dice.slice(0,3).reduce((a,b)=>a+b)};});setRolledPool(c,sets.map(s=>s.value));logEvent('roll',`Ability scores: 4d6 drop lowest ×6: ${sets.map(s=>`${s.value} (${s.dice.join(',')})`).join(' | ')}`);break;}
      case 'starting-credits': {const r=ix.classes.get(c.levels[0].classId).credits;const rolls=Array.from({length:r.dice},()=>d(r.sides));c.credits=rolls.reduce((a,b)=>a+b)*r.multiplier;logEvent('roll',`${rolls.join(' + ')} × ${r.multiplier} = ${c.credits} credits`);break;}
      case 'jedi-lightsaber': if(!c.inventory.some(e=>e.id==='equipment:lightsaber')) addInventory('equipment:lightsaber'); else notify('A lightsaber is already in your inventory.');break;
      case 'add-gear': purchase(false,el.closest('form'));return;
      case 'add-level': {const cls=ix.classes.get($('next-class').value); c.levels.push({classId:cls.id,hpRoll:Math.floor(cls.hitDie/2)+1,feats:[],talent:null,startingFeat:null,abilityIncreases:[],trainedSkills:[]});c.forcePoints=5+Math.floor(c.levels.length/2);break;}
      case 'undo-level': confirmDelete('Remove last level?',`Remove level ${c.levels.length} and its choices.`,()=>{c.levels.pop();changed();});return;
      default:return;
    }
    changed();
  });
  $('roster').addEventListener('click',event=>{const el=event.target.closest('[data-character]');if(el){store.switch(el.dataset.character);render();}});
  $('new-character').onclick=()=>{store.add();creatorStep=0;render();location.hash='creation';openEditor('creation');};
  $('duplicate').onclick=()=>{store.duplicate();render();};
  $('delete-character').onclick=()=>confirmDelete('Delete character?',`Delete ${current().name||'this hero'} from this browser. Export a copy first if you want to keep it.`,()=>{store.remove();render();});
  $('export-character').onclick=()=>downloadJSON(current(),`${current().name.replace(/[^a-z0-9-]+/gi,'-')||'hero'}.json`);
  $('import-character').onchange=async event=>{const file=event.target.files[0];try{if(file){if(file.size>2000000)throw new Error('Character files must be smaller than 2 MB');store.import(await file.text());render();notify('Character imported.');}}catch(error){notify(error.message);}finally{event.target.value='';}};
  $('recovery').onclick=()=>{downloadJSON(store.recovery,'wkolon-recovery.json');recoveryExported=true;render();};
  $('replace-storage').onclick=()=>confirmDelete('Replace damaged storage?', 'Replace the damaged browser data with the current roster. Keep your exported recovery file.',()=>{store.unlockAfterRecovery();render();});
  $('print').onclick=()=>{closeEditor();location.hash='overview';window.print();};
  window.addEventListener('hashchange',route);
  $('navigation').addEventListener('click',event=>{const link=event.target.closest('a');if(link && link.hash===location.hash){event.preventDefault();route();}});
  $('cr-stepper').onclick=event=>{const tab=event.target.closest('[data-step]');if(tab && validCreatorInput()){creatorStep=Number(tab.dataset.step);$('cr-body').scrollTop=0;renderEditor();}};
  $('cr-prev').onclick=()=>{if(!validCreatorInput())return;creatorStep--; $('cr-body').scrollTop=0;renderEditor();};
  $('cr-next').onclick=()=>{if(!validCreatorInput())return;creatorStep++; $('cr-body').scrollTop=0;renderEditor();};
  $('cr-close').onclick=$('cr-done').onclick=closeEditor;
  $('creator-modal').addEventListener('close',()=>{const needsRender=editorMode!==null;editorMode=null;location.hash='overview';store.flush();if(needsRender)render();returnFocus?.focus();});
  document.addEventListener('keydown',event=>{if(event.key==='Enter' && event.target.id==='cmd-input'){event.preventDefault();runCommand(event.target.value);event.target.value='';}});
  window.getRollEntries=logEntries;window.escapeRollText=escape;window.runCommand=runCommand;
}
async function boot(){
  try{
    const response=await fetch(new URL('../data/core.json',import.meta.url));if(!response.ok)throw new Error(`Rules could not load (${response.status})`);
    pack=await response.json();ix=indexPack(pack);store=createStore(pack,status);events();render();route();
    if(!saveState[1])status('Saved',false);
  }catch(error){$('main').innerHTML=`<h1>Unable to open the sheet</h1><p>${escape(error.message)}</p><p><a href="./">Reload</a></p>`;status('Sheet unavailable',true);}
}
boot();
