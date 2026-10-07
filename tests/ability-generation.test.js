import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newCharacter, validateCharacter, derive} from '../src/rules.js';
import {generationState, setGenerationMethod, assignScore, setPoolScore, setRolledPool} from '../src/ability-generation.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url)));
test('existing standard characters retain assignments; method changes reset scores',()=>{
 const c=newCharacter(pack);
 assert.deepEqual(Object.values(generationState(c,pack).assign),[0,1,2,3,4,5]);
 setGenerationMethod(c,'point-buy',pack);
 assert.equal(derive(c,pack).pointCost,0);
 assert.deepEqual(generationState(c,pack).pool,[8,8,8,8,8,8]);
 assert.deepEqual(Object.values(c.abilities),[10,10,10,10,10,10]);
 setGenerationMethod(c,'standard',pack);
 assert(derive(c,pack).issues.includes('Assign all six ability scores'));
 assert.equal(assignScore(c,'str',0,pack),true);
 assert.equal(assignScore(c,'dex',0,pack),false);
 assert.equal(c.abilities.str,15);
 assert.equal(assignScore(c,'str',null,pack),true);
 assert.equal(assignScore(c,'dex',0,pack),true);
 assert.doesNotThrow(()=>validateCharacter(c,pack));
});
test('equal rolled results are distinct assignments and persist in exports',()=>{
 const c=newCharacter(pack);setGenerationMethod(c,'rolled',pack);
 assert.equal(generationState(c,pack).pool.length,0);
 setRolledPool(c,[12,12,12,12,12,12]);
 for(const [i,a] of ['str','dex','con','int','wis','cha'].entries()) assert(assignScore(c,a,i,pack));
 const imported=validateCharacter(JSON.parse(JSON.stringify(c)),pack);
 assert.deepEqual(imported.abilities,c.abilities);
 assert(!derive(imported,pack).issues.includes('Assign all six ability scores'));
 imported.abilityGeneration.assign.dex=0;
 assert.throws(()=>validateCharacter(imported,pack),/duplicate ability assignment/);
});

test('manual and point-buy generation stay separate from assignment',()=>{
 const c=newCharacter(pack);setGenerationMethod(c,'manual',pack);
 assert(setPoolScore(c,0,30,pack));assert.equal(c.abilities.str,10);
 assert(assignScore(c,'str',0,pack));assert.equal(c.abilities.str,30);
 assert(setPoolScore(c,0,12,pack));assert.equal(c.abilities.str,12);
 assert.doesNotThrow(()=>validateCharacter(c,pack));
 setGenerationMethod(c,'point-buy',pack);
 assert(setPoolScore(c,0,18,pack));assert.equal(derive(c,pack).pointCost,16);
 assert.equal(c.abilities.str,10);
 assert(assignScore(c,'str',0,pack));assert.equal(c.abilities.str,18);
 assert(!setPoolScore(c,1,19,pack));
 assert.doesNotThrow(()=>validateCharacter(c,pack));
});
