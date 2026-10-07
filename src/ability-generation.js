// pmcrwf's pool assignment, separated into Saga's generation and assignment steps.
import {ABILITIES} from './rules.js';
export function generationState(c, pack) {
  if (c.abilityGeneration) return c.abilityGeneration;
  const pool = c.abilityMethod === 'standard' ? [...pack.rules.standardArray] : ABILITIES.map(a => c.abilities[a]);
  const assign = {}, used = new Set();
  for (const a of ABILITIES) {
    const i = pool.findIndex((n,i) => n === c.abilities[a] && !used.has(i));
    assign[a] = i < 0 ? null : i;
    if (i >= 0) used.add(i);
  }
  return {pool, assign};
}
export function setGenerationMethod(c, method, pack) {
  c.abilityMethod = method;
  const pool = method === 'standard' ? [...pack.rules.standardArray] : method === 'rolled' ? [] : Array(6).fill(method === 'point-buy' ? 8 : 10);
  c.abilities = Object.fromEntries(ABILITIES.map(a => [a,10]));
  c.abilityGeneration = {pool, assign: Object.fromEntries(ABILITIES.map(a => [a,null]))};
}
export function assignScore(c, ability, index, pack) {
  const state = generationState(c, pack);
  if (index !== null && (!Number.isInteger(index) || !Number.isInteger(state.pool[index]) || Object.entries(state.assign).some(([a,i]) => a !== ability && i === index))) return false;
  state.assign[ability] = index;
  c.abilityGeneration = state;
  c.abilities[ability] = index === null ? 10 : state.pool[index];
  return true;
}
export function setPoolScore(c, index, value, pack) {
  if (!['point-buy','manual'].includes(c.abilityMethod) || !Number.isInteger(index) || index<0 || index>5 || !Number.isInteger(value) || value<3 || value>30 || (c.abilityMethod==='point-buy' && pack.rules.pointBuyCosts[value]===undefined)) return false;
  const state=generationState(c,pack);
  state.pool[index]=value;c.abilityGeneration=state;
  for(const a of ABILITIES) if(state.assign[a]===index)c.abilities[a]=value;
  return true;
}
export function setRolledPool(c, pool) {
  c.abilityGeneration = {pool: [...pool], assign: Object.fromEntries(ABILITIES.map(a => [a,null]))};
  c.abilities = Object.fromEntries(ABILITIES.map(a => [a,10]));
}
