import test, {before,after} from 'node:test';
import assert from 'node:assert/strict';
import {api} from '../chana-api.mjs';
import {score,artworks,collections,normalizeName,validateProgress} from '../chana-game.mjs';
import {createStore} from '../store.mjs';
import {migrateDatabase} from '../migrate.mjs';
import {createServer} from '../app.mjs';
const connectionString=process.env.TEST_DATABASE_URL;
if(!connectionString)throw Error('Set TEST_DATABASE_URL to a disposable PostgreSQL database.');
let store;before(async()=>{await migrateDatabase(connectionString);store=await createStore(connectionString);});after(async()=>{await store.close();});
const ordered=artworks.map(a=>a.id);
const guesses=Object.fromEntries(collections.map(c=>[artworks.find(a=>a.collectionId===c.id).id,c.titleHe]));
function game(t){return async(path,{method='GET',token,body,origin}={})=>{const r=await store.chanaTransaction(path.match(/rooms\/(\d{6})/)?.[1]||'create',db=>api(new Request('http://localhost/api'+path,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),...(origin?{Origin:origin}:{})},...(body?{body:JSON.stringify(body)}:{})}),{DB:db}));return {status:r.status,...await r.json()};};}
async function setup(call){const h=crypto.randomUUID(),p=crypto.randomUUID();const room=await call('/rooms',{method:'POST',body:{hostToken:h}});const code=room.room.code;const player=await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:p,name:'משתתף ראשון'}});return {h,p,code,player};}
test('perfect order scores 100; reversed definite pairs score zero; one bonus per exhibition',()=>{
 assert.equal(score(ordered).chronology,100);assert.equal(score([...ordered].reverse()).chronology,0);
 const s=score(ordered,guesses);assert.equal(s.bonus,36);assert.equal(s.total,136);assert.equal(s.totalPairs,1326 - 51 - 9 - 3 - 9 - 12);
 const repeated=Object.fromEntries(artworks.map(a=>[a.id,collections.find(c=>c.id===a.collectionId).titleHe]));assert.equal(score(ordered,repeated).bonus,36);
});
test('same-year and overlapping ranges are never decisive',()=>{
 const original=[...ordered],groups=collections.filter(c=>c.yearStart===2010).map(c=>c.id),same=artworks.filter(a=>groups.includes(a.collectionId)).map(a=>a.id),start=original.indexOf(same[0]);original.splice(start,same.length,...same.reverse());assert.equal(score(original).chronology,100);
 const a=artworks.find(a=>a.collectionId==='the-golden-tray').id,b=artworks.find(a=>a.collectionId==='my-line').id;
 const swap=[...ordered],x=swap.indexOf(a),y=swap.indexOf(b);swap.splice(x,1);swap.splice(swap.indexOf(b)+1,0,a);assert.equal(score(swap).chronology,100);
});
test('bonus matching normalizes niqqud, spacing and punctuation but not unrelated guesses',()=>{
 assert.equal(normalizeName(' אמהוּת! '),normalizeName('אמהות'));assert.equal(normalizeName('הסתר פנים TAKE 2'),normalizeName('הסתר פנים take 2'));
 const id=artworks.find(a=>a.collectionId==='my-line').id;assert.equal(score(ordered,{[id]:'  קווים לדמותי! '}).bonus,2);assert.equal(score(ordered,{[id]:'קווים'}).bonus,0);
});
test('invalid/missing/repeated artwork, oversized guesses and invalid revisions rejected',()=>{
 for(const order of [ordered.slice(1),[...ordered.slice(1),ordered[1]],[...ordered.slice(1),'fake']])assert.throws(()=>validateProgress({order,guesses:{},revision:1}));
 assert.throws(()=>validateProgress({order:ordered,guesses:{[ordered[0]]:'x'.repeat(101)},revision:1}));
 assert.throws(()=>validateProgress({order:ordered,guesses:{},revision:-1}));
});
test('create and join retry idempotently, unique per-player shuffles, no answer leakage',async t=>{
 const call=game(t),{h,p,code,player}=await setup(call);assert.equal(player.me.order.length,52);assert.equal(new Set(player.me.order).size,52);
 const second=await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:crypto.randomUUID(),name:'שני'}});assert.notDeepEqual(player.me.order,second.me.order);
 assert.equal((await call('/rooms',{method:'POST',body:{hostToken:h}})).room.code,code);
 assert.equal((await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:p,name:'שם אחר'}})).me.id,player.me.id);
 for(const token of [h,p]){const s=await call('/rooms/'+code,{token});assert.equal(s.answers,undefined);assert.equal(s.results,undefined);assert.equal(s.submissions,undefined);assert.ok(!JSON.stringify(s).includes('yearStart'));assert.ok(!JSON.stringify(s.artworks).includes('collectionId'));assert.ok(!JSON.stringify(s).includes('host_hash'));}
});
test('host authorization, same-origin writes, closed registration, and empty-room start',async t=>{
 const call=game(t),{h,p,code}=await setup(call);
 assert.equal((await call('/rooms/'+code)).status,401);
 assert.equal((await call('/rooms/'+code,{token:crypto.randomUUID()})).status,403);
 assert.equal((await call('/rooms/'+code+'/start',{method:'POST',token:p,body:{}})).status,403);
 assert.equal((await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{},origin:'https://evil.test'})).status,403);
 assert.equal((await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}})).room.phase,'playing');
 assert.equal((await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:crypto.randomUUID(),name:'מאוחר'}})).status,409);
 assert.equal((await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:p,name:'חוזר'}})).status,200);
 const other=await call('/rooms',{method:'POST',body:{hostToken:crypto.randomUUID()}});assert.equal(other.room.phase,'lobby');
});
test('all must submit, drafts persist, stale saves rejected, submission immutable and retryable, shared review',async t=>{
 const call=game(t),{h,p,code}=await setup(call),p2=crypto.randomUUID();await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:p2,name:'שנייה'}});
 await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}});
 const progress={order:ordered,guesses,revision:3};assert.equal((await call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:progress})).me.revision,3);
 assert.equal((await call('/rooms/'+code,{token:p})).me.guesses[ordered[0]],guesses[ordered[0]]);
 assert.equal((await call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:{...progress,revision:2}})).status,409);
 assert.equal((await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}})).status,409);
 await call('/rooms/'+code+'/submit',{method:'POST',token:p,body:progress});
 assert.equal((await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}})).status,409);
 const retry=await call('/rooms/'+code+'/submit',{method:'POST',token:p,body:{...progress,order:[...ordered].reverse(),revision:4}});assert.deepEqual(retry.me.order,ordered);
 await call('/rooms/'+code+'/submit',{method:'POST',token:p2,body:{order:[...ordered].reverse(),guesses:{},revision:1}});
 const review=await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}});assert.equal(review.room.phase,'review');assert.equal(review.answers.length,18);assert.equal(review.results[0].total,136);assert.equal(review.results[1].total,0);assert.equal(review.submissions.length,2);
 assert.equal((await call('/rooms/'+code,{token:p})).submissions,undefined);
 await call('/rooms/'+code+'/advance',{method:'POST',token:h,body:{index:17}});assert.equal((await call('/rooms/'+code,{token:p2})).room.reviewIndex,17);
 assert.equal((await call('/rooms/'+code+'/results',{method:'POST',token:h,body:{}})).room.phase,'results');
});
test('host can remove an absent unsubmitted player; removed token loses access',async t=>{
 const call=game(t),{h,p,code}=await setup(call),absent=crypto.randomUUID();const joined=await call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:absent,name:'עזבתי'}});
 await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}});await call('/rooms/'+code+'/submit',{method:'POST',token:p,body:{order:ordered,guesses:{},revision:1}});
 await call('/rooms/'+code+'/remove',{method:'POST',token:h,body:{playerId:joined.me.id}});assert.equal((await call('/rooms/'+code,{token:absent})).status,403);
 assert.equal((await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}})).room.phase,'review');
});
test('order submission locks chronology while names remain editable until final submission',async t=>{
 const call=game(t),{h,p,code}=await setup(call),draft={order:ordered,guesses:{},revision:1};
 await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}});
 assert.equal((await call('/rooms/'+code+'/order',{method:'POST',token:h,body:draft})).status,403);
 const locked=await call('/rooms/'+code+'/order',{method:'POST',token:p,body:draft});
 assert.equal(locked.me.orderSubmitted,true);assert.equal(locked.me.submitted,false);assert.equal(locked.answers,undefined);
 assert.equal((await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}})).status,409);
 const retry=await call('/rooms/'+code+'/order',{method:'POST',token:p,body:{...draft,order:[...ordered].reverse(),revision:2}});
 assert.deepEqual(retry.me.order,ordered);assert.equal(retry.me.revision,1);
 for(const action of ['progress','submit']){
  assert.equal((await call('/rooms/'+code+'/'+action,{method:action==='progress'?'PUT':'POST',token:p,body:{...draft,order:[...ordered].reverse(),revision:2}})).status,409);
 }
 const names={order:ordered,guesses,revision:2};
 const saved=await call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:names});assert.deepEqual(saved.me.guesses,guesses);assert.equal(saved.me.submitted,false);
 assert.deepEqual((await call('/rooms/'+code,{token:p})).me.guesses,guesses);
 assert.equal((await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}})).status,409);
 const final=await call('/rooms/'+code+'/submit',{method:'POST',token:p,body:names});assert.equal(final.me.submitted,true);
 const late=await call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:{...names,guesses:{},revision:3}});assert.deepEqual(late.me.guesses,guesses);
 const review=await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}});assert.equal(review.results[0].total,136);assert.deepEqual(review.submissions[0].guesses,guesses);
});
test('host can award/revoke a reviewed spelling bonus; player cannot and total/rank persist',async t=>{
 const call=game(t),{h,p,code,player}=await setup(call),payload={playerId:player.me.id,collectionId:collections[0].id,correct:true};
 await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}});
 assert.equal((await call('/rooms/'+code+'/bonus',{method:'POST',token:h,body:payload})).status,409);
 await call('/rooms/'+code+'/submit',{method:'POST',token:p,body:{order:ordered,guesses:{},revision:1}});
 await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}});
 assert.equal((await call('/rooms/'+code+'/bonus',{method:'POST',token:p,body:payload})).status,403);
 const accepted=await call('/rooms/'+code+'/bonus',{method:'POST',token:h,body:payload});assert.equal(accepted.results[0].total,102);
 assert.equal((await call('/rooms/'+code,{token:p})).results[0].bonus,2);
 const revoked=await call('/rooms/'+code+'/bonus',{method:'POST',token:h,body:{...payload,correct:false}});assert.equal(revoked.results[0].total,100);
});
test('Railway HTTP route accepts custom-domain preflights and >2KB drafts without sharing the arcade limiter',async t=>{
 const app=createServer({store,allowedOrigins:['https://matanbob.com']});const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 const base=`http://127.0.0.1:${server.address().port}/api/leaderboards/chana`,h=crypto.randomUUID(),p=crypto.randomUUID();
 const send=async(path,token,body,method='POST')=>fetch(base+path,{method,headers:{Origin:'https://matanbob.com','Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
 const options=await fetch(base+'/rooms',{method:'OPTIONS',headers:{Origin:'https://matanbob.com','Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'authorization,content-type'}});
 assert.equal(options.status,204);assert.match(options.headers.get('access-control-allow-headers'),/Authorization/);assert.match(options.headers.get('access-control-allow-methods'),/PUT/);
 const created=await send('/rooms',null,{hostToken:h});assert.equal(created.status,201);assert.equal(created.headers.get('access-control-allow-origin'),'https://matanbob.com');const code=(await created.json()).room.code;
 assert.equal((await send('/rooms/'+code+'/join',null,{name:'מהאתר שלי',playerToken:p})).status,200);
 assert.equal((await send('/rooms/'+code+'/start',h,{})).status,200);
 const payload={order:ordered,guesses:Object.fromEntries(ordered.map(id=>[id,'תערוכה ארוכה לבדיקה '.repeat(3)])),revision:1};assert.ok(JSON.stringify(payload).length>2048);
 const saved=await send('/rooms/'+code+'/progress',p,payload,'PUT');assert.equal(saved.status,200,await saved.clone().text());assert.equal((await saved.json()).me.revision,1);
 const invalid=await fetch(base+'/rooms/'+code+'/submit',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json',Authorization:'Bearer '+p},body:JSON.stringify(payload)});assert.equal(invalid.status,403);
 assert.equal((await send('/rooms/'+code+'/submit',p,payload)).status,200);assert.equal((await send('/rooms/'+code+'/review',h,{})).status,200);
 const hidden=await fetch(`http://127.0.0.1:${server.address().port}/server/chana-catalogue.json`);assert.equal(hidden.status,404);
});
test('shared-room transactions preserve final drafts and support a 40-participant rehearsal',async t=>{
 const call=game(t),{h,p,code}=await setup(call);const tokens=[p,...Array.from({length:39},()=>crypto.randomUUID())];
 await Promise.all(tokens.slice(1).map((token,i)=>call('/rooms/'+code+'/join',{method:'POST',body:{playerToken:token,name:'בדיקה '+i}})));
 const room=await call('/rooms/'+code,{token:h});assert.equal(room.players.length,40);
 await call('/rooms/'+code+'/start',{method:'POST',token:h,body:{}});
 await Promise.all([3,2].map(revision=>call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:{order:ordered,guesses:{},revision}})));
 assert.equal((await call('/rooms/'+code,{token:p})).me.revision,3);
 assert.equal((await call('/rooms/'+code+'/progress',{method:'PUT',token:p,body:{order:[...ordered].reverse(),guesses:{},revision:3}})).status,409);
 await Promise.all(tokens.map(token=>call('/rooms/'+code+'/submit',{method:'POST',token,body:{order:ordered,guesses:{},revision:4}})));
 const review=await call('/rooms/'+code+'/review',{method:'POST',token:h,body:{}});assert.equal(review.room.phase,'review');assert.equal(review.results.length,40);assert.ok(review.results.every(r=>r.total===100&&r.rank===1));
});
