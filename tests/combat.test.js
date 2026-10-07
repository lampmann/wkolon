import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {emptyProtection,prepareCombatState,protectedDamage,rollRoutine} from '../src/combat.js';
import {newCharacter,derive,validateCharacter} from '../src/rules.js';
import {createStore,STORAGE_KEY} from '../src/persistence.js';
import {renderStatBlock} from '../src/stat-block.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url),'utf8'));
const rules=pack.rules.combat;
const item=(id)=>({id:'equipment:'+id,quantity:1,equipped:true,twoHanded:false,attackMod:0,damageMod:0,uid:crypto.randomUUID()});
const step=(attackId,more={})=>({id:crypto.randomUUID(),attackId,count:1,attackMod:0,damageMod:0,...more});
const routine=(steps)=>({id:crypto.randomUUID(),name:'Volley',steps});

test('SR precedes persistent DR and falls only when exceeded, even if DR absorbs the rest',()=>{
 const p={...emptyProtection(),sr:20,srMax:20,dr:5};
 assert.deepEqual(protectedDamage(p,20,rules),{hpDamage:0,srBlocked:20,drBlocked:0,srAfter:20});
 assert.deepEqual(protectedDamage(p,21,rules),{hpDamage:0,srBlocked:20,drBlocked:1,srAfter:15});
 assert.deepEqual(protectedDamage(p,30,rules),{hpDamage:5,srBlocked:20,drBlocked:5,srAfter:15});
 assert.equal(protectedDamage(p,30,rules,true).hpDamage,10);
 assert.equal(p.dr,5);assert.equal(p.sr,20,'calculation does not mutate state');
 p.sr=3;assert.equal(protectedDamage(p,100,rules).srAfter,0);
 p.sr=0;assert.equal(protectedDamage(p,4,rules).hpDamage,0);assert.equal(protectedDamage(p,6,rules).hpDamage,1);
 assert.throws(()=>protectedDamage(p,-1,rules));assert.throws(()=>protectedDamage(p,1.5,rules));
});

test('routines resolve natural misses, full-damage criticals and cumulative Reflex intervals',()=>{
 const a={uid:crypto.randomUUID(),name:'Blaster Pistol',attack:10,damageDisplay:'3d6+2'};
 const r=routine([step(a.uid,{count:4,attackMod:-2,damageMod:3})]);
 const values=[{value:9,d20:[1]},{value:28,d20:[20]},{value:30},{value:18,d20:[10]},{value:12},{value:23,d20:[15]},{value:15}];
 const calls=[];
 const roller=expr=>{calls.push(expr);return {display:'dice',coeffs:[],rollId:calls.length,...values.shift()};};
 const result=rollRoutine(r,[a],rules,roller);
 assert.equal(result.results[0].damage,0);assert.equal(result.results[0].damageRoll,null);
 assert.equal(calls[2],'(3d6+2+3)*2');
 assert.deepEqual(result.rows,[{lo:24,hi:null,damage:30},{lo:19,hi:23,damage:45},{lo:null,hi:18,damage:57}]);
 assert(result.html.includes('Reflex'));assert(result.html.includes('<details>'));assert.equal(values.length,0);
 const negative=rollRoutine(routine([step(a.uid)]),[a],rules,expr=>({value:expr.startsWith('1d20')?-2:5,d20:[10],display:'dice',coeffs:[],rollId:1}));
 assert.deepEqual(negative.rows,[{lo:-1,hi:null,damage:0},{lo:null,hi:-2,damage:5}]);
 const min=rollRoutine(routine([step(a.uid)]),[a],rules,expr=>({value:expr.startsWith('1d20')?20:-5,d20:[20],display:'dice',coeffs:[],rollId:1}));
 assert.equal(min.results[0].damage,2);
});

test('missing attacks preflight the entire routine before rolling and references follow physical items',()=>{
 const c=newCharacter(pack);c.inventory=[item('blaster-pistol'),item('knife')];
 const r=routine([step(c.inventory[1].uid),step(crypto.randomUUID())]);
 let calls=0;assert.throws(()=>rollRoutine(r,derive(c,pack).attacks,rules,()=>calls++),/unavailable/);assert.equal(calls,0);
 r.steps.pop();c.inventory.reverse();assert.equal(derive(c,pack).attacks.find(a=>a.uid===r.steps[0].attackId).name,'Knife');
 c.inventory[0].equipped=false;assert.throws(()=>rollRoutine(r,derive(c,pack).attacks,rules),/unavailable/);
});

test('old characters migrate without losing data; import/export preserves routine links and validates before mutation',()=>{
 globalThis.window={addEventListener(){}};globalThis.document={addEventListener(){}};
 const c=newCharacter(pack);c.name='Legacy';c.inventory=[item('knife')];delete c.inventory[0].uid;
 for(const key of ['protection','routines','xp','darkSideScore'])delete c[key];
 const data=new Map([[STORAGE_KEY,JSON.stringify({schemaVersion:1,activeId:c.id,characters:[c]})]]);
 const storage={getItem:key=>data.get(key),setItem:(key,value)=>data.set(key,value)};
 const store=createStore(pack,()=>{},storage),active=store.current();
 assert.deepEqual(active.protection,emptyProtection());assert.equal(active.darkSideScore,0);assert(active.inventory[0].uid);
 active.routines=[routine([step(active.inventory[0].uid)])];active.protection={dr:5,drBypass:'Energy',sr:15,srMax:20};active.xp=1234;active.darkSideScore=4;
 store.flush();const id=active.inventory[0].uid;
 const restored=createStore(pack,()=>{},storage).current();assert.equal(restored.inventory[0].uid,id);
 const imported=store.import(JSON.stringify(restored));assert.notEqual(imported.id,restored.id);assert.equal(imported.routines[0].steps[0].attackId,id);
 const size=store.roster.characters.length;
 assert.throws(()=>store.import(JSON.stringify({...restored,protection:{...restored.protection,sr:21}})),/DR or SR/);assert.equal(store.roster.characters.length,size);
 const duplicate=structuredClone(restored);duplicate.inventory.push({...duplicate.inventory[0]});assert.throws(()=>validateCharacter(duplicate,pack),/inventory IDs/);
 const tooMany=structuredClone(restored);tooMany.routines[0].steps=Array.from({length:6},()=>step(id,{count:20}));assert.throws(()=>validateCharacter(tooMany,pack),/100 attacks/);
});

test('XP progression and Force Point capacity use heroic level while DSS capacity uses Wisdom score',()=>{
 const c=prepareCombatState(newCharacter(pack));let d=derive(c,pack);assert.equal(d.nextXP,1000);assert.equal(d.forceMaximum,5);
 c.levels.push({...structuredClone(c.levels[0]),hpRoll:5});d=derive(c,pack);assert.equal(d.nextXP,3000);assert.equal(d.forceMaximum,6);
 c.abilities.wis=18;assert.equal(derive(c,pack).scores.wis,18);
});

test('print stat block uses current Saga values, eligible features and safe text instead of editable sheet controls',()=>{
 const c=prepareCombatState(newCharacter(pack));c.name='<script>Vader</script>';c.inventory=[item('blaster-pistol')];
 c.condition=4;c.currentHP=7;c.protection={dr:5,drBypass:'<Energy>',sr:15,srMax:20};c.routines=[routine([step(c.inventory[0].uid,{count:2,attackMod:-5,damageMod:2})])];
 c.levels[0].feats=[{id:'feat:toughness'}];c.levels[0].talent={id:'talent:fool-s-luck'};
 const d=derive(c,pack),html=renderStatBlock(c,d,pack);
 for(const heading of ['Defenses','Offense','Base Stats'])assert(html.includes('<h2>'+heading+'</h2>'));
 assert(html.includes('Hit Points:</b> 7/'+d.hp));assert(html.includes('Damage Threshold:</b> '+d.threshold));assert(html.includes('SR:</b> 15/20'));assert(html.includes('Speed:</b> 3 Squares'));
 assert(html.includes('2 × Blaster Pistol '+(d.attacks[0].attack-5)));assert(html.includes("Fool&#39;s Luck"));assert(html.includes('&lt;script&gt;'));
 assert(!html.includes('<script>'));assert(!html.includes('<input'));assert(!html.includes('<button'));
});
