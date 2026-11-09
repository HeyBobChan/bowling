import {collections,artworks,publicArtworks,shuffledIds,validateProgress,ranked} from './chana-game.mjs';
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
class Problem extends Error {constructor(status,message){super(message);this.status=status;}}
const fail=(status,message)=>{throw new Problem(status,message);};
const tokenValid=t=>typeof t==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t);
const hash=async token=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(v=>v.toString(16).padStart(2,'0')).join('');
const first=(db,sql,...args)=>db.prepare(sql).bind(...args).first();
const run=(db,sql,...args)=>db.prepare(sql).bind(...args).run();
const all=async(db,sql,...args)=>(await db.prepare(sql).bind(...args).all()).results;
async function body(req){
 if(Number(req.headers.get('Content-Length'))>24000)fail(413,'הבקשה גדולה מדי.');
 const value=await req.text();if(value.length>24000)fail(413,'הבקשה גדולה מדי.');
 try{const b=JSON.parse(value);if(!b||typeof b!=='object'||Array.isArray(b))throw Error();return b;}catch{fail(400,'הבקשה אינה תקינה.');}
}
async function payload(db,room,identity){
 const players=await all(db,'SELECT * FROM players WHERE room_code=? AND removed=0 ORDER BY joined_at,id',room.code);
 const result={room:{code:room.code,phase:room.phase,reviewIndex:room.review_index,expiresAt:room.expires_at},role:identity.role,players:players.map(p=>({id:p.id,name:p.name,submitted:!!p.submitted,orderSubmitted:!!(p.order_submitted||p.submitted)})),artworks:publicArtworks};
 if(identity.role==='player'){
  const p=players.find(p=>p.id===identity.id);if(!p)fail(403,'ההשתתפות שלך הוסרה מהמשחק.');
  result.me={id:p.id,name:p.name,order:JSON.parse(p.order_json),guesses:JSON.parse(p.guesses_json),revision:p.revision,submitted:!!p.submitted,orderSubmitted:!!(p.order_submitted||p.submitted)};
 }
 if(room.phase==='review'||room.phase==='results'){
  result.answers=collections.map(g=>({...g,artworkIds:artworks.filter(a=>a.collectionId===g.id).map(a=>a.id)}));
  result.results=ranked(players.filter(p=>p.submitted));
  if(identity.role==='host')result.submissions=players.filter(p=>p.submitted).map(p=>({id:p.id,name:p.name,order:JSON.parse(p.order_json),guesses:JSON.parse(p.guesses_json)}));
 }
 return result;
}
export async function api(req,env){
 try{
  if(!env.DB)fail(503,'המשחק אינו מחובר כרגע. נסו שוב בעוד רגע.');
  const db=env.DB.withSession?env.DB.withSession('first-primary'):env.DB;
  const url=new URL(req.url),path=url.pathname,method=req.method;
  if(!['GET','POST','PUT'].includes(method))fail(405,'הפעולה אינה נתמכת.');
  const origin=req.headers.get('Origin'),allowed=origin===url.origin||(env.ALLOWED_ORIGINS||[]).includes(origin);if(method!=='GET'&&((origin&&!allowed)||(req.headers.get('Sec-Fetch-Site')==='cross-site'&&!allowed)))fail(403,'יש לשלוח את הבקשה מתוך המשחק.');
  if(path==='/api/health'&&method==='GET'){await first(db,'SELECT 1 AS ok FROM rooms LIMIT 1');return json({ok:true});}
  if(path==='/api/rooms'&&method==='POST'){
   const b=await body(req);if(!tokenValid(b.hostToken))fail(400,'מפתח המנחה אינו תקין.');
   const h=await hash(b.hostToken);let room=await first(db,'SELECT * FROM rooms WHERE host_hash=?',h);
   if(!room){
    for(let tries=0;tries<8;tries++){
     const r=new Uint32Array(1);crypto.getRandomValues(r);const code=String(100000+r[0]%900000),now=Date.now();
     await run(db,'INSERT OR IGNORE INTO rooms(code,host_hash,created_at,expires_at) VALUES(?,?,?,?)',code,h,now,now+7*86400000);
     room=await first(db,'SELECT * FROM rooms WHERE host_hash=?',h);if(room)break;
    }
   }
   if(!room)fail(503,'לא הצלחנו ליצור משחק. נסו שוב.');
   return json(await payload(db,room,{role:'host'}),201);
  }
  const match=path.match(/^\/api\/rooms\/(\d{6})(?:\/(join|progress|order|submit|start|review|advance|results|remove|bonus))?$/);
  if(!match)fail(404,'העמוד לא נמצא.');
  const [,code,action]=match;let room=await first(db,'SELECT * FROM rooms WHERE code=?',code);
  if(!room||room.expires_at<Date.now())fail(404,'הקוד לא נמצא או שהמשחק הסתיים. בדקו את שש הספרות.');
  if(action==='join'&&method==='POST'){
   const b=await body(req);if(!tokenValid(b.playerToken))fail(400,'מפתח המשתתף אינו תקין.');
   const h=await hash(b.playerToken);let p=await first(db,'SELECT * FROM players WHERE room_code=? AND token_hash=?',code,h);
   if(p?.removed)fail(403,'ההשתתפות שלך הוסרה מהמשחק.');
   if(!p){
    const name=typeof b.name==='string'?b.name.trim().replace(/\s+/g,' '):'';
    if(!name||name.length>30||/[\p{C}]/u.test(name))fail(400,'כתבו שם באורך של עד 30 תווים.');
    const now=Date.now(),id=crypto.randomUUID();
    await run(db,"INSERT OR IGNORE INTO players(id,room_code,token_hash,name,order_json,joined_at,updated_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase='lobby') AND (SELECT COUNT(*) FROM players WHERE room_code=? AND removed=0)<120",id,code,h,name,JSON.stringify(shuffledIds()),now,now,code,code);
    p=await first(db,'SELECT * FROM players WHERE room_code=? AND token_hash=?',code,h);
    if(!p)fail(409,'ההרשמה למשחק נסגרה או שהמשחק מלא.');
   }
   room=await first(db,'SELECT * FROM rooms WHERE code=?',code);
   return json(await payload(db,room,{role:'player',id:p.id}));
  }
  const token=(req.headers.get('Authorization')||'').replace(/^Bearer /,'');if(!tokenValid(token))fail(401,'יש להצטרף למשחק מחדש במכשיר הזה.');
  const h=await hash(token);let identity;
  if(h===room.host_hash)identity={role:'host'};
  else {const p=await first(db,'SELECT id FROM players WHERE room_code=? AND token_hash=? AND removed=0',code,h);if(!p)fail(403,'אין הרשאה למשחק הזה.');identity={role:'player',id:p.id};}
  if(!action&&method==='GET')return json(await payload(db,room,identity));
  if(['progress','order','submit'].includes(action)&&method===(action==='progress'?'PUT':'POST')){
   if(identity.role!=='player')fail(403,'הפעולה מיועדת למשתתפים.');
   const current=await first(db,'SELECT * FROM players WHERE id=?',identity.id);
   if(!current.submitted&&!(action==='order'&&current.order_submitted)){
    let data;try{data=validateProgress(await body(req));}catch(e){if(e instanceof Problem)throw e;fail(400,e.message);}
    if(room.phase!=='playing')fail(409,'אפשר לשמור ולשלוח רק בזמן המשחק.');
    if(current.order_submitted&&JSON.stringify(data.order)!==current.order_json)fail(409,'הסדר כבר נשלח. אפשר לערוך רק את שמות התערוכות.');
    if(data.revision<current.revision||(data.revision===current.revision&&(JSON.stringify(data.order)!==current.order_json||JSON.stringify(data.guesses)!==current.guesses_json)))fail(409,'קיימת שמירה חדשה יותר. רעננו לפני השליחה.');
    const r=await run(db,"UPDATE players SET order_json=?,guesses_json=?,revision=?,submitted=?,order_submitted=?,updated_at=? WHERE id=? AND (revision<? OR (revision=? AND order_json=? AND guesses_json=?)) AND submitted=0 AND removed=0 AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase='playing')",JSON.stringify(data.order),JSON.stringify(data.guesses),data.revision,action==='submit'?1:0,(action==='order'||action==='submit'||current.order_submitted)?1:0,Date.now(),identity.id,data.revision,data.revision,JSON.stringify(data.order),JSON.stringify(data.guesses),code);
    if(!r.meta.changes)fail(409,'המשחק השתנה. רעננו ונסו שוב.');
   }
   room=await first(db,'SELECT * FROM rooms WHERE code=?',code);return json(await payload(db,room,identity));
  }
  if(identity.role!=='host')fail(403,'רק המנחה יכול לבצע את הפעולה.');
  if(method!=='POST')fail(405,'הפעולה אינה נתמכת.');
  if(action==='start'){
   const r=await run(db,"UPDATE rooms SET phase='playing' WHERE code=? AND phase='lobby' AND EXISTS(SELECT 1 FROM players WHERE room_code=? AND removed=0)",code,code);
   if(!r.meta.changes&&room.phase!=='playing')fail(409,'צריך לפחות משתתף אחד כדי להתחיל.');
  }else if(action==='review'){
   const r=await run(db,"UPDATE rooms SET phase='review',review_index=0 WHERE code=? AND phase='playing' AND EXISTS(SELECT 1 FROM players WHERE room_code=? AND removed=0) AND NOT EXISTS(SELECT 1 FROM players WHERE room_code=? AND submitted=0 AND removed=0)",code,code,code);
   if(!r.meta.changes&&room.phase!=='review')fail(409,'מחכים שכל המשתתפים ישלחו לפני חשיפת התשובות.');
  }else if(action==='advance'){
   const b=await body(req);if(!Number.isInteger(b.index)||b.index<0||b.index>=collections.length)fail(400,'תערוכה לא תקינה.');
   await run(db,"UPDATE rooms SET review_index=? WHERE code=? AND phase='review'",b.index,code);
  }else if(action==='results'){
   await run(db,"UPDATE rooms SET phase='results' WHERE code=? AND phase='review'",code);
  }else if(action==='bonus'){
   const b=await body(req);if(!collections.some(g=>g.id===b.collectionId)||typeof b.correct!=='boolean'||typeof b.playerId!=='string')fail(400,'בקשת בונוס אינה תקינה.');
   if(!['review','results'].includes(room.phase))fail(409,'אפשר לאשר בונוס רק בסקירה המשותפת.');
   const p=await first(db,'SELECT * FROM players WHERE id=? AND room_code=? AND submitted=1 AND removed=0',b.playerId,code);if(!p)fail(404,'המשתתף לא נמצא.');
   const overrides=JSON.parse(p.bonus_overrides_json);overrides[b.collectionId]=b.correct;
   await run(db,'UPDATE players SET bonus_overrides_json=? WHERE id=? AND room_code=?',JSON.stringify(overrides),b.playerId,code);
  }else if(action==='remove'){
   const b=await body(req);if(typeof b.playerId!=='string')fail(400,'משתתף לא תקין.');
   await run(db,"UPDATE players SET removed=1 WHERE room_code=? AND id=? AND submitted=0 AND EXISTS(SELECT 1 FROM rooms WHERE code=? AND phase IN ('lobby','playing'))",code,b.playerId,code);
  }else fail(404,'הפעולה לא נמצאה.');
  room=await first(db,'SELECT * FROM rooms WHERE code=?',code);return json(await payload(db,room,identity));
 }catch(error){if(!(error instanceof Problem))console.error('Game request failed:',error.message);return json({error:error instanceof Problem?error.message:'החיבור למשחק נקטע. נסו שוב בעוד רגע.'},error.status||503);}
}
