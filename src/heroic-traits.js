export const TRAIT_FIELDS = [
  ['age','Age'], ['gender','Gender'], ['height','Height (m)'], ['weight','Weight (kg)'],
  ['eyeColor','Eye Color'], ['hairColor','Hair Color'], ['skinColor','Skin Color'],
  ['appearance','Appearance'], ['personality','Personality'], ['background','Background'], ['goals','Goals'],
  ['era','Era'], ['heroType','Hero Type'],
];
export const TRAIT_TEXT = ['appearance','personality','background','goals'];
export const emptyTraits = () => Object.fromEntries(TRAIT_FIELDS.map(([key])=>[key,'']));
export const emptyStory = kind => kind==='destiny'?{kind,id:null,details:'',points:1}:kind==='background'?{kind,id:null,skills:[],language:''}:{kind:'none'};
export const activeBackground = (c,pack) => c.story?.kind==='background'?(pack.backgrounds||[]).find(r=>r.id===c.story.id && !r.excludedSpecies.includes(c.species)):null;
export function backgroundLanguage(c,pack) {
  const r=activeBackground(c,pack);
  if(!r)return '';
  return r.bonusLanguages.length===1?r.bonusLanguages[0]:r.bonusLanguages.includes(c.story.language)?c.story.language:'';
}
export function validateFinishing(c,pack,bad) {
  const object=v=>v!==null && typeof v==='object' && !Array.isArray(v);
  const text=v=>typeof v==='string' && v.length<=100000;
  if(c.heroicTraits!==undefined) {
    if(!object(c.heroicTraits) || Object.entries(c.heroicTraits).some(([k,v])=>!TRAIT_FIELDS.some(([key])=>key===k) || !text(v)))bad('heroic traits');
    for(const [key,list] of [['era',pack.heroicTraits?.eras||[]],['heroType',pack.heroicTraits?.heroTypes||[]]])if(c.heroicTraits[key] && !list.includes(c.heroicTraits[key]))bad(key);
  }
  if(c.story===undefined)return;
  const s=c.story;
  if(!object(s) || !['none','destiny','background'].includes(s.kind))bad('Destiny or Background');
  const keys={none:['kind'],destiny:['kind','id','details','points'],background:['kind','id','skills','language']}[s.kind];
  if(Object.keys(s).some(key=>!keys.includes(key)))bad('Destiny and Background must be exclusive');
  if(s.kind==='none')return;
  const r=(pack[s.kind==='destiny'?'destinies':'backgrounds']||[]).find(r=>r.id===s.id);
  if(s.id!==null && !r)bad(s.kind);
  if(s.kind==='destiny') {
    if(!text(s.details) || !Number.isInteger(s.points) || s.points<0 || s.points>c.levels.length)bad('Destiny details or points');
  } else {
    if(!Array.isArray(s.skills) || new Set(s.skills.filter(Boolean)).size!==s.skills.filter(Boolean).length || s.skills.length>(r?.skillChoices||0) || s.skills.some(id=>id!==null && !r?.relevantSkills.includes(id)))bad('Background skills');
    if(!text(s.language) || (s.language && !r?.bonusLanguages.includes(s.language)))bad('Background language');
  }
}
