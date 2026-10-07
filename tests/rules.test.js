import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newCharacter, derive, validateCharacter, progression, modifier} from '../src/rules.js';
import {validatePack} from '../tools/validate-rules.js';
const p=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url),'utf8'));
const skill=n=>`skill:${n}`;
const feat=id=>({id:`feat:${id}`});
const talent=id=>({id:`talent:${id}`});
function hero(cls='soldier') {
  const c=newCharacter(p); c.levels[0].classId=`class:${cls}`;
  c.trainedSkills=['endurance','initiative','mechanics','perception','pilot'].map(skill);
  c.levels[0].feats=[feat('improved-defenses'),feat('toughness')];
  c.levels[0].talent=talent('armored-defense');
  return c;
}
function level(c,cls,options={}) { c.levels.push({classId:`class:${cls}`,hpRoll:6,feats:[],talent:null,startingFeat:null,abilityIncreases:[],trainedSkills:[],...options}); }
const item=(id,more={})=>({id:`equipment:${id}`,quantity:1,equipped:true,twoHanded:false,attackMod:0,damageMod:0,...more});

test('reviewed pack validates all references and supported operations',()=>{validatePack(p);});
test('complete level-one Human Soldier statistics',()=>{
  const c=hero(), d=derive(c,p);
  assert.deepEqual(d.issues,[]); assert.equal(d.hp,32); assert.equal(d.bab,1);
  assert.deepEqual(d.defenses,{reflex:15,fortitude:15,will:12});
  assert.equal(d.threshold,15); assert.equal(d.skills.find(s=>s.id===skill('pilot')).total,7);
});
test('ability modifiers floor negative odd scores',()=>{assert.equal(modifier(9),-1);assert.equal(modifier(7),-2);});
test('multiclass BAB floors separately; highest class defense bonus wins',()=>{
  const c=hero('noble'); c.levels[0].feats=[];c.levels[0].talent=null;c.trainedSkills=[];
  level(c,'scout',{hpRoll:5,startingFeat:feat('weapon-proficiency-rifles')});
  const d=derive(c,p);assert.equal(d.bab,0);assert.deepEqual(d.defenses,{reflex:16,fortitude:14,will:14});
  level(c,'soldier',{startingFeat:feat('armor-proficiency-light')});
  assert.equal(derive(c,p).bab,1);assert.equal(derive(c,p).defenses.fortitude,16);
  assert(!derive(c,p).ctx.feats.some(f=>f.id==='feat:armor-proficiency-medium'));
});
test('armor replaces level, respects max Dexterity, and requires proficiency for equipment bonuses',()=>{
  const c=hero();c.inventory=[item('stormtrooper-armor')];
  c.levels[0].talent=null;
  let d=derive(c,p);assert.equal(d.defenses.reflex,20);assert.equal(d.defenses.fortitude,17);assert.equal(d.skills.find(s=>s.id===skill('perception')).total,7);
  c.levels[0].classId='class:scoundrel';
  d=derive(c,p);assert.equal(d.defenses.fortitude,13);assert.equal(d.skills.find(s=>s.id===skill('initiative')).total,5);
  c.abilities.dex=18; d=derive(c,p);assert.equal(d.defenses.reflex,22);
});
test('Armored Defense and Improved Armored Defense use separate comparisons',()=>{
  const c=hero();c.inventory=[item('blast-helmet-and-vest')];
  for(let i=2;i<=7;i++)level(c,'soldier',{talent:i===3?talent('improved-armored-defense'):null});
  let d=derive(c,p);assert.equal(d.defenses.reflex,22); // 10 + (7 + 1) + 2 dex + 1 class + 1 feat
  c.levels[2].talent=null;d=derive(c,p);assert.equal(d.defenses.reflex,21);
});
test('species modifiers and conditional competence bonuses never stack',()=>{
  const c=hero('noble');c.species='species:bothan';c.trainedSkills=[skill('gather-information')];
  c.levels[0].feats=[{id:'feat:skill-focus',choice:skill('gather-information')}];c.levels[0].talent=null;
  const d=derive(c,p);assert.equal(d.mods.dex,3);assert.equal(d.mods.con,0);assert.equal(d.defenses.will,15);
  assert.equal(d.skills.find(s=>s.id===skill('gather-information')).focus,5);
  assert(d.issues.some(s=>s.includes('Skill Focus is not eligible')));
});
test('future talents cannot satisfy earlier prerequisites',()=>{
  const c=hero('scout');c.levels[0].talent=talent('improved-initiative');
  level(c,'scout',{hpRoll:5});level(c,'scout',{hpRoll:5,talent:talent('acute-senses')});
  const d=derive(c,p);assert(!d.ctx.talents.some(t=>t.id==='talent:improved-initiative'));assert(d.issues.some(s=>s.startsWith('Level 1: Improved Initiative')));
});
test('feature history interleaves feats and talents by acquisition and records conditional grants at their earned level',()=>{
  const c=hero('noble');c.species='species:bothan';c.trainedSkills=[skill('persuasion')];
  c.levels[0].feats=[feat('toughness')];c.levels[0].talent=talent('born-leader');
  level(c,'noble',{feats:[feat('skill-training')].map(s=>({...s,choice:skill('gather-information')}))});
  level(c,'noble',{feats:[feat('improved-defenses')],talent:talent('inspire-confidence')});
  const d=progression(c,p),chosen=d.ctx.features.filter(f=>!f.selection.automatic).map(f=>[f.selection.id,f.selection.level]);
  assert.deepEqual(chosen,[['feat:toughness',1],['talent:born-leader',1],['feat:skill-training',2],['feat:improved-defenses',3],['talent:inspire-confidence',3]]);
  const focus=d.ctx.features.find(f=>f.selection.id==='feat:skill-focus');
  assert.equal(focus.selection.level,2);assert.equal(focus.selection.choice,skill('gather-information'));
  assert(!d.rows[0].ctx.features.some(f=>f.selection.id==='feat:skill-focus'));
});
test('heroic feats and class bonus feats use different schedules',()=>{
  const c=hero();level(c,'soldier',{feats:[feat('improved-damage-threshold')]});level(c,'scout',{hpRoll:5,startingFeat:feat('shake-it-off'),feats:[feat('linguist')],talent:talent('acute-senses')});
  const d=derive(c,p);assert.equal(d.rows[1].slots[0].kind,'bonus');assert.equal(d.rows[2].slots[0].kind,'general');
  assert(d.issues.some(s=>s.includes('Improved Damage Threshold is not eligible')));
  assert(!d.ctx.feats.some(s=>s.id==='feat:improved-damage-threshold'));
});
test('Constitution and Intelligence improvements apply retroactively; two distinct abilities required',()=>{
  const c=hero();c.abilities.con=13;c.abilities.int=13;
  level(c,'soldier');level(c,'soldier',{talent:talent('improved-armored-defense')});
  level(c,'soldier',{abilityIncreases:['con','int'],trainedSkills:[skill('swim')]});
  const d=derive(c,p);assert.equal(d.hp,60);assert.equal(d.mods.con,2);assert(d.ctx.trained.has(skill('swim')));
  c.levels[3].abilityIncreases=['con','con'];assert.equal(derive(c,p).mods.con,1);assert(derive(c,p).issues.some(s=>s.includes('two different abilities')));
});
test('attack proficiency, half-level damage, positive doubled Strength, and armor penalties',()=>{
  const c=hero();c.inventory=[item('blaster-pistol'),item('knife',{twoHanded:true}),item('lightsaber',{twoHanded:true})];
  let d=derive(c,p);assert.equal(d.attacks[0].attack,3);assert.equal(d.attacks[1].damageDisplay,'1d4+2');assert.equal(d.attacks[2].attack,-2);assert.equal(d.attacks[2].damageDisplay,'2d8+4');
  level(c,'soldier');d=derive(c,p);assert.equal(d.attacks[0].damageDisplay,'3d6+1');
});
test('condition changes checks and defenses without reducing damage threshold',()=>{
  const c=hero(), base=derive(c,p);c.condition=4;const d=derive(c,p);
  assert.equal(d.defenses.fortitude,base.defenses.fortitude-10);assert.equal(d.threshold,base.threshold);assert.equal(d.speed,3);
});
test('Force Sensitivity grants Use the Force as a class skill to other classes',()=>{
  const c=hero('noble');c.levels[0].feats=[feat('force-sensitivity')];c.levels[0].talent=null;c.trainedSkills=[skill('use-the-force')];
  assert(progression(c,p).ctx.trained.has(skill('use-the-force')));
  c.levels[0].feats=[];assert(!progression(c,p).ctx.trained.has(skill('use-the-force')));
});
test('JSON imports reject wrong versions and malformed nested values; valid drafts roundtrip',()=>{
  const c=hero();assert.equal(validateCharacter(JSON.parse(JSON.stringify(c)),p).id,c.id);
  assert.throws(()=>validateCharacter({...c,inventory:[{id:'equipment:knife',quantity:'1'}]},p));
  assert.throws(()=>validateCharacter({...c,ruleset:{id:'swse-core',version:'99'}},p));
  assert.throws(()=>validateCharacter({...c,levels:[{...c.levels[0],classId:'class:unknown'}]},p));
  level(c,'soldier');level(c,'soldier');level(c,'soldier',{abilityIncreases:['','dex']});validateCharacter(c,p);assert(derive(c,p).issues.length);
});

test('multiclass starting-feat choice can be skipped when all starting feats are known',()=>{
  const c=hero();c.levels[0].feats=[feat('shake-it-off'),feat('toughness')];
  level(c,'scout',{hpRoll:5,talent:talent('acute-senses')});
  assert.deepEqual(derive(c,p).issues,[]);
});
