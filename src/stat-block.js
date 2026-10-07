import {ABILITIES, indexPack, signed} from './rules.js';
import {TRAIT_FIELDS, backgroundLanguage} from './heroic-traits.js';
import {escapeHTML as escape} from './wiki-content.js';

// Formatting reference: Darth Vader, wiki revision 25962. All values come from
// the saved character and Saga derivation, never from the reference NPC.
export function renderStatBlock(c,d,pack){
 const ix=indexPack(pack),species=ix.species.get(c.species);
 const line=(label,value)=>value?`<p><b>${label}:</b> ${value}</p>`:'';
 const textLine=(label,value)=>line(label,escape(value));
 const featureName=(type,s)=>{
  const record=ix[type].get(s.id);
  return escape(record.name+(s.choice?` (${ix.skills.get(s.choice)?.name||s.choice.replaceAll('-',' ')})`:''));
 };
 const classes=[...d.ctx.classLevels].map(([id,n])=>`${escape(ix.classes.get(id).name)} ${n}`).join('/');
 const skill=id=>d.skills.find(s=>s.id==='skill:'+id);
 const languages=[...species.languages,backgroundLanguage(c,pack),c.languages].filter(Boolean).map(escape).join(', ');
 const points=[c.story?.kind==='destiny'?`<b>Destiny Points:</b> ${c.story.points}`:'',`<b>Force Points:</b> ${c.forcePoints}`,`<b>Dark Side Score:</b> ${c.darkSideScore||0}`].filter(Boolean).join('; ');
 const protection=c.protection||{dr:0,sr:0,srMax:0,drBypass:''};
 const condition=c.condition===5?`Helpless (${species.isDroid?'Disabled':'Unconscious'})`:c.condition?`${signed(pack.rules.conditionPenalties[c.condition])} Penalty${c.condition===4?'; Move at Half Speed':''}`:'';
 const attackText=(a,attackMod=0,damageMod=0)=>`${escape(a.name)} ${signed(a.attack+attackMod)} (${escape(a.damageDisplay)}${damageMod?signed(damageMod):''})`;
 const attacks=d.attacks.map(a=>line(a.mode==='melee'?'Melee':'Ranged',attackText(a))).join('');
 const routines=(c.routines||[]).filter(r=>r.steps.length).map(r=>line(escape(r.name||'Routine'),r.steps.map(s=>{
  const a=d.attacks.find(a=>a.uid===s.attackId);
  return `${s.count>1?s.count+' × ':''}${a?attackText(a,s.attackMod,s.damageMod):'Attack unavailable'}`;
 }).join(' and '))).join('');
 const story=c.story?.kind!=='none'&&ix[c.story?.kind==='destiny'?'destinies':'backgrounds']?.get(c.story?.id);
 const traits=TRAIT_FIELDS.filter(([key])=>c.heroicTraits?.[key]).map(([key,label])=>textLine(label,c.heroicTraits[key])).join('');
 return `<article class="stat-block"><h1>${escape(c.name||'Unnamed hero')} <span>(CL ${d.level})</span></h1>
 <p>${escape(species.size.replace(/^./,ch=>ch.toUpperCase()))} ${escape(species.name)} ${classes}</p>
 <p>${points}</p>${line('Initiative',signed(skill('initiative').total)+'; <b>Senses:</b> Perception '+signed(skill('perception').total))}${line('Languages',languages)}
 <h2>Defenses</h2><p><b>Reflex Defense:</b> ${d.defenses.reflex}, <b>Fortitude Defense:</b> ${d.defenses.fortitude}, <b>Will Defense:</b> ${d.defenses.will}</p>
 <p><b>Hit Points:</b> ${c.currentHP??d.hp}/${d.hp}; <b>Damage Threshold:</b> ${d.threshold}${protection.dr?`; <b>DR:</b> ${protection.dr}${protection.drBypass?' ('+escape(protection.drBypass)+')':''}`:''}${protection.srMax?`; <b>SR:</b> ${protection.sr}/${protection.srMax}`:''}</p>
 ${textLine('Condition Track',condition)}
 <h2>Offense</h2>${line('Speed',d.speed+' Squares')}${attacks}${routines}${line('Base Attack Bonus',signed(d.bab))}
 <h2>Base Stats</h2>${line('Abilities',ABILITIES.map(a=>`${a[0].toUpperCase()+a.slice(1)} ${d.scores[a]}`).join(', '))}
 ${line('Talents',d.ctx.talents.map(s=>featureName('talents',s)).join(', '))}${line('Feats',d.ctx.feats.map(s=>featureName('feats',s)).join(', '))}
 ${line('Skills',d.skills.filter(s=>s.trained&&s.available).map(s=>`${escape(s.name)} ${signed(s.total)}`).join(', '))}
 ${line('Possessions',c.inventory.map(e=>`${escape(ix.equipment.get(e.id).name)}${e.quantity>1?' (×'+e.quantity+')':''}`).concat(c.credits?`${c.credits.toLocaleString()} Credits`:[]).join(', '))}
 ${line('XP',(c.xp||0).toLocaleString())}${story?textLine(c.story.kind==='destiny'?'Destiny':'Background',story.name):''}${c.story?.kind==='destiny'?textLine('Destiny Details',c.story.details):''}
 ${traits?`<h2>Heroic Traits</h2>${traits}`:''}${textLine('Notes',c.notes)}
 ${d.issues.length?textLine('Unresolved Choices',d.issues.join('; ')):''}</article>`;
}
