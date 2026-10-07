import {test} from 'node:test';
import assert from 'node:assert/strict';
import {layoutFeatureGraph,featureEdgePath,featureCrossings} from '../src/feature-layout.js';

test('branch layout reduces crossings with mixed-size prerequisite boxes and preserves boundaries',()=>{
 const node=(key,rank,parents=[])=>({key,rank,parents:parents.map(key=>({key}))});
 const nodes=[node('Acute',0),node('Improved',1,['Acute']),node('Keen',1,['Acute']),node('Trained',1),node('Reset',2,['Improved','Trained']),node('Weak',2,['Keen']),node('Uncanny',2,['Improved']),node('Uncanny II',3,['Uncanny'])];
 const sizes=new Map(nodes.map((n,i)=>[n.key,{width:80+i*19,height:n.key==='Trained'?24:40}]));
 const result=layoutFeatureGraph(nodes,sizes);assert.equal(result.crossings,0);
 for(const [key,p] of result.positions){
  assert.equal(p.width,sizes.get(key).width);assert.equal(p.height,sizes.get(key).height);
  assert(p.x>=0&&p.y>=0&&p.x+p.width<=result.width&&p.y+p.height<=result.height);
  for(const [other,q] of result.positions)if(other!==key)assert(p.x+p.width<=q.x||q.x+q.width<=p.x||p.y+p.height<=q.y||q.y+q.height<=p.y);
 }
 for(const e of result.edges){const a=result.positions.get(e.from),b=result.positions.get(e.to);assert(a.x+a.width<b.x);}
 const ordered=[...result.positions].filter(([key])=>nodes.find(n=>n.key===key).rank===1).sort((a,b)=>a[1].y-b[1].y).map(([key])=>key);
 assert(Math.abs(ordered.indexOf('Improved')-ordered.indexOf('Trained'))===1);
});

test('arrow shaft ends at the exact arrowhead tip, with each card’s actual width',()=>{
 const a={x:20,width:113,center:80},b={x:240,width:175,center:160},edge=featureEdgePath(a,b);
 assert(edge.shaft.startsWith('M133,80 '));assert(edge.shaft.endsWith('236,160'));
 assert(edge.head.includes(' L236,160 '));
 const short=featureEdgePath({...a,exitX:205},b);assert(short.shaft.startsWith('M133,80 H205 C'));
 const empty=layoutFeatureGraph([],new Map());assert.equal(empty.positions.size,0);assert(empty.width>0&&empty.height>0);
});

test('disconnected branches align in separate bands instead of crossing unrelated options',()=>{
 const nodes=[{key:'unrelated',rank:0,parents:[]},{key:'short',rank:0,parents:[]},{key:'wide',rank:0,parents:[]},{key:'first',rank:1,parents:[{key:'short'}]},{key:'second',rank:1,parents:[{key:'wide'}]}];
 const sizes=new Map(nodes.map(n=>[n.key,{width:n.key==='wide'?250:90,height:40}]));
 const {positions}=layoutFeatureGraph(nodes,sizes);
 assert.equal(positions.get('short').center,positions.get('first').center);
 assert.equal(positions.get('wide').center,positions.get('second').center);
 assert(positions.get('unrelated').y>positions.get('wide').y);
 assert(positions.get('short').exitX>positions.get('wide').x+positions.get('wide').width);
});

test('curved crossings get one underpass; shared branches, joins and separated paths stay intact',()=>{
 const pos=(x,center)=>({x,width:40,center,exitX:x+48});
 const edge=(from,to,a,b)=>({from,to,path:featureEdgePath(a,b)});
 const a=edge('a','d',pos(0,20),pos(200,120)),b=edge('b','c',pos(0,120),pos(200,20));
 const hits=featureCrossings([a,b]);assert.equal(hits.length,1);assert.equal(hits[0].under,0);assert.equal(hits[0].over,1);
 assert(Math.abs(hits[0].y-70)<.3);assert(hits[0].x>48&&hits[0].x<196);
 assert.deepEqual(featureCrossings([a,{...b,from:'a'}]),[]);
 assert.deepEqual(featureCrossings([a,{...b,to:'d'}]),[]);
 assert.deepEqual(featureCrossings([a,edge('b','c',pos(0,200),pos(200,300))]),[]);
 const flat=edge('e','f',pos(0,70),pos(200,70));assert.equal(featureCrossings([a,flat]).length,1);
 assert.deepEqual(featureCrossings([flat,{...flat,from:'g',to:'h'}]),[]);
});
