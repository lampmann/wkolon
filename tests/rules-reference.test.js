import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {referenceEntries} from '../src/rules-reference.js';
import {validatePack} from '../tools/validate-rules.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url)));
test('local feat prerequisites resolve a secondary skill choice',()=>{
 const feat=pack.feats.find(r=>r.id==='feat:skill-focus');
 const entries=referenceEntries(feat,pack,{id:feat.id,choice:'skill:pilot'});
 assert(entries.some(e=>e.heading==='Requires' && e.text.includes('Trained in Pilot')));
 assert(entries.some(e=>e.heading==='Effect' && e.text.includes('+5 competence')));
});
test('local references contain species grants, class progression and armor mechanics',()=>{
 const human=referenceEntries(pack.species.find(r=>r.id==='species:human'),pack);
 assert(human.some(e=>e.heading==='Bonus feat' && e.text.includes('1st level')));
 const soldier=referenceEntries(pack.classes.find(r=>r.id==='class:soldier'),pack);
 assert(soldier.some(e=>e.heading==='Base attack' && e.text.includes('20: +20')));
 const armor=referenceEntries(pack.equipment.find(r=>r.id==='equipment:stormtrooper-armor'),pack);
 assert(armor.some(e=>e.text.includes('Reflex +6') && e.text.includes('maximum DEX +3')));
});
test('plain reference blocks require a known pinned source',()=>{
 const draft=structuredClone(pack);
 draft.feats[0].reference=[{heading:'Application',text:'Fixture text.',sourceId:draft.feats[0].sourceId}];
 assert.doesNotThrow(()=>validatePack(draft));
 draft.feats[0].reference[0].sourceId='source:unknown';
 assert.throws(()=>validatePack(draft),/Missing reference source/);
});
