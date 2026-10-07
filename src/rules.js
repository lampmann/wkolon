import {emptyTraits, emptyStory, activeBackground, validateFinishing} from './heroic-traits.js';
export const ABILITIES = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
export const GROUPS = ['lightsabers', 'pistols', 'rifles', 'simple-weapons'];
export const modifier = score => Math.floor((score - 10) / 2);
export const signed = n => n >= 0 ? `+${n}` : String(n);
export const selectionKey = s => `${s.id}:${s.choice || ''}`;
const F = name => `feat:${name}`;

export function indexPack(pack) {
  return Object.fromEntries(['species', 'classes', 'skills', 'feats', 'talents', 'equipment', 'destinies', 'backgrounds'].map(key => [key, new Map((pack[key]||[]).map(r => [r.id, r]))]));
}

export function newCharacter(pack) {
  return {
    schemaVersion: 1, ruleset: {id: pack.id, version: pack.version},
    id: crypto.randomUUID(), name: '', player: '', species: 'species:human',
    abilityMethod: 'standard', abilities: Object.fromEntries(ABILITIES.map((a, i) => [a, pack.rules.standardArray[i]])),
    pointBudget: 25, trainedSkills: [],
    levels: [{classId: 'class:scoundrel', hpRoll: null, feats: [], talent: null, startingFeat: null, abilityIncreases: [], trainedSkills: []}],
    inventory: [], credits: 0, currentHP: null, forcePoints: 5, condition: 0,
    languages: '', notes: '', heroicTraits: emptyTraits(), story: emptyStory('none'), modifiers: {reflex: 0, fortitude: 0, will: 0, hp: 0, threshold: 0, attack: 0, damage: 0},
  };
}

export function validateCharacter(c, pack) {
  const bad = message => { throw new Error(`Invalid character: ${message}`); };
  const obj = v => v !== null && typeof v === 'object' && !Array.isArray(v);
  const num = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
  if (!obj(c) || c.schemaVersion !== 1 || !obj(c.ruleset) || c.ruleset.id !== pack.id || c.ruleset.version !== pack.version) bad('unsupported file or rules pack version');
  const ix = indexPack(pack);
  for (const key of ['id', 'name', 'player', 'languages', 'notes']) if (typeof c[key] !== 'string' || c[key].length > 100000) bad(key);
  if (!/^[a-f0-9-]{36}$/.test(c.id)) bad('character ID');
  if (!ix.species.has(c.species)) bad('unknown species');
  if (!['standard', 'point-buy', 'manual', 'rolled'].includes(c.abilityMethod)) bad('ability method');
  if (!obj(c.abilities) || !ABILITIES.every(a => num(c.abilities[a], 3, 30))) bad('ability scores');
  if (c.abilityGeneration !== undefined) {
    const g=c.abilityGeneration;
    if (!obj(g) || !Array.isArray(g.pool) || ![0,6].includes(g.pool.length) || !g.pool.every(n=>num(n,3,c.abilityMethod==='rolled'?18:30)) || !obj(g.assign)) bad('ability generation');
    if (c.abilityMethod==='standard' && g.pool.join()!==pack.rules.standardArray.join()) bad('standard score pool');
    if(c.abilityMethod!=='rolled' && g.pool.length!==6) bad('ability score pool');
    const used=[];
    for(const a of ABILITIES) {
      const i=g.assign[a];
      if (!(i===null || num(i,0,g.pool.length-1)) || c.abilities[a] !== (i===null?10:g.pool[i])) bad('ability assignment');
      if(i!==null) used.push(i);
    }
    if(new Set(used).size!==used.length) bad('duplicate ability assignment');
  }
  if (!num(c.pointBudget, 0, 100)) bad('point budget');
  const skillList = v => Array.isArray(v) && v.length <= pack.skills.length && new Set(v).size === v.length && v.every(id => ix.skills.has(id));
  if (!skillList(c.trainedSkills)) bad('trained skills');
  const choice = (s, type) => s === null || (obj(s) && ix[type].has(s.id) && (!('choice' in s) || typeof s.choice === 'string') && (!('pending' in s) || typeof s.pending === 'boolean'));
  if (!Array.isArray(c.levels) || c.levels.length < 1 || c.levels.length > 20) bad('levels');
  for (const [i, l] of c.levels.entries()) {
    if (!obj(l) || !ix.classes.has(l.classId) || (i && !num(l.hpRoll, 1, ix.classes.get(l.classId).hitDie))) bad('class or HP roll');
    if (!Array.isArray(l.feats) || l.feats.length > 4 || !l.feats.every(s => choice(s, 'feats')) || !choice(l.talent, 'talents') || !choice(l.startingFeat, 'feats')) bad('level choices');
    if (!Array.isArray(l.abilityIncreases) || l.abilityIncreases.length > 2 || !l.abilityIncreases.every(a => a === '' || ABILITIES.includes(a)) || !skillList(l.trainedSkills)) bad('level ability/skill choices');
  }
  if (!Array.isArray(c.inventory) || c.inventory.length > 1000 || !c.inventory.every(e => obj(e) && ix.equipment.has(e.id) && num(e.quantity, 1, 999) && typeof e.equipped === 'boolean' && typeof e.twoHanded === 'boolean' && num(e.attackMod, -100, 100) && num(e.damageMod, -100, 100))) bad('inventory');
  if (!num(c.credits, 0, 1000000000) || !num(c.forcePoints, 0, 1000) || !num(c.condition, 0, 5) || !(c.currentHP === null || num(c.currentHP, 0, 100000))) bad('play state');
  if (!obj(c.modifiers) || !['reflex', 'fortitude', 'will', 'hp', 'threshold', 'attack', 'damage'].every(k => num(c.modifiers[k], -1000, 1000))) bad('modifiers');
  validateFinishing(c,pack,bad);
  return c;
}

export function classSkills(ctx, ix) {
  const skills = new Set([...ctx.classLevels.keys()].flatMap(id => ix.classes.get(id).skills));
  (ctx.backgroundSkills||[]).forEach(id=>skills.add(id));
  if (ctx.feats.some(f => f.id === F('force-sensitivity'))) skills.add('skill:use-the-force');
  return skills;
}

export function prerequisite(p, ctx, ix, choice) {
  const value = p.value === '$choice' ? choice : p.value;
  switch (p.kind) {
    case 'all': return p.requirements.every(r => prerequisite(r, ctx, ix, choice));
    case 'any': return p.requirements.some(r => prerequisite(r, ctx, ix, choice));
    case 'ability': return ctx.scores[value] >= p.min;
    case 'feat': return ctx.feats.some(f => f.id === value);
    case 'talent': return ctx.talents.some(t => t.id === value);
    case 'trained': return ctx.trained.has(value);
    case 'untrained': return !ctx.trained.has(value);
    case 'classSkill': return classSkills(ctx, ix).has(value);
    case 'bab': return ctx.bab >= p.min;
    case 'proficientChoice': return ctx.feats.some(f => ix.feats.get(f.id)?.weaponGroup === value);
    case 'focusChoice': return ctx.feats.some(f => f.id === F('weapon-focus') && f.choice === value);
    default: throw new Error(`Unsupported prerequisite: ${p.kind}`);
  }
}

export function eligible(record, selection, ctx, ix, type) {
  if (!record || selection.pending) return false;
  if (record.choiceType === 'skill' && !ix.skills.has(selection.choice)) return false;
  if (record.choiceType === 'weaponGroup' && !GROUPS.includes(selection.choice)) return false;
  const existing = ctx[type];
  if (record.repeat === 'never' && existing.some(s => s.id === record.id)) return false;
  if (record.repeat === 'choice' && existing.some(s => selectionKey(s) === selectionKey(selection))) return false;
  return prerequisite(record.prerequisite, ctx, ix, selection.choice);
}

export function levelSlots(levelNumber, classLevel, species, cls, pack) {
  const slots = [];
  if (pack.rules.generalFeatLevels.includes(levelNumber)) slots.push({kind: 'general', label: 'Heroic feat'});
  if (levelNumber === 1) for (let i = 0; i < species.bonusFeats; i++) slots.push({kind: 'general', label: 'Species feat'});
  if (classLevel % 2 === 0) slots.push({kind: 'bonus', label: `${cls.name} bonus feat`, classId: cls.id});
  return slots;
}

// Replay choices in order. Invalid or unearned selections never contribute effects.
export function progression(c, pack, through = c.levels.length) {
  const ix = indexPack(pack), species = ix.species.get(c.species);
  const background=activeBackground(c,pack);
  const ctx = {backgroundSkills:new Set(background?(c.story.skills||[]).filter(id=>background.relevantSkills.includes(id)):[]), scores: Object.fromEntries(ABILITIES.map(a => [a, c.abilities[a] + (species.abilityAdjustments[a] || 0)])), classLevels: new Map(), feats: [], talents: [], trained: new Set(), bab: 0};
  const issues = [], rows = [];
  function conditionalFocus() {
    for(const id of [species.conditionalFocus,background?.conditionalFocus])if (id && ctx.trained.has(id) && !ctx.feats.some(f => f.id === F('skill-focus') && f.choice === id)) ctx.feats.push({id: F('skill-focus'), choice: id, automatic: true});
  }
  const issue = (i, text) => issues.push(`Level ${i + 1}: ${text}`);
  function grant(s, type, i, label, allow = () => true) {
    if (!s) { issue(i, `choose ${label}`); return; }
    const r = ix[type].get(s.id);
    if (!allow(r, s) || !eligible(r, s, ctx, ix, type)) { issue(i, `${r?.name || 'Unknown choice'} is not eligible for ${label}`); return; }
    ctx[type].push({...s, level: i + 1});
    if (r.effects.some(e => e.target === 'skillTraining')) ctx.trained.add(s.choice);
    conditionalFocus();
  }
  for (const [i, l] of c.levels.slice(0, through).entries()) {
    const cls = ix.classes.get(l.classId), n = i + 1;
    const cl = (ctx.classLevels.get(cls.id) || 0) + 1;
    ctx.classLevels.set(cls.id, cl);
    ctx.bab = [...ctx.classLevels].reduce((sum, [id, level]) => sum + ix.classes.get(id).bab[level - 1], 0);
    const priorInt = modifier(ctx.scores.int);
    if (pack.rules.abilityLevels.includes(n)) {
      if (l.abilityIncreases.length !== 2 || new Set(l.abilityIncreases).size !== 2 || !l.abilityIncreases.every(a => ABILITIES.includes(a))) issue(i, 'increase two different abilities');
      else l.abilityIncreases.forEach(a => ctx.scores[a]++);
    } else if (l.abilityIncreases.length) issue(i, 'ability increases are not available');
    if (i === 0) {
      for (const id of cls.startingFeats) if (!['feat:linguist', 'feat:shake-it-off'].includes(id)) ctx.feats.push({id, level: 1, automatic: true});
      // Initial Force Sensitivity can enable training during the same creation step.
      const initialForce = l.feats.some(s => s?.id === F('force-sensitivity'));
      const allowed = classSkills(ctx, ix);
      if (initialForce) allowed.add('skill:use-the-force');
      const limit = Math.max(1, cls.trainedSkills + modifier(ctx.scores.int)) + species.bonusSkills;
      for (const id of c.trainedSkills.slice(0, limit)) {
        if (allowed.has(id)) ctx.trained.add(id); else issue(i, `${ix.skills.get(id).name} is not a starting class skill`);
      }
      conditionalFocus();
      if (c.trainedSkills.length !== limit) issue(i, `choose ${limit} starting trained skills (${c.trainedSkills.length} selected)`);
      for (const id of cls.startingFeats.filter(id => ['feat:linguist', 'feat:shake-it-off'].includes(id))) {
        if (eligible(ix.feats.get(id), {id}, ctx, ix, 'feats')) ctx.feats.push({id, level: 1, automatic: true});
      }
    } else if (cl === 1) {
      if (l.startingFeat || cls.startingFeats.some(id => eligible(ix.feats.get(id), {id}, ctx, ix, 'feats'))) grant(l.startingFeat, 'feats', i, 'one multiclass starting feat', r => cls.startingFeats.includes(r?.id));
    } else if (l.startingFeat) issue(i, 'no multiclass starting feat is available');
    const newTraining = Math.max(0, modifier(ctx.scores.int) - priorInt);
    if (l.trainedSkills.length !== newTraining) issue(i, `choose ${newTraining} trained skills from Intelligence increases`);
    for (const id of l.trainedSkills.slice(0, newTraining)) {
      if (classSkills(ctx, ix).has(id) && !ctx.trained.has(id)) ctx.trained.add(id);
      else issue(i, 'additional trained skill is not eligible');
    }
    conditionalFocus();
    const slots = levelSlots(n, cl, species, cls, pack);
    for (const [j, slot] of slots.entries()) grant(l.feats[j], 'feats', i, slot.label, (r, s) => slot.kind === 'general' || (cls.bonusFeats.includes(r?.id) || cls.startingFeats.includes(r?.id)) && (!cls.bonusRestrictions[r?.id] || cls.bonusRestrictions[r.id].includes(s.choice)));
    if (l.feats.slice(slots.length).some(Boolean)) issue(i, 'extra feat selections are not available');
    if (cl % 2) grant(l.talent, 'talents', i, 'a talent', r => cls.talentTrees.includes(r?.tree));
    else if (l.talent) issue(i, 'a talent is not available at this class level');
    rows.push({number: n, classLevel: cl, cls, slots, scores: {...ctx.scores}, ctx: {...ctx, classLevels: new Map(ctx.classLevels), feats: [...ctx.feats], talents: [...ctx.talents], trained: new Set(ctx.trained)}});
  }
  // Conditional Skill Focus is a competence bonus, granted only while trained.
  conditionalFocus();
  if (ctx.trained.has('skill:use-the-force') && !ctx.feats.some(f => f.id === F('force-sensitivity'))) {
    ctx.trained.delete('skill:use-the-force');
    issues.push('Use the Force training requires Force Sensitivity');
  }
  return {ctx, rows, issues};
}

export function derive(c, pack) {
  const ix = indexPack(pack), species = ix.species.get(c.species);
  const {ctx, rows, issues} = progression(c, pack);
  const level = c.levels.length, half = Math.floor(level / 2), background=activeBackground(c,pack);
  const story=c.story;
  if(story?.kind==='destiny' && !story.id)issues.push('Choose a Destiny');
  if(story?.kind==='background') {
    if(!story.id)issues.push('Choose a Background');
    else if(!background)issues.push('Choose a Background outside your species’ homeworld');
    else {
      if(story.skills.filter(Boolean).length!==background.skillChoices)issues.push(`Choose ${background.skillChoices} Background class skill${background.skillChoices===1?'':'s'}`);
      if(background.bonusLanguages.length>1 && !background.bonusLanguages.includes(story.language))issues.push('Choose a Background language');
    }
  }
  const mods = Object.fromEntries(ABILITIES.map(a => [a, modifier(ctx.scores[a])]));
  const effects = [...ctx.feats.map(s => [ix.feats.get(s.id), s]), ...ctx.talents.map(s => [ix.talents.get(s.id), s])].flatMap(([r, s]) => r.effects.map(e => ({...e, selection: s})));
  const total = target => effects.filter(e => e.target === target).reduce((n, e) => n + e.amount * (e.perLevel ? level : 1), 0);
  const armorEntries = c.inventory.filter(e => e.equipped && ix.equipment.get(e.id).kind === 'armor');
  if (armorEntries.length > 1) issues.push('Only one suit of armor can be equipped');
  const armor = armorEntries.length ? ix.equipment.get(armorEntries[0].id) : null;
  const has = id => ctx.talents.some(t => t.id === `talent:${id}`);
  const proficientArmor = armor && ctx.feats.some(f => f.id === F(`armor-proficiency-${armor.category}`));
  const armorPenalty = armor && !proficientArmor ? pack.rules.armorPenalties[armor.category] : 0;
  let reflexBase = armor?.armorBonus ?? level;
  if (armor && proficientArmor && has('improved-armored-defense')) reflexBase = Math.max(armor.armorBonus, level + Math.floor(armor.armorBonus / 2));
  else if (armor && proficientArmor && has('armored-defense')) reflexBase = Math.max(level, armor.armorBonus);
  const dex = armor ? Math.min(mods.dex, armor.maxDex) : mods.dex;
  const condition = pack.rules.conditionPenalties[c.condition];
  const defenses = {}, breakdowns = {};
  for (const key of ['reflex', 'fortitude', 'will']) {
    const clsBonus = Math.max(0, ...[...ctx.classLevels.keys()].map(id => ix.classes.get(id).defenses[key] || 0));
    const base = key === 'reflex' ? reflexBase : level;
    const ability = key === 'reflex' ? dex : key === 'fortitude' ? mods.con : mods.wis;
    const sp = species.defenses[key] || 0;
    const equipment = key === 'fortitude' && proficientArmor ? armor.fortitudeBonus : 0;
    const size = key === 'reflex' ? pack.rules.sizeReflex[species.size] : 0;
    defenses[key] = 10 + base + ability + clsBonus + sp + equipment + size + total('defenses') + condition + c.modifiers[key];
    breakdowns[key] = `10 + ${base} ${key === 'reflex' && armor ? 'armor/level' : 'level'} + ${ability} ability + ${clsBonus} class + ${sp} species + ${equipment} equipment + ${size} size + ${total('defenses')} feats + ${condition} condition + ${c.modifiers[key]} misc`;
  }
  // Threshold uses Fortitude without the condition-track penalty.
  const threshold = defenses.fortitude - condition + pack.rules.sizeThreshold[species.size] + total('threshold') + c.modifiers.threshold;
  const hp = ix.classes.get(c.levels[0].classId).startingHP + mods.con + c.levels.slice(1).reduce((n, l) => n + Math.max(1, l.hpRoll + mods.con), 0) + total('hp') + c.modifiers.hp;
  const skills = pack.skills.map(s => {
    const trained = ctx.trained.has(s.id);
    const focus = Math.max(0, ...effects.filter(e => e.target === 'skillFocus' && e.selection.choice === s.id && trained).map(e => e.amount));
    const backgroundBonus=!trained && background?.relevantSkills.includes(s.id)?background.untrainedBonus:0;
    const equipment = proficientArmor ? armor.skillBonuses[s.id] || 0 : 0;
    const penalty = s.armorCheck ? armorPenalty : 0;
    return {...s, trained, focus, available: !(s.trainedOnly && !trained) && (s.id !== 'skill:use-the-force' || ctx.feats.some(f => f.id === F('force-sensitivity'))),
      total: half + mods[s.ability] + (trained ? pack.rules.trainingBonus : 0) + Math.max(focus,backgroundBonus) + equipment + penalty + condition,
      breakdown: `${half} half level + ${mods[s.ability]} ability + ${trained ? 5 : 0} training + ${focus} focus + ${backgroundBonus} background + ${equipment} equipment + ${penalty} armor + ${condition} condition`};
  });
  const attacks = c.inventory.filter(e => e.equipped && ix.equipment.get(e.id).kind === 'weapon').map(e => {
    const w = ix.equipment.get(e.id);
    const proficient = ctx.feats.some(f => ix.feats.get(f.id)?.weaponGroup === w.group);
    const focus = effects.filter(f => f.target === 'weaponFocus' && f.selection.choice === w.group).reduce((n, f) => n + f.amount, 0);
    const specialization = effects.filter(f => f.target === 'weaponSpecialization' && f.selection.choice === w.group).reduce((n, f) => n + f.amount, 0);
    const ability = w.mode === 'melee' ? mods.str : mods.dex;
    const light = pack.rules.weaponSizeOrder.indexOf(w.size) < pack.rules.weaponSizeOrder.indexOf(species.size);
    const strength = w.mode === 'melee' ? (e.twoHanded && !light && mods.str > 0 ? 2 * mods.str : mods.str) : 0;
    const damageBonus = half + strength + specialization + c.modifiers.damage + e.damageMod;
    return {...w, proficient, attack: ctx.bab + ability + focus + (proficient ? 0 : -5) + armorPenalty + condition + c.modifiers.attack + e.attackMod,
      damageBonus, damageDisplay: w.damage + (damageBonus ? signed(damageBonus) : ''),
      breakdown: `${ctx.bab} BAB + ${ability} ability + ${focus} focus + ${proficient ? 0 : -5} proficiency + ${armorPenalty} armor + ${condition} condition + ${c.modifiers.attack + e.attackMod} misc`};
  });
  const missingAssignments=c.abilityGeneration && Object.values(c.abilityGeneration.assign).some(i=>i===null);
  if (missingAssignments) issues.push('Assign all six ability scores');
  if (c.abilityMethod === 'standard' && !missingAssignments && [...Object.values(c.abilities)].sort((a,b) => a-b).join() !== [...pack.rules.standardArray].sort((a,b) => a-b).join()) issues.push('Standard package must use 15, 14, 13, 12, 10, 8 once each');
  const pointCost = (c.abilityMethod==='point-buy' && c.abilityGeneration ? c.abilityGeneration.pool : Object.values(c.abilities)).reduce((n, v) => n + (pack.rules.pointBuyCosts[v] ?? Infinity), 0);
  if (c.abilityMethod === 'point-buy' && pointCost > c.pointBudget) issues.push('Point-buy budget exceeded or a base score is outside 8–18');
  return {level, half, scores: ctx.scores, mods, bab: ctx.bab, defenses, breakdowns, threshold, hp, skills, attacks, ctx, rows, issues,
    speed: c.condition >= 4 ? Math.floor(species.speed / 2) : species.speed,
    incapacitated: c.condition === 5, forceMaximum: 5 + half, pointCost,
    weight: c.inventory.reduce((n,e) => n + ix.equipment.get(e.id).weight * e.quantity, 0),
    nextXP: level < 20 ? level * (level + 1) * 500 : null};
}
