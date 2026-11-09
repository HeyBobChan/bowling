import catalogue from './chana-catalogue.json' with { type: 'json' };
export const collections = catalogue.collections;
export const artworks = catalogue.artworks;
export const artById = new Map(artworks.map(a => [a.id,a]));
export const collectionById = new Map(collections.map(g => [g.id,g]));
export const normalizeName = value => String(value || '').normalize('NFKC').replace(/[\u0591-\u05c7]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export const publicArtworks = artworks.map(({id,imagePath,thumbPath,width,height}) => ({id,imagePath,thumbPath,width,height})).sort((a,b)=>a.id.localeCompare(b.id));
export function shuffledIds() {
 const ids=artworks.map(a=>a.id); const random=new Uint32Array(ids.length);crypto.getRandomValues(random);
 for(let i=ids.length-1;i>0;i--){const j=random[i]%(i+1);[ids[i],ids[j]]=[ids[j],ids[i]];}return ids;
}
export function validateProgress(body) {
 if(!Array.isArray(body.order)||body.order.length!==52||new Set(body.order).size!==52||body.order.some(id=>!artById.has(id)))throw new Error('יש לשלוח את כל 52 היצירות, פעם אחת כל אחת.');
 if(!body.guesses||Array.isArray(body.guesses)||typeof body.guesses!=='object')throw new Error('תשובות הבונוס אינן תקינות.');
 const guesses={};for(const [id,value] of Object.entries(body.guesses)){
  if(!artById.has(id)||typeof value!=='string'||value.length>100)throw new Error('שם תערוכה יכול להכיל עד 100 תווים.');
  guesses[id]=value.trim();
 }
 if(!Number.isSafeInteger(body.revision)||body.revision<0||body.revision>1000000)throw new Error('גרסת השמירה אינה תקינה.');
 return {order:body.order,guesses,revision:body.revision};
}
export function score(order,guesses={},overrides={}) {
 const positions=new Map(order.map((id,i)=>[id,i]));let correctPairs=0,totalPairs=0;
 for(let i=0;i<artworks.length;i++)for(let j=i+1;j<artworks.length;j++){
  const a=artworks[i],b=artworks[j],ga=collectionById.get(a.collectionId),gb=collectionById.get(b.collectionId);
  if(ga.yearEnd<gb.yearStart){totalPairs++;if(positions.get(a.id)<positions.get(b.id))correctPairs++;}
  else if(gb.yearEnd<ga.yearStart){totalPairs++;if(positions.get(b.id)<positions.get(a.id))correctPairs++;}
 }
 const bonuses=collections.map(g=>({collectionId:g.id,correct:artworks.some(a=>a.collectionId===g.id&&g.acceptedNamesHe.some(name=>normalizeName(name)===normalizeName(guesses[a.id])&&normalizeName(guesses[a.id])!==''))}));
 for(const b of bonuses){b.automatic=b.correct;b.manual=Object.hasOwn(overrides,b.collectionId);if(b.manual)b.correct=overrides[b.collectionId];}
 const chronology=Math.round(correctPairs/totalPairs*100),bonus=bonuses.filter(b=>b.correct).length*2;
 return {chronology,bonus,total:chronology+bonus,correctPairs,totalPairs,bonuses};
}
export function ranked(players) {
 const list=players.map(p=>({id:p.id,name:p.name,...score(JSON.parse(p.order_json),JSON.parse(p.guesses_json),JSON.parse(p.bonus_overrides_json||'{}'))})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'he'));
 let rank=0;return list.map((p,i)=>{if(i===0||p.total!==list[i-1].total)rank=i+1;return {...p,rank};});
}
