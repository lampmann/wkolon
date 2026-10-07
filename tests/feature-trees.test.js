import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {featureGraph} from '../src/feature-trees.js';
import {newCharacter,progression,indexPack} from '../src/rules.js';
import {articleText} from '../src/wiki-content.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url)));
const opts=c=>({type:'talents',ctx:progression(c,pack).ctx,allowedIds:pack.talents.filter(r=>r.tree==='tree:awareness').map(r=>r.id),selected:null});
test('Awareness dependencies preserve conjunctions, possession and eligibility; future and pending selections confer no benefits',()=>{
 const c=newCharacter(pack);c.levels[0].classId='class:scout';let options=opts(c),m=featureGraph(pack,options);
 assert(m.nodes.get('talent:acute-senses|').available);assert(!m.nodes.get('talent:improved-initiative|').available);
 assert.equal(m.nodes.get('talent:reset-initiative|').parents.length,2);
 const reset=m.nodes.get('talent:reset-initiative|');assert(reset.parents.some(p=>p.key==='talent:improved-initiative|'));
 assert([...m.nodes.values()].some(n=>n.name==='Trained in Initiative'&&!n.main&&!n.owned));
 options.ctx.talents.push({id:'talent:acute-senses'});m=featureGraph(pack,options);assert(m.nodes.get('talent:acute-senses|').owned);assert(m.nodes.get('talent:improved-initiative|').available);assert(m.nodes.get('talent:keen-shot|').available);assert(!m.nodes.get('talent:reset-initiative|').available);
 options.ctx.talents.push({id:'talent:improved-initiative'});m=featureGraph(pack,options);assert(m.nodes.get('talent:uncanny-dodge-i|').available);assert(!m.nodes.get('talent:reset-initiative|').available);
 options.ctx.trained.add('skill:initiative');m=featureGraph(pack,options);assert(m.nodes.get('talent:reset-initiative|').available);
 options.allowedIds=[];m=featureGraph(pack,options);assert(!m.nodes.get('talent:reset-initiative|').available);
 const clean=newCharacter(pack);const ctx=progression(clean,pack).ctx;
 m=featureGraph(pack,{type:'feats',ctx,allowedIds:pack.feats.map(r=>r.id),selected:{id:'feat:skill-training',pending:true}});assert(!m.nodes.get('feat:skill-training|').owned);
});
test('feat families appear once with secondary variants and class bonus restrictions remain effective',()=>{
 const c=newCharacter(pack),ctx=progression(c,pack).ctx;
 const m=featureGraph(pack,{type:'feats',ctx,allowedIds:['feat:skill-focus'],restrictions:{'feat:skill-focus':['skill:pilot']}});
 assert.equal([...m.nodes.values()].filter(n=>n.main&&n.name==='Weapon Proficiency').length,1);
 assert(!m.nodes.get('feat:skill-focus|').available);ctx.trained.add('skill:initiative');assert(!featureGraph(pack,{type:'feats',ctx,allowedIds:['feat:skill-focus'],restrictions:{'feat:skill-focus':['skill:pilot']}}).nodes.get('feat:skill-focus|').available);
 ctx.trained.add('skill:pilot');assert(featureGraph(pack,{type:'feats',ctx,allowedIds:['feat:skill-focus'],restrictions:{'feat:skill-focus':['skill:pilot']}}).nodes.get('feat:skill-focus|').available);
});
test('every selectable feat and talent has complete pinned article text; talent sections do not spill into neighbours',()=>{
 for(const r of [...pack.feats,...pack.talents])assert(articleText(r.article).length>30,r.name);
 const r=indexPack(pack).talents.get('talent:reset-initiative'),text=articleText(r.article);assert(text.includes('Initiative +5'));assert(text.includes('Force Unleashed Campaign Guide'));assert(!text.includes('Damage Reduction'));
 const acute=articleText(indexPack(pack).talents.get('talent:acute-senses').article);assert(acute.includes('even if it is worse'));assert(!acute.includes('normal Speed'));
});
test('Force Sensitivity respects its wiki droid prerequisite and cannot unlock droid skill training',()=>{
 const fixture=structuredClone(pack);fixture.species.push({...fixture.species[0],id:'species:droid-fixture',isDroid:true});
 const c=newCharacter(fixture);c.species='species:droid-fixture';c.trainedSkills=['skill:use-the-force'];c.levels[0].feats=[{id:'feat:force-sensitivity'}];
 const d=progression(c,fixture);assert(!d.ctx.feats.some(f=>f.id==='feat:force-sensitivity'));assert(!d.ctx.trained.has('skill:use-the-force'));
 assert(!featureGraph(fixture,{type:'feats',ctx:d.ctx,allowedIds:['feat:force-sensitivity']}).nodes.get('feat:force-sensitivity|').available);
 const block=articleText(pack.talents.find(r=>r.name==='Block').article);assert(block.startsWith('Reference Book: Core Rulebook'));assert(!block.includes('Jedi Counseling Jedi Counseling'));
});
