import {GROUPS,indexPack,eligible,prerequisite} from './rules.js';
import {articleText,renderArticle,escapeHTML as escape} from './wiki-content.js';
import {layoutFeatureGraph,featureEdgePath} from './feature-layout.js';
const title=value=>value.replace(/^tree:/,'').replaceAll('-',' ').replace(/\b\w/g,c=>c.toUpperCase());
export const featureFamily=r=>/^(Weapon Proficiency|Armor Proficiency) \(/.test(r.name)?r.name.replace(/ \(.*\)$/,''):null;
export const featureValue=r=>featureFamily(r)?'family:'+featureFamily(r):r.id+'|';
export function featureVariants(r,pack) {return (r.choiceType==='skill'?pack.skills.map(s=>s.id):r.choiceType==='weaponGroup'?GROUPS:[null]).map(choice=>({id:r.id,...(choice?{choice}:{})}));}

// Rendered text never drives eligibility or graph dependencies.
export function featureGraph(pack,options) {
 const ix=indexPack(pack),type=options.type,ctx=options.ctx,allowed=new Set(options.allowedIds),nodes=new Map(),byId=new Map();
 const possible=r=>allowed.has(r.id)?featureVariants(r,pack).filter(s=>eligible(r,s,ctx,ix,type)&&(!options.restrictions?.[r.id]||options.restrictions[r.id].includes(s.choice))):[];
 const selected=options.selected;
 const possessed=[...ctx[type]];
 if(selected && !selected.pending && allowed.has(selected.id) && possible(ix[type].get(selected.id)).some(s=>s.id===selected.id&&(s.choice||'')===(selected.choice||'')))possessed.push(selected);
 for(const r of pack[type]) {
  const key=type==='feats'?featureValue(r):r.id+'|';let node=nodes.get(key);
  if(!node){node={key,name:type==='feats'?(featureFamily(r)||r.name):r.name,group:type==='talents'?r.tree:null,records:[],parents:[],main:true,available:false,owned:false,selected:false};nodes.set(key,node);}
  node.records.push(r);node.available||=possible(r).length>0;node.owned||=possessed.some(s=>s.id===r.id);node.selected||=selected?.id===r.id;byId.set(r.id,key);
 }
 function condition(p) {
  const key='condition:'+JSON.stringify(p);if(nodes.has(key))return key;
  const choice=p.value==='$choice';let name,record;
  if(['feat','talent'].includes(p.kind)){record=ix[p.kind==='feat'?'feats':'talents'].get(p.value);name=record.name;}
  else if(p.kind==='trained')name='Trained in '+(choice?'a skill':ix.skills.get(p.value).name);
  else if(p.kind==='untrained')name='Untrained in '+(choice?'chosen skill':ix.skills.get(p.value).name);
  else if(p.kind==='classSkill')name=choice?'Class skill':ix.skills.get(p.value).name+' class skill';
  else if(p.kind==='ability')name=p.value.toUpperCase()+' '+p.min;
  else if(p.kind==='bab')name='Base attack +'+p.min;
  else if(p.kind==='nonDroid')name='Not a droid';
  else if(p.kind==='proficientChoice')name='Weapon Proficiency';
  else if(p.kind==='focusChoice')name='Weapon Focus';
  const choices=choice?(p.kind==='proficientChoice'||p.kind==='focusChoice'?GROUPS:pack.skills.map(s=>s.id)):[null];
  const owned=choices.some(value=>prerequisite(p,ctx,ix,value));
  nodes.set(key,{key,name,group:null,records:record?[record]:[],parents:[],main:false,owned,available:owned,selected:false});return key;
 }
 function parents(p,out,alternative=false) {
  if(p.kind==='all'||p.kind==='any'){p.requirements.forEach(r=>parents(r,out,alternative||p.kind==='any'));return;}
  const key=['feat','talent'].includes(p.kind)&&byId.has(p.value)?byId.get(p.value):condition(p);
  if(!out.some(edge=>edge.key===key))out.push({key,alternative});
 }
 for(const node of [...nodes.values()])if(node.main) {
  node.records.forEach(r=>parents(r.prerequisite,node.parents));node.parents=node.parents.filter(p=>p.key!==node.key);
 }
 const main=[...nodes.values()].filter(n=>n.main);
 return {nodes,groups:[...new Set(main.map(n=>n.group).filter(Boolean))].sort((a,b)=>title(a).localeCompare(title(b))),possible};
}

export function createFeatureTrees(pack) {
 const states=new Map(),configs=new Map();
 const state=key=>{if(!states.has(key))states.set(key,{query:'',group:null,onlyEligible:false,zoom:1,scrollLeft:0,scrollTop:0});return states.get(key);};
 const rootFor=key=>[...document.querySelectorAll('.feature-tree-browser')].find(el=>el.dataset.treeKey===key);
 function visible(options) {
  const model=featureGraph(pack,options),s=state(options.key);
  const accessStamp=options.allowedIds.join('|'),allowed=new Set(options.allowedIds);
  const permitted=group=>[...model.nodes.values()].some(n=>n.group===group&&n.records.some(r=>allowed.has(r.id)));
  if(options.type==='feats')s.group='all';
  if(s.group===null || (s.accessStamp!==accessStamp && s.group!=='all' && !permitted(s.group)))s.group=model.groups.find(permitted)||model.groups[0]||'all';
  s.accessStamp=accessStamp;
  const query=s.query.trim().toLocaleLowerCase(),found=new Set();
  for(const n of model.nodes.values())if(n.main && (s.group==='all'||n.group===s.group) && (!s.onlyEligible||n.available||n.owned) && (n.name+' '+n.records.map(r=>articleText(r.article)).join(' ')).toLocaleLowerCase().includes(query))found.add(n.key);
  const include=key=>{const n=model.nodes.get(key);if(!n)return;for(const parent of n.parents)if(!found.has(parent.key)){found.add(parent.key);include(parent.key);}};
  [...found].forEach(include);
  const ranks=new Map();function rank(key,seen=new Set()){if(ranks.has(key))return ranks.get(key);if(seen.has(key))return 0;seen.add(key);const n=model.nodes.get(key);const value=n.parents.length?1+Math.max(...n.parents.map(p=>rank(p.key,new Set(seen)))):0;ranks.set(key,value);return value;}
  const nodes=[...found].map(key=>({...model.nodes.get(key),rank:rank(key)}));
  // A read-only condition belongs beside the other immediate prerequisites, so its
  // arrow need not run behind an unrelated intermediate talent.
  for(const n of nodes)if(!n.main)n.rank=Math.max(n.rank,Math.min(...nodes.filter(child=>child.parents.some(p=>p.key===n.key)).map(child=>child.rank-1)));
  return {...model,nodes};
 }
 function tabs(options) {if(options.type==='feats')return '';const model=featureGraph(pack,options),s=state(options.key);return ['all',...model.groups].map(group=>`<button type="button" data-tree-group="${escape(group)}" aria-pressed="${s.group===group}">${escape(group==='all'?'All':title(group))}</button>`).join('');}
 function mechanics(node) {
  const articles=[...new Map(node.records.filter(r=>r.article).map(r=>[JSON.stringify(r.article.blocks),r])).values()];
  return articles.map(r=>articles.length>1?`<h3>${escape(r.name)}</h3>${renderArticle(r.article)}`:renderArticle(r.article)).join('');
 }
 function results(options) {
  const model=visible(options);
  return `<div class="feature-tree-scroll" tabindex="0" aria-label="${options.type==='feats'?'Feat':'Talent'} prerequisites" data-tree-scroll="${escape(options.key)}"><div class="feature-tree-stage"><div class="feature-tree-canvas"><svg class="feature-tree-arrows" aria-hidden="true"><g></g></svg>${model.nodes.map(n=>{
   const hasText=n.records.some(r=>r.article);
   return `<article class="feature-tree-node ${n.owned?'owned':!n.available?'unavailable':''} ${n.selected?'selected':''} ${n.main?'':'prerequisite-node'}" data-tree-node="${escape(n.key)}" data-tree-rank="${n.rank}"><div class="feature-tree-node-head">${hasText?`<button type="button" class="feature-fold" data-tree-fold="${escape(n.key)}" aria-haspopup="dialog" aria-label="Read ${escape(n.name)}">▶</button>`:''}${n.main?`<button type="button" class="feature-pick" data-tree-pick="${escape(n.key)}" aria-pressed="${n.selected}" aria-label="${escape(n.name)}${n.owned?' (possessed)':''}" ${n.available||n.selected?'':`disabled title="${n.owned?'Already possessed':'Prerequisites or class access not met'}"`}>${escape(n.name)}</button>`:`<span>${escape(n.name)}</span>`}</div></article>`;
  }).join('')}</div></div>${model.nodes.length?'':'<p role="status">No matches</p>'}</div>`;
 }
 function remember(key){const root=rootFor(key),scroll=root?.querySelector('.feature-tree-scroll');if(scroll){const s=state(key);s.scrollLeft=scroll.scrollLeft;s.scrollTop=scroll.scrollTop;}}
 function layout(root) {
  const options=configs.get(root.dataset.treeKey);if(!options)return;
  const s=state(options.key),model=visible(options),elements=new Map([...root.querySelectorAll('[data-tree-node]')].map(el=>[el.dataset.treeNode,el]));
  const geometry=layoutFeatureGraph(model.nodes,new Map([...elements].map(([key,el])=>[key,{width:el.offsetWidth,height:el.offsetHeight}])));
  const {positions,width,height}=geometry;
  for(const [key,p] of positions){const el=elements.get(key);el.style.left=p.x+'px';el.style.top=p.y+'px';}
  const canvas=root.querySelector('.feature-tree-canvas'),svg=canvas.querySelector('svg'),stage=root.querySelector('.feature-tree-stage');
  canvas.style.width=width+'px';canvas.style.height=height+'px';canvas.style.transform=`scale(${s.zoom})`;
  stage.style.width=width*s.zoom+'px';stage.style.height=height*s.zoom+'px';svg.setAttribute('width',width);svg.setAttribute('height',height);
  svg.querySelector('g').innerHTML=geometry.edges.map(edge=>{
   const a=positions.get(edge.from),b=positions.get(edge.to),n=model.nodes.find(n=>n.key===edge.to),path=featureEdgePath(a,b);
   return `<path class="feature-edge ${!n.available&&!n.owned?'unavailable':''}" d="${path.shaft}"/><path class="feature-arrowhead" d="${path.head}"/>${edge.alternative?`<text x="${path.x}" y="${path.y}">or</text>`:''}`;
  }).join('');
  const scroll=root.querySelector('.feature-tree-scroll');scroll.scrollLeft=s.scrollLeft;scroll.scrollTop=s.scrollTop;
  const reset=root.querySelector('[data-tree-zoom="reset"]');reset.textContent=Math.round(s.zoom*100)+'%';
  root.querySelector('[data-tree-zoom="out"]').disabled=s.zoom<=.25;root.querySelector('[data-tree-zoom="in"]').disabled=s.zoom>=2;
 }
 function zoom(root,value) {
  const key=root.dataset.treeKey,s=state(key),scroll=root.querySelector('.feature-tree-scroll');
  const next=Math.max(.25,Math.min(2,value)),ratio=next/s.zoom;
  s.scrollLeft=Math.max(0,(scroll.scrollLeft+scroll.clientWidth/2)*ratio-scroll.clientWidth/2);
  s.scrollTop=Math.max(0,(scroll.scrollTop+scroll.clientHeight/2)*ratio-scroll.clientHeight/2);s.zoom=next;layout(root);
 }
 function update(key){remember(key);const root=rootFor(key),options=configs.get(key);if(!root||!options)return;root.querySelector('.feature-tree-results').innerHTML=results(options);root.querySelector('.feature-tree-tabs').innerHTML=tabs(options);layout(root);}
 return {
  render(options){configs.set(options.key,options);const s=state(options.key);visible(options);return `<div class="feature-tree-browser" data-tree-key="${escape(options.key)}"><input type="search" placeholder="Search" aria-label="Search ${options.type}" data-tree-search value="${escape(s.query)}"><div class="feature-tree-tabs">${tabs(options)}</div><div class="feature-tree-tools"><label><input type="checkbox" data-tree-eligible ${s.onlyEligible?'checked':''}>Only Show Eligible</label><button type="button" data-tree-all="unfold">Unfold all</button><div class="feature-tree-zoom" role="group" aria-label="Tree zoom"><button type="button" data-tree-zoom="out" aria-label="Zoom out">−</button><button type="button" data-tree-zoom="reset" aria-label="Reset zoom">${Math.round(s.zoom*100)}%</button><button type="button" data-tree-zoom="in" aria-label="Zoom in">+</button></div></div><div class="feature-tree-results">${results(options)}</div></div>`;},
  remember(){document.querySelectorAll('.feature-tree-browser').forEach(root=>remember(root.dataset.treeKey));},
  layout(){document.querySelectorAll('.feature-tree-browser').forEach(layout);},
  input(event){const root=event.target.closest('.feature-tree-browser');if(!root)return false;const key=root.dataset.treeKey,s=state(key);if(event.target.hasAttribute('data-tree-search')){s.query=event.target.value;if(s.query)s.group='all';update(key);return true;}return false;},
  change(event){const root=event.target.closest('.feature-tree-browser');if(!root||!event.target.hasAttribute('data-tree-eligible'))return false;state(root.dataset.treeKey).onlyEligible=event.target.checked;update(root.dataset.treeKey);return true;},
  click(event){const root=event.target.closest('.feature-tree-browser'),button=event.target.closest('button');if(!root||!button)return null;const key=root.dataset.treeKey,s=state(key),options=configs.get(key);
   if(button.hasAttribute('data-tree-group')){s.group=button.dataset.treeGroup;s.scrollLeft=s.scrollTop=0;const scroll=root.querySelector('.feature-tree-scroll');scroll.scrollTop=scroll.scrollLeft=0;update(key);root.querySelector(`[data-tree-group="${CSS.escape(s.group)}"]`).focus();return {handled:true};}
   if(button.hasAttribute('data-tree-zoom')){const action=button.dataset.treeZoom;zoom(root,action==='reset'?1:s.zoom+(action==='in'?.25:-.25));return {handled:true};}
   if(button.hasAttribute('data-tree-fold')){const node=featureGraph(pack,options).nodes.get(button.dataset.treeFold);return node?{handled:true,detail:{title:node.name,html:mechanics(node)}}:{handled:true};}
   if(button.hasAttribute('data-tree-all')){const nodes=visible(options).nodes.filter(n=>n.records.some(r=>r.article));return {handled:true,detail:{title:options.type==='feats'?'Feats':'Talents',html:`<div class="feature-mechanics-tools"><button type="button" data-mechanics-fold="fold">Fold all</button><button type="button" data-mechanics-fold="unfold">Unfold all</button></div>${nodes.map(n=>`<details class="feature-mechanics" open><summary>${escape(n.name)}</summary>${mechanics(n)}</details>`).join('')}`}};}
   if(button.hasAttribute('data-tree-pick')){const model=featureGraph(pack,options),node=model.nodes.get(button.dataset.treePick);if(!node||(!node.available&&!node.selected))return {handled:true};const r=node.records.find(r=>model.possible(r).length);const selection=node.selected?null:{id:r.id,...(r.choiceType||node.records.length>1?{pending:true}:{})};return {handled:true,options,selection};}
   return null;
  },
 };
}
