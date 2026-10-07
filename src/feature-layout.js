// Geometry stays independent of the DOM, eligibility and article text.
export function layoutFeatureGraph(nodes, sizes) {
 const columns=new Map(), byKey=new Map(nodes.map(n=>[n.key,n]));
 for(const n of nodes){if(!columns.has(n.rank))columns.set(n.rank,[]);columns.get(n.rank).push(n.key);}
 const ranks=[...columns.keys()].sort((a,b)=>a-b), edges=nodes.flatMap(n=>n.parents.filter(p=>byKey.has(p.key)).map(p=>({from:p.key,to:n.key,alternative:p.alternative})));
 const neighbours=(key,incoming)=>edges.filter(e=>(incoming?e.to:e.from)===key).map(e=>incoming?e.from:e.to);
 const order=()=>new Map([...columns.values()].flatMap(keys=>keys.map((key,i)=>[key,i])));
 function crossings(){
  const indices=order();let count=0;
  const at=(e,r)=>{const start=byKey.get(e.from).rank,end=byKey.get(e.to).rank;return indices.get(e.from)+(indices.get(e.to)-indices.get(e.from))*(r-start)/(end-start);};
  for(let i=0;i<edges.length;i++)for(const b of edges.slice(i+1)){
   const a=edges[i];if(a.from===b.from||a.to===b.to||a.from===b.to||a.to===b.from)continue;
   const lo=Math.max(byKey.get(a.from).rank,byKey.get(b.from).rank),hi=Math.min(byKey.get(a.to).rank,byKey.get(b.to).rank);
   if(lo<hi&&(at(a,lo)-at(b,lo))*(at(a,hi)-at(b,hi))<0)count++;
  }return count;
 }
 // Alternating barycentric sweeps place related branches together. Keep the best
 // order, then swap neighbours only when that removes a crossing; names play no role.
 let best=[...columns].map(([r,keys])=>[r,[...keys]]),score=crossings();
 for(let pass=0;pass<8;pass++){
  const incoming=pass%2===0;
  for(const rank of incoming?ranks:[...ranks].reverse()){
   const indices=order(),keys=columns.get(rank),means=new Map(keys.map(key=>{const adjacent=neighbours(key,incoming);return [key,adjacent.length?adjacent.reduce((sum,k)=>sum+indices.get(k),0)/adjacent.length:indices.get(key)];}));
   keys.sort((a,b)=>means.get(a)-means.get(b));
  }
  const next=crossings();if(next<score){score=next;best=[...columns].map(([r,keys])=>[r,[...keys]]);}
 }
 best.forEach(([r,keys])=>columns.set(r,keys));
 for(let pass=0;pass<4;pass++){
  let improved=false;
  for(const keys of columns.values())for(let i=0;i<keys.length-1;i++){
   [keys[i],keys[i+1]]=[keys[i+1],keys[i]];const next=crossings();
   if(next<score){score=next;improved=true;}else [keys[i],keys[i+1]]=[keys[i+1],keys[i]];
  }if(!improved)break;
 }
 // Disconnected branches share no dependencies. Give each its own vertical band,
 // so isolated options cannot force other branches to weave around them.
 const componentOf=new Map(),components=[];
 for(const n of nodes)if(!componentOf.has(n.key)){
  const keys=[],pending=[n.key],id=components.length;
  while(pending.length){const key=pending.pop();if(componentOf.has(key))continue;componentOf.set(key,id);keys.push(key);pending.push(...neighbours(key,true),...neighbours(key,false));}
  components.push({id,keys});
 }
 components.sort((a,b)=>(b.keys.length>1)-(a.keys.length>1));
 for(const [rank,keys] of columns)columns.set(rank,components.flatMap(c=>keys.filter(key=>componentOf.get(key)===c.id)));
 const pad=20,gap=72,rowGap=24,positions=new Map();let x=pad,width=pad,height=pad;
 const rowHeight=Math.max(0,...[...sizes.values()].map(s=>s.height));
 const bands=new Map();let cursor=pad;
 for(const component of components){
  const rows=Math.max(...ranks.map(rank=>columns.get(rank).filter(key=>componentOf.get(key)===component.id).length));
  bands.set(component.id,cursor);cursor+=rows*(rowHeight+rowGap);
 }
 for(const rank of ranks){
  const keys=columns.get(rank),columnWidth=Math.max(...keys.map(key=>sizes.get(key).width));
  for(const component of components)keys.filter(key=>componentOf.get(key)===component.id).forEach((key,i)=>{const size=sizes.get(key),y=bands.get(component.id)+i*(rowHeight+rowGap)+(rowHeight-size.height)/2;positions.set(key,{x,y,width:size.width,height:size.height,center:y+size.height/2,exitX:x+columnWidth+8});height=Math.max(height,y+size.height+pad);});
  x+=columnWidth+gap;width=x-gap+pad;
 }
 // Single-node columns can align with their children without disturbing ordering.
 for(const rank of [...ranks].reverse())if(columns.get(rank).length===1){
  const key=columns.get(rank)[0],children=neighbours(key,false);if(!children.length)continue;
  const p=positions.get(key);p.center=children.reduce((sum,k)=>sum+positions.get(k).center,0)/children.length;p.y=p.center-p.height/2;height=Math.max(height,p.y+p.height+pad);
 }
 return {positions,edges,width:Math.max(1,width),height:Math.max(1,height),crossings:crossings()};
}

export function featureEdgePath(a,b){
 const x=a.x+a.width,y=a.center,exit=a.exitX??x,tx=b.x-4,ty=b.center,mid=(exit+tx)/2;
 const points=[{x,y},{x:exit,y}];
 flattenCurve([{x:exit,y},{x:mid,y},{x:mid,y:ty},{x:tx,y:ty}],points);
 // The head and shaft share the exact tip, with a horizontal tangent at the join.
 return {shaft:`M${x},${y} H${exit} C${mid},${y} ${mid},${ty} ${tx},${ty}`,head:`M${tx-7},${ty-4} L${tx},${ty} L${tx-7},${ty+4}`,x:mid,y:(y+ty)/2-5,points};
}

// Approximate curves within a fraction of a graph pixel for crossing detection.
// Keep actual SVG curves intact, including dotted strokes and their dash phase.
function flattenCurve([a,b,c,d],points,depth=0){
 const distance=p=>Math.abs((d.x-a.x)*(a.y-p.y)-(a.x-p.x)*(d.y-a.y))/(Math.hypot(d.x-a.x,d.y-a.y)||1);
 if(depth>=10||Math.max(distance(b),distance(c))<.2){points.push(d);return;}
 const half=(p,q)=>({x:(p.x+q.x)/2,y:(p.y+q.y)/2});
 const ab=half(a,b),bc=half(b,c),cd=half(c,d),abc=half(ab,bc),bcd=half(bc,cd),center=half(abc,bcd);
 flattenCurve([a,ab,abc,center],points,depth+1);flattenCurve([center,bcd,cd,d],points,depth+1);
}

export function featureCrossings(edges){
 const hits=[],bounds=edges.map(e=>({left:Math.min(...e.path.points.map(p=>p.x)),right:Math.max(...e.path.points.map(p=>p.x)),top:Math.min(...e.path.points.map(p=>p.y)),bottom:Math.max(...e.path.points.map(p=>p.y))}));
 const cross=(a,b)=>a.x*b.y-a.y*b.x,minus=(a,b)=>({x:a.x-b.x,y:a.y-b.y});
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const a=edges[i],b=edges[j],ab=bounds[i],bb=bounds[j];
  // Fan-outs and joined prerequisites are real connections, never overpasses.
  if(a.from===b.from||a.to===b.to||a.from===b.to||a.to===b.from||ab.right<bb.left||bb.right<ab.left||ab.bottom<bb.top||bb.bottom<ab.top)continue;
  const ap=a.path.points,bp=b.path.points;
  for(let k=1;k<ap.length;k++)for(let l=1;l<bp.length;l++){
   const p=ap[k-1],q=bp[l-1],r=minus(ap[k],p),s=minus(bp[l],q),den=cross(r,s);if(Math.abs(den)<1e-9)continue;
   const delta=minus(q,p),t=cross(delta,s)/den,u=cross(delta,r)/den;if(t<0||t>1||u<0||u>1)continue;
   const point={x:p.x+t*r.x,y:p.y+t*r.y},distance=v=>Math.hypot(point.x-v.x,point.y-v.y);
   if([ap[0],ap.at(-1),bp[0],bp.at(-1)].some(v=>distance(v)<10)||hits.some(h=>h.under===i&&h.over===j&&distance(h)<2))continue;
   hits.push({under:i,over:j,...point});
  }
 }
 return hits;
}
