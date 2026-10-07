// pmcrwf's pool assignment and method reset, using the active Saga rules pack.
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
  c.abilities = Object.fromEntries(ABILITIES.map(a => [a, method === 'point-buy' ? 8 : 10]));
  delete c.abilityGeneration;
  if (method === 'standard' || method === 'rolled') {
    c.abilityGeneration = {pool: method === 'standard' ? [...pack.rules.standardArray] : [], assign: Object.fromEntries(ABILITIES.map(a => [a,null]))};
  }
}
export function assignScore(c, ability, index, pack) {
  const state = generationState(c, pack);
  if (index !== null && (!Number.isInteger(index) || !Number.isInteger(state.pool[index]) || Object.entries(state.assign).some(([a,i]) => a !== ability && i === index))) return false;
  state.assign[ability] = index;
  c.abilityGeneration = state;
  c.abilities[ability] = index === null ? 10 : state.pool[index];
  return true;
}
export function setRolledPool(c, pool) {
  c.abilityGeneration = {pool: [...pool], assign: Object.fromEntries(ABILITIES.map(a => [a,null]))};
  c.abilities = Object.fromEntries(ABILITIES.map(a => [a,10]));
}
