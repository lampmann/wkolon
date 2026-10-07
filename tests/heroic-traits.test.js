import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {newCharacter,validateCharacter,derive,classSkills,indexPack} from '../src/rules.js';
import {emptyStory,backgroundLanguage} from '../src/heroic-traits.js';
import {validatePack} from '../tools/validate-rules.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url)));
const background=(id,skills=[],language='')=>({kind:'background',id:'background:'+id,skills,language});

test('finishing traits and exclusive story choices roundtrip; old files retain languages and notes',()=>{
 const c=newCharacter(pack);c.heroicTraits.height='1.72';c.heroicTraits.background='A pilot from Dac.';
 c.story={kind:'destiny',id:'destiny:rescue',details:'Save my sister.',points:1};
 assert.deepEqual(validateCharacter(JSON.parse(JSON.stringify(c)),pack),c);
 const old=structuredClone(c);delete old.heroicTraits;delete old.story;old.languages='Bocce';old.notes='Keep this.';
 assert.equal(validateCharacter(old,pack).notes,'Keep this.');assert.equal(old.languages,'Bocce');
 for(const story of [{...c.story,skills:['skill:pilot']},{kind:'none',id:'background:academic'},{...c.story,points:2}])assert.throws(()=>validateCharacter({...c,story},pack));
 assert.throws(()=>validateCharacter({...c,heroicTraits:{age:23}},pack));
 assert.throws(()=>validateCharacter({...c,heroicTraits:{era:'Guess'}},pack));
 assert.deepEqual(emptyStory('none'),{kind:'none'});
});

test('occupations grant selected class access, not training or an extra pool; bonuses only apply untrained',()=>{
 const c=newCharacter(pack);c.levels[0].classId='class:soldier';
 c.trainedSkills=['skill:endurance','skill:initiative','skill:mechanics','skill:perception','skill:pilot'];
 const baseline=derive(c,pack), skill=id=>derive(c,pack).skills.find(s=>s.id===id);
 c.story=background('academic',['skill:persuasion']);
 const d=derive(c,pack);assert(classSkills(d.ctx,indexPack(pack)).has('skill:persuasion'));
 assert.equal(skill('skill:persuasion').trained,false);assert.equal(skill('skill:persuasion').total,baseline.skills.find(s=>s.id==='skill:persuasion').total+2);
 assert.equal(skill('skill:knowledge-technology').total,baseline.skills.find(s=>s.id==='skill:knowledge-technology').total+2);
 c.trainedSkills[0]='skill:persuasion';assert.equal(skill('skill:persuasion').trained,true);assert.equal(skill('skill:persuasion').total,4);
 assert(!derive(c,pack).issues.some(issue=>issue.includes('trained skills')||issue.includes('starting class skill')));
 c.story=emptyStory('none');assert(!derive(c,pack).ctx.trained.has('skill:persuasion'));
 assert.equal(skill('skill:use-computer').total,baseline.skills.find(s=>s.id==='skill:use-computer').total);
});

test('planet choices give two distinct class skills and one language; homeworld exclusion removes benefits',()=>{
 const c=newCharacter(pack);c.levels[0].classId='class:soldier';c.story=background('dac-origin',['skill:persuasion',null]);
 assert.doesNotThrow(()=>validateCharacter(c,pack));assert(derive(c,pack).issues.includes('Choose 2 Background class skills'));
 assert(derive(c,pack).issues.includes('Choose a Background language'));assert.equal(backgroundLanguage(c,pack),'');
 c.story.skills[1]='skill:swim';c.story.language='Quarrenese';assert.equal(backgroundLanguage(c,pack),'Quarrenese');
 assert(!derive(c,pack).issues.some(issue=>issue.includes('Background')));
 c.story.skills=['skill:swim','skill:swim'];assert.throws(()=>validateCharacter(c,pack),/Background skills/);
 c.story=background('bothawui-origin',['skill:persuasion','skill:deception']);c.species='species:bothan';
 assert.equal(backgroundLanguage(c,pack),'');assert(derive(c,pack).issues.some(issue=>issue.includes('homeworld')));
 assert(!classSkills(derive(c,pack).ctx,indexPack(pack)).has('skill:persuasion'));
});

test('Exiled focus is conditional on training and never stacks with another Skill Focus',()=>{
 const c=newCharacter(pack);c.story=background('exiled',['skill:knowledge-galactic-lore']);
 const lore=()=>derive(c,pack).skills.find(s=>s.id==='skill:knowledge-galactic-lore');
 assert.equal(lore().focus,0);
 c.trainedSkills=['skill:knowledge-galactic-lore'];assert.equal(lore().focus,5);
 c.levels[0].feats=[{id:'feat:skill-focus',choice:'skill:knowledge-galactic-lore'}];assert.equal(lore().focus,5);
 c.story=emptyStory('none');c.levels[0].feats=[];assert.equal(lore().focus,0);
});

test('finishing catalogs validate all sources, skill references and closed mechanics',()=>{
 assert.equal(pack.destinies.length,11);assert.equal(pack.backgrounds.length,46);
 const p=structuredClone(pack);p.backgrounds[0].relevantSkills.push('skill:invented');assert.throws(()=>validatePack(p));
 const q=structuredClone(pack);q.destinies[0].reference[0].sourceId='source:unknown';assert.throws(()=>validatePack(q));
});
