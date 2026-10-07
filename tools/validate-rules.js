import {WIKI_TAGS, wikiURL} from '../src/wiki-content.js';
import fs from 'node:fs';
import {ABILITIES, GROUPS, indexPack} from '../src/rules.js';
import assert from 'node:assert/strict';

export function validatePack(p) {
  assert.equal(p.schemaVersion, 1);
  for (const k of ['id','version','name']) assert.equal(typeof p[k], 'string', k);
  for (const k of ['species','classes','skills','feats','talents','equipment','sources']) assert(Array.isArray(p[k]), k);
  assert(p.license && p.rules && p.sources.length);
  const ix = indexPack(p), ids = new Set(), sources = new Set(p.sources.map(s => s.id));
  for (const s of p.sources) {
    assert(Number.isInteger(s.revision) && s.revision > 0);
    assert(!Number.isNaN(Date.parse(s.timestamp)));
    for (const k of ['url','history']) assert.equal(new URL(s[k]).hostname, 'swse.miraheze.org');
  }
  function requireRef(collection, id) { assert(ix[collection].has(id), `Unknown ${collection} reference: ${id}`); }
  function prerequisite(r) {
    if (['all','any'].includes(r.kind)) { assert(Array.isArray(r.requirements)); r.requirements.forEach(prerequisite); return; }
    assert(['ability','feat','talent','trained','untrained','classSkill','proficientChoice','focusChoice','bab','nonDroid'].includes(r.kind), `Unsupported prerequisite ${r.kind}`);
    if (r.kind === 'ability') { assert(ABILITIES.includes(r.value)); assert(Number.isInteger(r.min)); }
    if (r.kind === 'bab') assert(Number.isInteger(r.min));
    if (r.kind === 'feat') requireRef('feats',r.value);
    if (r.kind === 'talent') requireRef('talents',r.value);
    if (['trained','untrained','classSkill'].includes(r.kind) && r.value !== '$choice') requireRef('skills',r.value);
  }
  for (const key of ['species','classes','skills','feats','talents','equipment','destinies','backgrounds','rulePages']) for (const r of p[key]||[]) {
    assert(!ids.has(r.id), `Duplicate ID ${r.id}`); ids.add(r.id);
    assert(/^[a-z]+:[a-z0-9-]+$/.test(r.id)); assert.equal(typeof r.name,'string'); assert(sources.has(r.sourceId), `Missing source ${r.id}`);
    if(r.article !== undefined) {
      assert(sources.has(r.article.sourceId),`Missing article source ${r.id}`);
      assert(Object.keys(r.article).every(k=>['sourceId','blocks'].includes(k)));
      assert(Array.isArray(r.article.blocks));let count=0;
      function node(n,depth=0) {
        assert(++count<=50000 && depth<=40,'Article too large');
        if(typeof n==='string')return;
        assert(n && WIKI_TAGS.has(n.tag) && Array.isArray(n.children),'Invalid article node');
        const allowed=['tag','children',...(n.tag==='a'?['href','ruleId']:[]),...(['td','th'].includes(n.tag)?['colspan','rowspan']:[])];
        assert(Object.keys(n).every(k=>allowed.includes(k)),'Invalid article attribute');
        if(n.tag==='a'){assert(wikiURL(n.href),'Invalid article URL');if(n.ruleId)assert((p.rulePages||[]).some(r=>r.id===n.ruleId),'Unknown article rule');}
        for(const k of ['colspan','rowspan'])if(k in n)assert(Number.isInteger(n[k]) && n[k]>=1 && n[k]<=30);
        n.children.forEach(child=>node(child,depth+1));
      }
      r.article.blocks.forEach(n=>node(n));
    }
    if (r.reference !== undefined) {
      assert(Array.isArray(r.reference));
      for(const entry of r.reference) {
        assert.equal(typeof entry.heading,'string');assert.equal(typeof entry.text,'string');
        assert(sources.has(entry.sourceId),`Missing reference source ${r.id}`);
        assert(Object.keys(entry).every(k=>['heading','text','sourceId'].includes(k)));
      }
    }
    if (key === 'species') {
      if (r.isDroid !== undefined) assert.equal(typeof r.isDroid,'boolean',`Invalid droid classification: ${r.id}`);
      assert(p.rules.sizeReflex[r.size] !== undefined && Number.isInteger(r.speed));
      for(const [k,v] of Object.entries(r.abilityAdjustments)) assert(ABILITIES.includes(k) && Number.isInteger(v));
      assert(Array.isArray(r.languages) && Array.isArray(r.reminders));
      if(r.conditionalFocus) requireRef('skills',r.conditionalFocus);
      for(const key of ['startingFeats','excludedStartingFeats'])if(r[key]){assert(Array.isArray(r[key]));r[key].forEach(id=>requireRef('feats',id));}
      if(r.speeds){assert(Object.keys(r.speeds).every(key=>/^[a-z-]+$/.test(key)));assert(Object.values(r.speeds).every(n=>Number.isInteger(n)&&n>=0));}
    }
    if (key === 'classes') {
      assert.equal(r.bab.length,20); assert(r.bab.every(Number.isInteger)); assert([6,8,10].includes(r.hitDie));
      assert.equal(r.startingHP,r.hitDie*3); assert(Number.isInteger(r.trainedSkills));
      r.skills.forEach(id=>requireRef('skills',id));
      [...r.startingFeats,...r.bonusFeats].forEach(id=>requireRef('feats',id));
      assert(r.talentTrees.length > 0);
    }
    if (key === 'skills') assert(ABILITIES.includes(r.ability) && typeof r.trainedOnly==='boolean' && typeof r.armorCheck==='boolean');
    if (['feats','talents'].includes(key)) {
      prerequisite(r.prerequisite); assert(['never','choice','stack'].includes(r.repeat));
      if(r.choiceType) assert(['skill','weaponGroup'].includes(r.choiceType));
      assert(Array.isArray(r.effects) && typeof r.reminder==='string');
      for(const e of r.effects) { assert(['defenses','hp','threshold','skillFocus','skillTraining','weaponFocus','weaponSpecialization'].includes(e.target)); assert(Number.isFinite(e.amount)); assert(['untyped','competence'].includes(e.type)); }
    }
    if(key==='backgrounds') {
      assert(['event','occupation','planet'].includes(r.category));
      assert.equal(r.skillChoices,r.category==='planet'?2:1);
      assert.equal(r.untrainedBonus,r.category==='occupation'?2:0);
      assert(Array.isArray(r.relevantSkills) && r.relevantSkills.length>=3 && new Set(r.relevantSkills).size===r.relevantSkills.length);
      r.relevantSkills.forEach(id=>requireRef('skills',id));
      assert(Array.isArray(r.bonusLanguages) && r.bonusLanguages.every(language=>typeof language==='string'));
      assert(r.category==='planet'?r.bonusLanguages.length>0:r.bonusLanguages.length===0);
      assert(Array.isArray(r.excludedSpecies));r.excludedSpecies.forEach(id=>requireRef('species',id));
      if(r.conditionalFocus)requireRef('skills',r.conditionalFocus);
    }
    if (key === 'equipment') {
      assert(['weapon','armor','gear'].includes(r.kind)); assert(Number.isFinite(r.cost) && r.cost>=0 && Number.isFinite(r.weight) && r.weight>=0);
      if(r.kind==='weapon') assert(p.rules.weaponSizeOrder.includes(r.size) && GROUPS.includes(r.group) && /^\d+d\d+$/.test(r.damage) && ['melee','ranged'].includes(r.mode));
      if(r.kind==='armor') { assert(p.rules.armorPenalties[r.category]!==undefined); for(const k of ['armorBonus','fortitudeBonus','maxDex']) assert(Number.isInteger(r[k])); for(const id of Object.keys(r.skillBonuses)) requireRef('skills',id); }
    }
  }
  if(p.heroicTraits) {
    assert(Array.isArray(p.heroicTraits.sourceIds));p.heroicTraits.sourceIds.forEach(id=>assert(sources.has(id)));
    for(const key of ['eras','heroTypes'])assert(Array.isArray(p.heroicTraits[key]) && p.heroicTraits[key].every(value=>typeof value==='string'));
  }
  return p;
}

if (process.argv[1]?.endsWith('validate-rules.js')) {
  const p=validatePack(JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url),'utf8')));
  console.log(`Validated ${p.id} ${p.version}: ${p.species.length} species, ${p.classes.length} classes, ${p.skills.length} skills, ${p.feats.length} feats, ${p.talents.length} talents, ${p.equipment.length} equipment`);
}
