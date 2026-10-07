import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {validatePack} from '../tools/validate-rules.js';
import {articleText,renderArticle} from '../src/wiki-content.js';
import {createSpeciesBrowser} from '../src/species-browser.js';
import {newCharacter,derive} from '../src/rules.js';
const pack=JSON.parse(fs.readFileSync(new URL('../data/core.json',import.meta.url)));
test('articles require reviewed sources and safe markup; renderer escapes source text and ignores executable nodes',()=>{
 validatePack(pack);
 const bad=structuredClone(pack);bad.species[0].article.blocks.push({tag:'script',children:['alert(1)']});assert.throws(()=>validatePack(bad),/article node/);
 bad.species[0].article.blocks.pop();bad.species[0].article.blocks.push({tag:'a',href:'javascript:alert(1)',children:['x']});assert.throws(()=>validatePack(bad),/article URL/);
 bad.species[0].article.blocks.pop();bad.species[0].article.sourceId='unknown';assert.throws(()=>validatePack(bad),/article source/);
 const rendered=renderArticle({blocks:['<script>alert(1)</script>',{tag:'img',children:[],onerror:'alert(1)'},{tag:'a',href:'javascript:alert(1)',children:['safe']},{tag:'b',children:['bold'],onclick:'alert(1)'}]});
 assert(!rendered.includes('<script>'));assert(!rendered.includes('onclick'));assert(!rendered.includes('javascript:'));assert(rendered.includes('&lt;script&gt;'));assert(rendered.includes('<b>bold</b>'));
});
test('search includes full articles and preserves disclosure state; sorting uses numeric sizes and all movement types',()=>{
 const fixture=structuredClone(pack);fixture.species=[
  {...fixture.species[0],id:'species:a',name:'Alpha',size:'small',speed:6,speeds:{swim:4},article:{blocks:['hidden phrase']}},
  {...fixture.species[0],id:'species:b',name:'Beta',size:'large',speed:6,speeds:{fly:6},article:{blocks:['other']}}];
 const browser=createSpeciesBrowser(fixture);browser.toggle('species:a');browser.search('HIDDEN PHRASE');assert(browser.results('species:b').includes('Alpha'));assert(!browser.results('species:b').includes('Beta'));assert(browser.results('species:b').includes('aria-expanded="true"'));
 browser.search('');const sort=key=>browser.sort({target:{closest:()=>({dataset:{sort:key}})}},()=>{});
 sort('speed');assert(browser.results('').indexOf('Beta')<browser.results('').indexOf('Alpha'));sort('speed');assert(browser.results('').indexOf('Alpha')<browser.results('').indexOf('Beta'));
 sort('size');assert(browser.results('').indexOf('Beta')<browser.results('').indexOf('Alpha'));sort('name');assert(browser.results('').includes('Species ▼'));sort('name');assert(browser.results('').includes('Species ▲'));
});
test('Gungan text preserves species sections and linked complete feats; Gamorrean grants replay without leaking to other species',()=>{
 const g=pack.species.find(r=>r.name==='Gungan'),text=articleText(g.article),html=renderArticle(g.article);
 assert(text.indexOf('Characteristics')<text.indexOf('Gungan Species Traits'));assert(text.indexOf('Gungan Species Traits')<text.indexOf('Gungan Species Feats'));
 assert(html.includes('https://swse.miraheze.org/wiki/Total_Concealment'));assert(html.includes('data-rule-page="rule:gungan-weapon-master"'));
 assert(pack.backgrounds.find(r=>r.name==='Naboo Origin').excludedSpecies.includes('species:gungan'));
 assert(pack.backgrounds.find(r=>r.name==='Gamorr Origin').excludedSpecies.includes('species:gamorrean'));
 const c=newCharacter(pack);c.species='species:gamorrean';c.levels[0].classId='class:soldier';let d=derive(c,pack);
 assert(d.ctx.feats.some(f=>f.id==='feat:improved-damage-threshold'&&f.automatic));assert(!d.ctx.feats.some(f=>f.id==='feat:weapon-proficiency-pistols'));assert(!d.ctx.feats.some(f=>f.id==='feat:weapon-proficiency-rifles'));
 c.levels.push({...structuredClone(c.levels[0]),classId:'class:scoundrel',hpRoll:4,startingFeat:{id:'feat:weapon-proficiency-pistols'}});d=derive(c,pack);assert(d.ctx.feats.some(f=>f.id==='feat:weapon-proficiency-pistols'));
 c.species='species:human';d=derive(c,pack);assert(!d.ctx.feats.some(f=>f.id==='feat:improved-damage-threshold'));assert(d.ctx.feats.some(f=>f.id==='feat:weapon-proficiency-rifles'));
});
