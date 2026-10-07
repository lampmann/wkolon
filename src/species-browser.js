import {ABILITIES, signed} from './rules.js';
import {createListSort} from './list-sort.js';
import {escapeHTML as escape, articleText, renderArticle} from './wiki-content.js';
const title=value=>value[0].toUpperCase()+value.slice(1);
export function createSpeciesBrowser(pack) {
  let query='';const expanded=new Set();
  const text=new Map(pack.species.map(r=>[r.id,(r.name+' '+articleText(r.article)).toLocaleLowerCase()]));
  const totalSpeed=r=>r.speed+Object.values(r.speeds||{}).reduce((n,v)=>n+v,0);
  const sort=createListSort([
    {key:'name',label:'Species'},
    {key:'abilities',label:'Ability Modifiers',numeric:true,get:r=>Object.values(r.abilityAdjustments).reduce((n,v)=>n+v,0),hint:'Total ability modifiers'},
    {key:'size',label:'Size',numeric:true,get:r=>pack.rules.weaponSizeOrder.indexOf(r.size)},
    {key:'speed',label:'Speed',numeric:true,get:r=>[r.speed,totalSpeed(r)],compare:(a,b)=>a[0]-b[0]||a[1]-b[1],hint:'Squares; normal speed, then total movement speed'},
  ]);
  function results(selected) {
    const rows=sort.rows(pack.species.filter(r=>text.get(r.id).includes(query.trim().toLocaleLowerCase())));
    return `<div class="table-scroll"><table class="spell-table species-table"><thead><tr><th scope="col"></th>${sort.headers()}</tr></thead><tbody>${rows.map(r=>{
      const open=expanded.has(r.id),id='species-description-'+r.id.split(':')[1];
      const abilities=ABILITIES.filter(a=>r.abilityAdjustments[a]).map(a=>`${signed(r.abilityAdjustments[a])} ${title(a)}`).join(', ')||'—';
      const speed=[r.speed,...Object.entries(r.speeds||{}).map(([type,n])=>`${title(type)} ${n}`)].join(', ');
      return `<tr class="species-row ${selected===r.id?'selected':''}"><td><button type="button" data-select-species="${r.id}" aria-label="Select ${escape(r.name)}" aria-pressed="${selected===r.id}">Select</button></td><td class="nm"><a href="#${id}" class="sp-name-link" data-species-detail="${r.id}" aria-expanded="${open}" aria-controls="${id}">${escape(r.name)}</a></td><td>${escape(abilities)}</td><td>${escape(title(r.size))}</td><td>${escape(speed)}</td></tr><tr class="sp-detail" id="${id}" ${open?'':'hidden'}><td colspan="5">${renderArticle(r.article)}</td></tr>`;
    }).join('')}</tbody></table>${rows.length?'':'<p role="status">No matches</p>'}</div>`;
  }
  return {
    render:selected=>`<div class="species-browser"><input id="species-search" type="search" placeholder="Search" aria-label="Search species" value="${escape(query)}"><div id="species-results">${results(selected)}</div></div>`,
    results,
    search(value){query=value;},
    toggle(id){if(expanded.has(id))expanded.delete(id);else expanded.add(id);},
    sort(event,render){return sort.click(event,render);},
  };
}
