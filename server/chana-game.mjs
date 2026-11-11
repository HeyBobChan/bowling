import catalogue from './chana-catalogue.json' with { type: 'json' };
export const collections = catalogue.collections;
export const artworks = catalogue.artworks;
export const artById = new Map(artworks.map(a => [a.id,a]));
export const collectionById = new Map(collections.map(g => [g.id,g]));
export const normalizeName = value => String(value || '').normalize('NFKC').replace(/[\u0591-\u05c7]/g, '').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
// A close spelling still earns the bonus. Hebrew is written with or without ו/י,
// final letters and niqqud vary, and phone typing drops, adds or swaps a letter.
const FINAL_LETTERS = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' };
const nameWords = value => String(value || '').normalize('NFKC').replace(/־/g, ' ')
  .replace(/[֑-ׇ]/g, '').toLowerCase().replace(/[ךםןףץ]/g, letter => FINAL_LETTERS[letter])
  .split(/[^\p{L}\p{N}]+/u).filter(Boolean);
const skeleton = words => words.join('').replace(/[וי]/g, '');
const digits = text => text.replace(/\D/g, '');
// One typo in a name of six letters or more, two from twelve; none in shorter
// names, where a single letter makes another word (אמהות / אמנות).
const allowedTypos = length => length >= 12 ? 2 : length >= 6 ? 1 : 0;
function typoDistance(a, b) {
  let beforePrevious = [], previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      // Two neighbouring letters typed in the wrong order count as one typo.
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) row[j] = Math.min(row[j], beforePrevious[j - 2] + 1);
    }
    beforePrevious = previous; previous = row;
  }
  return previous[b.length];
}
// For a title of four words or more, its first three words are enough.
const closeForms = name => {
  const words = nameWords(name), forms = [words];
  for (let count = 3; count < words.length; count++) forms.push(words.slice(0, count));
  return forms.map(skeleton);
};
const closeNames = new Map(collections.map(g => [g.id, [...new Set(g.acceptedNamesHe.flatMap(closeForms))]]));
// Numbers must agree, so "הסתר פנים" and "הסתר פנים Take 2" never stand in for each other.
export function closeName(guess, collectionId) {
  const text = skeleton(nameWords(guess));
  return text !== '' && closeNames.get(collectionId).some(name => digits(name) === digits(text) && typoDistance(text, name) <= allowedTypos(name.length));
}
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
 const bonuses=collections.map(g=>{
  const own=artworks.filter(a=>a.collectionId===g.id).map(a=>guesses[a.id]);
  const exact=own.some(guess=>normalizeName(guess)!==''&&g.acceptedNamesHe.some(name=>normalizeName(name)===normalizeName(guess)));
  const correct=exact||own.some(guess=>closeName(guess,g.id));
  // close: accepted on a near spelling, so the host can glance at it during review.
  return {collectionId:g.id,correct,close:correct&&!exact};
 });
 for(const b of bonuses){b.automatic=b.correct;b.manual=Object.hasOwn(overrides,b.collectionId);if(b.manual)b.correct=overrides[b.collectionId];}
 const chronology=Math.round(correctPairs/totalPairs*100),bonus=bonuses.filter(b=>b.correct).length*2;
 return {chronology,bonus,total:chronology+bonus,correctPairs,totalPairs,bonuses};
}
// During shared review only the name bonuses are sent, in joining order: order
// scores, totals and ranks stay on the server until the host opens the results.
export function reviewed(players) {
 return players.map(p=>({id:p.id,name:p.name,bonuses:score(JSON.parse(p.order_json),JSON.parse(p.guesses_json),JSON.parse(p.bonus_overrides_json||'{}')).bonuses}));
}
export function ranked(players) {
 const list=players.map(p=>({id:p.id,name:p.name,...score(JSON.parse(p.order_json),JSON.parse(p.guesses_json),JSON.parse(p.bonus_overrides_json||'{}'))})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'he'));
 let rank=0;return list.map((p,i)=>{if(i===0||p.total!==list[i-1].total)rank=i+1;return {...p,rank};});
}
