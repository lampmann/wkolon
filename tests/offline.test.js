import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=fs.readFileSync(new URL('../src/offline.js',import.meta.url),'utf8');
test('first worker claim preserves editing; an update reloads once',()=>{
 for(const initiallyControlled of [false,true]) {
  const listeners={}, sw={controller:initiallyControlled?{}:null,register:()=>Promise.resolve({addEventListener(){}}),addEventListener:(type,fn)=>listeners[type]=fn};
  let reloads=0;
  const sandbox={navigator:{serviceWorker:sw},location:{protocol:'https:',hostname:'lampmann.github.io',reload:()=>reloads++},document:{addEventListener:(type,fn)=>{if(type==='DOMContentLoaded')fn();}},console};
  vm.runInNewContext(source,sandbox);
  sw.controller={};listeners.controllerchange();
  assert.equal(reloads,initiallyControlled?1:0);
  sw.controller={};listeners.controllerchange();
  assert.equal(reloads,1);
  listeners.controllerchange();assert.equal(reloads,1);
 }
});
