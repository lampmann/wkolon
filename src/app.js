import {ABILITIES, GROUPS, signed, indexPack, derive, progression, eligible, classSkills} from './rules.js';
import {createStore, downloadJSON} from './persistence.js';
import {commitMath} from './math-fields.js';
import {evalExpr} from './dice.js';

const $ = id => document.getElementById(id);
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const clone = value => structuredClone(value);
const title = value => value.replaceAll('-', ' ').replace(/\b\w/g, c => c.toUpperCase());
const SECTIONS = [['overview','Sheet'],['creation','Builder'],['skills','Skills'],['features','Features'],['equipment','Equipment'],['advancement','Level up'],['rules','Rules']];
let section = SECTIONS.some(([key]) => key === location.hash.slice(1)) ? location.hash.slice(1) : 'overview';
let pack, ix, store, derived;
let creatorStep = 0, editorMode = null, returnFocus = null;
const CREATOR_STEPS = ['Identity', 'Abilities', 'Skills', 'Feats & talent', 'Languages & credits'];
let saveState = ['Saved', false];
let toastTimer;
let recoveryExported = false;
const status = (message, error) => { saveState = [message,error]; $('save-status').textContent = message; $('save-status').classList.toggle('error',error); };
const notify = message => { $('message').textContent = message; $('message').hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => $('message').hidden = true, 7000); };
const current = () => store.current();
const option = (value, name, selected, disabled=false) => `<option value="${escape(value)}" ${String(value) === String(selected) ? 'selected' : ''} ${disabled ? 'disabled' : ''}>${escape(name)}</option>`;
const choices = (records, selected) => [...records].sort((a,b) => a.name.localeCompare(b.name)).map(r => option(r.id, r.name, selected)).join('');
const field = (label, key, value, type='text', attrs='') => `<label>${escape(label)}<input type="${type}" data-field="${key}" value="${escape(value)}" ${attrs}></label>`;
const sourceLink = r => { const s = pack.sources.find(s => s.id === r.sourceId); return `<a class="source-link" href="${escape(s.url)}" target="_blank" rel="noopener" aria-label="${escape(r.name)} source">↗</a>`; };
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
  const items = records.flatMap(r => variants(r).filter(s => eligible(r,s,ctx,ix,type) && (slot?.kind !== 'bonus' || !cls.bonusRestrictions[r.id] || cls.bonusRestrictions[r.id].includes(s.choice))).map(s => ({value:selectionValue(s),name:entryLabel(s)}))).sort((a,b) => a.name.localeCompare(b.name));
  const selectedValue = selectionValue(selected);
  if (selected && !items.some(o => o.value === selectedValue)) items.unshift({value:selectedValue,name:`${entryLabel(selected)} (ineligible)`});
  const label = kind === 'talent' ? 'Talent' : kind === 'startingFeat' ? 'Starting feat' : slot.label;
  const record = selected && ix[type].get(selected.id);
  return `<div class="choice-field"><label>${escape(label)}<select data-choice="${kind}" data-level="${levelIndex}" data-slot="${slotIndex}">${option('',kind==='startingFeat'&&!items.length?'No eligible starting feats':'Choose…',selectedValue)}${items.map(o => option(o.value,o.name,selectedValue)).join('')}</select></label>${record ? `<p class="rule-summary">${escape(record.reminder)} ${sourceLink(record)}</p>` : ''}</div>`;
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
function trainingAfterIncrease(i) {
  const before = i ? progression(current(),pack,i).ctx.scores.int : derived.rows[0].scores.int;
  const amount = Math.max(0,Math.floor((derived.rows[i].scores.int-10)/2)-Math.floor((before-10)/2));
  if (!amount) return '';
  const ctx = derived.rows[i].ctx;
  return `<fieldset><legend>Train ${amount} skill${amount===1?'':'s'}</legend><div class="skill-picks">${pack.skills.filter(s => classSkills(ctx,ix).has(s.id)).map(s => `<label><input type="checkbox" data-extra-skill="${s.id}" data-level="${i}" ${current().levels[i].trainedSkills.includes(s.id)?'checked':''}>${escape(s.name)}</label>`).join('')}</div></fieldset>`;
}
function abilityCards() {
  return `<table class="cr-scores"><thead><tr><th>Ability</th><th>Base</th><th>Species</th><th>Score</th><th>Mod</th></tr></thead><tbody>${ABILITIES.map(a=>`<tr><td>${a.toUpperCase()}</td><td><input aria-label="Base ${a.toUpperCase()}" type="number" min="3" max="30" value="${current().abilities[a]}" data-ability="${a}"></td><td>${signed(ix.species.get(current().species).abilityAdjustments[a]||0)}</td><td class="derived">${derived.scores[a]}</td><td>${signed(derived.mods[a])}</td></tr>`).join('')}</tbody></table>`;
}
function calculations(id, entries) {
  return `<details id="${id}" class="calculation-details"><summary>Calculations</summary><dl>${entries.map(([name,value])=>`<dt>${escape(name)}</dt><dd>${escape(value)}</dd>`).join('')}</dl></details>`;
}
function skillTable() {
  return `<div class="table-scroll"><table><thead><tr><th>Skill</th><th>Ability</th><th>Trained</th><th>Check</th></tr></thead><tbody>${derived.skills.map(s=>`<tr><td>${escape(s.name)}</td><td>${s.ability.toUpperCase()}</td><td>${s.trained ? '✓' : '—'}</td><td><button class="roll" data-roll="${s.total}" data-roll-label="${escape(s.name)}" ${!s.available || derived.incapacitated ? 'disabled' : ''}>${s.available ? signed(s.total) : '—'}</button></td></tr>`).join('')}</tbody></table></div>${calculations('skill-calculations',derived.skills.map(s=>[s.name,s.breakdown]))}`;
}
function attackTable() {
  return derived.attacks.length ? `<div class="table-scroll"><table><thead><tr><th>Weapon</th><th>Attack</th><th>Damage</th></tr></thead><tbody>${derived.attacks.map(a=>`<tr><td>${escape(a.name)}<small>${escape(a.damageType)}${a.proficient?'':' | Not proficient'}</small></td><td><button class="roll" data-roll="${a.attack}" data-roll-label="${escape(a.name)} attack" ${derived.incapacitated?'disabled':''}>${signed(a.attack)}</button></td><td><button class="roll" data-damage="${escape(a.damageDisplay)}" data-roll-label="${escape(a.name)} damage">${a.damageDisplay}</button></td></tr>`).join('')}</tbody></table></div>${calculations('attack-calculations',derived.attacks.map(a=>[a.name,a.breakdown]))}` : '';
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
  const c = current(), species = ix.species.get(c.species), cls = ix.classes.get(c.levels[0].classId);
  const ctx = clone(derived.rows[0].ctx);
  if (c.levels[0].feats.some(s => s?.id === 'feat:force-sensitivity')) ctx.feats.push({id:'feat:force-sensitivity'});
  const allowed = classSkills(ctx,ix);
  const budget = Math.max(1,cls.trainedSkills+Math.floor((derived.rows[0].scores.int-10)/2))+species.bonusSkills;
  return `${panel('01 / Identity',`<div class="form-grid">${field('Name','name',c.name,'text','maxlength="200"')}${field('Player','player',c.player,'text','maxlength="200"')}<label>Species<select data-field="species">${choices(pack.species,c.species)}</select></label><label>Class<select data-class="0">${choices(pack.classes,cls.id)}</select></label></div><div class="species-traits">${sourceLink(species)}<span>${species.size} | ${species.speed} squares | ${species.languages.map(escape).join(', ')}</span>${species.reminders.map(t=>`<p>${escape(t)}</p>`).join('')}</div>`)}
    ${panel('02 / Ability scores',`<div class="actions"><label>Method<select data-field="abilityMethod">${[['standard','Standard package'],['point-buy','Point buy'],['rolled','4d6, drop lowest'],['manual','Manual scores']].map(([v,n])=>option(v,n,c.abilityMethod)).join('')}</select></label>${c.abilityMethod==='point-buy'?field('Budget','pointBudget',c.pointBudget,'number','min="0" max="100"'):''}<button data-action="${c.abilityMethod==='rolled'?'roll-abilities':'reset-abilities'}">${c.abilityMethod==='rolled'?'Roll':'Reset'}</button>${c.abilityMethod==='standard'?'<button data-action="rotate-abilities">Rotate</button>':''}</div>${abilityCards(true)}${c.abilityMethod==='point-buy'?`<p class="budget ${derived.pointCost>c.pointBudget?'error':''}">${Number.isFinite(derived.pointCost)?derived.pointCost:'Invalid'} / ${c.pointBudget} points</p>`:''}`)}
    ${panel('03 / Trained skills',`<div class="panel-subheading"><span>${c.trainedSkills.length} / ${budget}</span></div><div class="skill-picks">${pack.skills.filter(s=>allowed.has(s.id)||c.trainedSkills.includes(s.id)).map(s=>`<label class="${!allowed.has(s.id)?'error':''}"><input type="checkbox" data-trained="${s.id}" ${c.trainedSkills.includes(s.id)?'checked':''}>${escape(s.name)}</label>`).join('')}</div>`)}
    ${panel('04 / Feats & talent',levelEditor(0))}
    ${panel('05 / Languages & credits',`<div class="form-grid">${field(`Extra languages (${languageCount()})`,'languages',c.languages)}${field('Credits','credits',c.credits,'number','min="0" max="1000000000"')}</div><div class="actions"><button data-action="starting-credits" ${c.credits || c.inventory.length?'disabled':''}>Roll credits</button>${cls.id==='class:jedi'?'<button data-action="jedi-lightsaber">Add lightsaber</button>':''}<a class="button primary" href="#equipment">Equipment</a></div>`)}
  `;
}
function languageCount() {
  const linguists = derived.ctx.feats.filter(s=>s.id==='feat:linguist').length;
  return Math.max(0,derived.mods.int)+linguists*Math.max(1,1+derived.mods.int);
}
function featureList() {
  const species = ix.species.get(current().species);
  const features = [...derived.ctx.feats,...derived.ctx.talents].map(s=>({s,r:ix.feats.get(s.id)||ix.talents.get(s.id)}));
  return panel('Features',`<div class="feature-list">${features.map(({s,r})=>`<article><div><h3>${escape(entryLabel(s))}</h3>${s.automatic?'':`<span class="badge">Level ${s.level}</span>`}${sourceLink(r)}</div><p>${escape(r.reminder)}</p></article>`).join('')}${species.reminders.length?`<article><h3>${escape(species.name)}</h3>${species.reminders.map(t=>`<p>${escape(t)}</p>`).join('')}</article>`:''}</div>`);
}
function equipment() {
  const c = current();
  return `${panel('Equipment catalog',`<form id="purchase" class="purchase-form"><label>Item<select id="purchase-item">${['armor','gear','weapon'].map(kind=>`<optgroup label="${title(kind)}">${pack.equipment.filter(r=>r.kind===kind).sort((a,b)=>a.name.localeCompare(b.name)).map(r=>option(r.id,`${r.name} | ${r.cost.toLocaleString()} cr | ${r.weight} kg`)).join('')}</optgroup>`).join('')}</select></label><label>Quantity<input id="purchase-quantity" type="number" min="1" max="999" value="1" required></label><button class="primary" type="submit">Buy</button><button type="button" data-action="add-gear">Add owned</button></form><div class="actions">${field('Credits','credits',c.credits,'number','min="0" max="1000000000"')}<div class="weight"><strong>${derived.weight.toFixed(1)} kg</strong></div></div>`)}
    ${panel('Inventory',c.inventory.length?`<div class="inventory-list">${c.inventory.map((e,i)=>{const r=ix.equipment.get(e.id);return `<article><div class="inventory-title"><div><h3>${escape(r.name)} <span class="badge">×${e.quantity}</span></h3><small>${r.weight*e.quantity} kg | ${r.cost.toLocaleString()} cr each</small></div>${sourceLink(r)}</div><div class="inventory-controls">${r.kind!=='gear'?`<label class="checkbox"><input type="checkbox" data-inventory="equipped" data-index="${i}" ${e.equipped?'checked':''}>Equipped</label>`:''}${r.kind==='weapon'?`<label class="checkbox"><input type="checkbox" data-inventory="twoHanded" data-index="${i}" ${e.twoHanded?'checked':''} ${r.mode!=='melee'||pack.rules.weaponSizeOrder.indexOf(r.size)<pack.rules.weaponSizeOrder.indexOf(ix.species.get(c.species).size)?'disabled':''}>Two hands</label><label>Attack misc<input type="number" min="-100" max="100" value="${e.attackMod}" data-inventory="attackMod" data-index="${i}"></label><label>Damage misc<input type="number" min="-100" max="100" value="${e.damageMod}" data-inventory="damageMod" data-index="${i}"></label>`:''}<button data-remove-item="${i}">Remove</button></div>${r.kind==='armor'?`<p class="rule-summary">Reflex +${r.armorBonus} | Fortitude +${r.fortitudeBonus} with proficiency | Max DEX +${r.maxDex}</p>`:''}</article>`}).join('')}</div>`:'')}
    ${panel('Attacks',attackTable())}`;
}
function advancement() {
  const c=current();
  return `${panel('',`<div class="actions"><label>Class<select id="next-class">${choices(pack.classes,c.levels.at(-1).classId)}</select></label><button class="primary" data-action="add-level" ${c.levels.length>=20?'disabled':''}>Add level ${c.levels.length+1}</button><button data-action="undo-level" ${c.levels.length===1?'disabled':''}>Remove last level</button></div>`)}
    ${c.levels.map((l,i)=>`<section class="panel"><div class="panel-heading"><h2>Level ${i+1}</h2><span class="badge">${escape(derived.rows[i].cls.name)} ${derived.rows[i].classLevel}</span></div>${i?`<label>Class<select data-class="${i}">${choices(pack.classes,l.classId)}</select></label>`:''}${levelEditor(i)}</section>`).join('')}`;
}
function rules() {
  return `${panel('Rules catalog',`<div class="stats-grid">${['species','classes','skills','feats','talents','equipment'].map(key=>metric(title(key),pack[key].length)).join('')}</div><p>Pack ${escape(pack.id)} / ${escape(pack.version)}. This starter catalog includes a selection of core feats, talents, and equipment.</p><p>Prestige classes, droid creation, Force power selection, and additional books are not available yet. Conditional abilities appear as reminders. Use sheet and attack modifiers for circumstances and table rulings.</p><p><a href="./docs/rules-data.md">Rules-data contract</a> | <a href="./data/core.json">Download the rules pack</a></p>`)}
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
  const character = `<div class="character-fields">${field('Name','name',c.name,'text','maxlength="200"')}${field('Player','player',c.player,'text','maxlength="200"')}<span>${escape(species.name)}</span><span>Level ${derived.level}</span><a href="#creation">Edit</a></div><div class="hint">${escape(species.languages.join(', '))}${c.languages ? ', '+escape(c.languages) : ''}</div>`;
  const classes = `<table id="class-table"><thead><tr><th>Class</th><th>Level</th><th>Hit die</th><th>Base attack</th></tr></thead><tbody>${[...derived.ctx.classLevels].map(([id,n])=>{const cls=ix.classes.get(id);return `<tr><td>${escape(cls.name)}</td><td class="derived">${n}</td><td>d${cls.hitDie}</td><td>${signed(cls.bab[n-1])}</td></tr>`;}).join('')}</tbody></table><div class="class-summary"><span>Next level: ${derived.nextXP?.toLocaleString() ?? 'Maximum'} XP</span><a href="#advancement" class="button">Level Up</a></div>`;
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
  root.querySelectorAll('input[type=number]').forEach(el=>{
    el.dataset.number='true'; el.dataset.math=''; el.dataset.prev=el.value;
    if(el.hasAttribute('min')) el.dataset.min=el.min;
    if(el.hasAttribute('max')) el.dataset.max=el.max;
    el.type='text';el.inputMode='numeric';
  });
}
function renderEditor() {
  if (!editorMode) return;
  $('cr-title').textContent = {creation:'Character',advancement:'Level up',rules:'Rules'}[editorMode];
  const isCreation = editorMode === 'creation';
  $('cr-stepper').hidden = !isCreation;
  $('cr-prev').hidden = $('cr-next').hidden = !isCreation;
  $('cr-step-status').textContent = isCreation ? `${creatorStep+1} / ${CREATOR_STEPS.length}` : '';
  $('cr-blocker').textContent = derived.issues.length ? `${derived.issues.length} unresolved choice${derived.issues.length===1?'':'s'}` : '';
  $('cr-prev').disabled = creatorStep === 0;
  $('cr-next').disabled = creatorStep === CREATOR_STEPS.length-1;
  $('cr-stepper').innerHTML = CREATOR_STEPS.map((label,i)=>`<button class="cr-tab ${i===creatorStep?'active':''}" role="tab" id="cr-tab-${i}" aria-selected="${i===creatorStep}" aria-controls="cr-body" data-step="${i}">${escape(label)}</button>`).join('');
  $('cr-body').setAttribute('role', isCreation ? 'tabpanel' : 'region');
  if (isCreation) $('cr-body').setAttribute('aria-labelledby',`cr-tab-${creatorStep}`); else $('cr-body').removeAttribute('aria-labelledby');
  const oldScroll = $('cr-body').scrollTop;
  $('cr-body').innerHTML = isCreation ? panelBody(panelParts(creation())[creatorStep]) : ({advancement,rules}[editorMode])();
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
function closeEditor() { $('creator-modal').close(); }
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
function purchase(debit) {
  const id=$('purchase-item').value, quantity=Number($('purchase-quantity').value), item=ix.equipment.get(id);
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
    if (el.dataset.field && ['name','player','notes','languages'].includes(el.dataset.field)) {
      current()[el.dataset.field]=el.value; store.schedule();
      if(el.dataset.field==='name') { document.querySelectorAll('[data-field="name"]').forEach(input=>{if(input!==el)input.value=el.value;}); document.querySelector(`[data-character="${current().id}"]`).textContent=el.value||'Unnamed hero'; }
    }
  });
  document.addEventListener('change',event=>{
    const el=event.target, c=current();
    if(el.hasAttribute('data-math')) commitMath(el);
    if (el.dataset.field) {
      if (['name','player','notes','languages'].includes(el.dataset.field)) return;
      const keys=el.dataset.field.split('.');
      const obj=keys.length>1?c[keys[0]]:c, key=keys.at(-1);
      const numeric=el.dataset.number==='true'||['condition','hpRoll'].includes(key);
      const value=numeric?Number(el.value):el.value;
      if (numeric&&(!Number.isInteger(value)||value<Number(el.min||-1000)||value>Number(el.max||1000000000))) { notify('Enter a whole number within the field limits.'); render(); return; }
      if(key==='hpRoll') c.levels[Number(el.dataset.level)].hpRoll=value; else obj[key]=value;
    } else if (el.dataset.ability) {
      const value=Number(el.value); if(!Number.isInteger(value)||value<3||value>30) {notify('Base abilities must be whole numbers from 3 to 30.');render();return;}
      c.abilities[el.dataset.ability]=value;
    } else if(el.dataset.class) {
      const l=c.levels[Number(el.dataset.class)]; l.classId=el.value;
      if(Number(el.dataset.class)>0) l.hpRoll=Math.floor(ix.classes.get(el.value).hitDie/2)+1;
    } else if(el.dataset.trained) {
      const id=el.dataset.trained; c.trainedSkills=el.checked?[...c.trainedSkills,id]:c.trainedSkills.filter(v=>v!==id);
    } else if(el.dataset.extraSkill) {
      const l=c.levels[Number(el.dataset.level)], id=el.dataset.extraSkill;
      l.trainedSkills=el.checked?[...l.trainedSkills,id]:l.trainedSkills.filter(v=>v!==id);
    } else if(el.dataset.choice) {
      const l=c.levels[Number(el.dataset.level)], s=parseSelection(el.value);
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
  document.addEventListener('submit',event=>{if(event.target.id==='purchase'){event.preventDefault();purchase(true);}});
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
    if(el.dataset.damage){const rolled=evalExpr(el.dataset.damage);logEvent('roll',`${el.dataset.rollLabel}: ${el.dataset.damage} = ${rolled.value}`);return;}
    if(el.hasAttribute('data-roll') && !el.classList.contains('die')){const die=d(20);logEvent('roll',`${el.dataset.rollLabel}: ${die} ${signed(Number(el.dataset.roll))} = ${die+Number(el.dataset.roll)}`);return;}
    if(el.hasAttribute('data-remove-item')){c.inventory.splice(Number(el.dataset.removeItem),1);changed();return;}
    switch(el.dataset.action){
      case 'clear-log': if(store.roster.logs) delete store.roster.logs[c.id];store.schedule();paintLogs();return;
      case 'reset-abilities': c.abilities=Object.fromEntries(ABILITIES.map((a,i)=>[a,c.abilityMethod==='point-buy'?8:pack.rules.standardArray[i]]));break;
      case 'rotate-abilities': {const values=ABILITIES.map(a=>c.abilities[a]); values.unshift(values.pop());ABILITIES.forEach((a,i)=>c.abilities[a]=values[i]);break;}
      case 'roll-abilities': {const results=ABILITIES.map(a=>{const dice=[d(6),d(6),d(6),d(6)].sort((a,b)=>a-b); const value=dice.slice(1).reduce((a,b)=>a+b);c.abilities[a]=value;return `${a.toUpperCase()} ${dice.join(',')} → ${value}`;});logEvent('roll',results.join(' | '));break;}
      case 'starting-credits': {const r=ix.classes.get(c.levels[0].classId).credits;const rolls=Array.from({length:r.dice},()=>d(r.sides));c.credits=rolls.reduce((a,b)=>a+b)*r.multiplier;logEvent('roll',`${rolls.join(' + ')} × ${r.multiplier} = ${c.credits} credits`);break;}
      case 'jedi-lightsaber': if(!c.inventory.some(e=>e.id==='equipment:lightsaber')) addInventory('equipment:lightsaber'); else notify('A lightsaber is already in your inventory.');break;
      case 'add-gear': purchase(false);return;
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
  $('cr-stepper').onclick=event=>{const tab=event.target.closest('[data-step]');if(tab){creatorStep=Number(tab.dataset.step);$('cr-body').scrollTop=0;renderEditor();}};
  $('cr-prev').onclick=()=>{creatorStep--; $('cr-body').scrollTop=0;renderEditor();};
  $('cr-next').onclick=()=>{creatorStep++; $('cr-body').scrollTop=0;renderEditor();};
  $('cr-close').onclick=$('cr-done').onclick=closeEditor;
  $('creator-modal').addEventListener('close',()=>{editorMode=null;location.hash='overview';store.flush();returnFocus?.focus();});
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
