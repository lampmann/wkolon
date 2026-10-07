// Plain local references. Typed fields remain the calculation authority.
import {indexPack, signed} from './rules.js';
const title = s => s.replaceAll('-', ' ').replace(/\b\w/g,c=>c.toUpperCase());
export function referenceEntries(r, pack, selection) {
  const ix=indexPack(pack), entries=[];
  const add=(heading,text)=>{if(text) entries.push({heading,text:String(text)});};
  const name=id=>Object.values(ix).map(map=>map.get(id)?.name).find(Boolean)||title(id.replace(/^[^:]+:/,''));
  const target=v=>v==='$choice'?(selection?.choice?name(selection.choice):(r.choiceType==='skill'?'chosen skill':'chosen weapon group')):name(v);
  function prerequisite(p) {
    switch(p.kind) {
      case 'all': return p.requirements.map(prerequisite).filter(Boolean).join('; ');
      case 'any': return p.requirements.map(prerequisite).filter(Boolean).join(' or ');
      case 'ability': return `${p.value.toUpperCase()} ${p.min}`;
      case 'bab': return `Base attack +${p.min}`;
      case 'nonDroid': return 'Cannot be a Droid';
      case 'feat': case 'talent': return target(p.value);
      case 'trained': return `Trained in ${target(p.value)}`;
      case 'untrained': return `Untrained in ${target(p.value)}`;
      case 'classSkill': return `${target(p.value)} is a class skill`;
      case 'proficientChoice': return `Proficient with ${target(p.value)}`;
      case 'focusChoice': return `Weapon Focus (${target(p.value)})`;
      default: throw new Error(`Unsupported prerequisite: ${p.kind}`);
    }
  }
  const bonuses=obj=>Object.entries(obj).map(([k,v])=>`${title(k)} ${signed(v)}`).join('; ');
  if(r.id.startsWith('species:')) {
    add('Abilities',Object.entries(r.abilityAdjustments).map(([a,n])=>`${a.toUpperCase()} ${signed(n)}`).join('; '));
    add('Size / speed',`${title(r.size)}; ${r.speed} squares`);
    add('Defenses',bonuses(r.defenses));
    add('Languages',r.languages.join(', '));
    if(r.bonusFeats) add('Bonus feat',`${r.bonusFeats} at 1st level`);
    if(r.bonusSkills) add('Bonus training',`${r.bonusSkills} additional class skill at 1st level`);
    if(r.conditionalFocus) add('Skill Focus',`${name(r.conditionalFocus)} gains +${pack.rules.focusBonus} competence when trained; competence bonuses do not stack.`);
    r.reminders.forEach(text=>add('Trait',text));
  }
  if(r.id.startsWith('class:')) {
    add('Hit points',`${r.startingHP} + CON modifier at 1st level; d${r.hitDie} + CON modifier on later class levels (minimum 1 HP per level).`);
    add('Trained skills',`${r.trainedSkills} + INT modifier (minimum 1); species bonuses apply separately.`);
    add('Class skills',r.skills.map(name).join(', '));
    add('Defenses',`${bonuses(r.defenses)}; use the highest class bonus for each defense.`);
    add('Starting feats',r.startingFeats.map(id=>{const f=ix.feats.get(id), req=prerequisite(f.prerequisite);return `${f.name}${req?` (requires ${req})`:''}`;}).join('; '));
    add('Multiclassing','Gain one eligible starting feat when entering this class; its class skills become available. No additional starting skill pool.');
    add('Talents',`Odd class levels: one talent from ${r.talentTrees.map(name).join(', ')}.`);
    add('Bonus feats',`Even class levels: ${r.bonusFeats.map(id=>name(id)+(r.bonusRestrictions[id]?` (${r.bonusRestrictions[id].map(title).join(', ')})`:'')).join(', ')}.`);
    add('Base attack',r.bab.map((n,i)=>`${i+1}: ${signed(n)}`).join('; '));
    add('Starting credits',`${r.credits.dice}d${r.credits.sides} × ${r.credits.multiplier}`);
  }
  if(r.id.startsWith('skill:')) {
    add('Check',`d20 + half heroic level (round down) + ${r.ability.toUpperCase()} modifier + ${pack.rules.trainingBonus} if trained + other modifiers.`);
    if(r.trainedOnly) add('Training','Training required.');
    if(r.armorCheck) add('Armor','Without proficiency: light −2, medium −5, heavy −10.');
    add('Use',r.reminder);
  }
  if(r.id.startsWith('background:')) {
    add('Relevant Skills',r.relevantSkills.map(name).join(', '));
    add('Bonus Language',r.bonusLanguages.join(' or '));
  }
  if(r.prerequisite) {
    add('Requires',prerequisite(r.prerequisite));
    add('Effect',r.reminder);
    if(r.repeat==='choice') add('Repeat','Choose a different option each time.');
    if(r.repeat==='stack') add('Repeat','May be selected again; benefits accumulate.');
  }
  if(r.kind) {
    add('Cost / weight',`${r.cost.toLocaleString('en-US')} cr; ${r.weight} kg`);
    if(r.kind==='weapon') {
      add('Weapon',`${title(r.group)}; ${title(r.size)}; ${r.mode}`);
      add('Damage',`${r.damage} ${r.damageType.toLowerCase()}`);
      add('Attack','d20 + base attack + STR (melee) or DEX (ranged) + other modifiers; −5 without proficiency.');
      add('Damage bonus','Half heroic level (round down); melee adds STR, doubled for a positive STR modifier with two hands.');
    }
    if(r.kind==='armor') {
      add('Armor',`${title(r.category)}; Reflex ${signed(r.armorBonus)}; Fortitude ${signed(r.fortitudeBonus)} with proficiency; maximum DEX ${signed(r.maxDex)}.`);
      add('Reflex','Armor replaces the heroic level bonus unless an applicable talent changes this.');
      if(r.skillBonuses && Object.keys(r.skillBonuses).length) add('Equipment bonuses',Object.entries(r.skillBonuses).map(([id,n])=>`${name(id)} ${signed(n)} with proficiency`).join('; '));
    }
  }
  for(const entry of r.reference||[]) add(entry.heading,entry.text);
  return entries;
}
