import './style.css';
import qrcode from './qrcode.mjs';
const GAME_URL=new URL('./chana.html',location.href);
const API_ROOT=import.meta.env.VITE_LEADERBOARD_API_ORIGIN?new URL('/api/leaderboards/chana',import.meta.env.VITE_LEADERBOARD_API_ORIGIN).href:new URL('./api/leaderboards/chana',location.href).href;
const $=s=>document.querySelector(s), app=$('#app'),modal=$('#modal');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const get=k=>{try{return JSON.parse(localStorage.getItem(k));}catch{return null;}};
const put=(k,v)=>{try{localStorage.setItem(k,JSON.stringify(v));return true;}catch{return false;}};
const button=(label,action,kind='primary',extra='')=>`<button class="${kind}" data-action="${action}" ${extra}>${label}</button>`;
let state=null,session=null,local=null,busy=false,saving=false,saveTimer,noticeTimer,pollTimer,lastSignature='',saveMessage='נשמר',view='join',selectedId=null;
let artworks=new Map(),undo=[],pollError=false,reviewDetailOpen=false;
const url=new URL(location.href),roomParam=url.searchParams.get('room')||'';
const brand=()=>`<a class="brand" href="${GAME_URL.pathname}" aria-label="חנה גולדברג — דף הבית"><span class="brand-mark">ח</span><span>חנה גולדברג</span></a>`;
function toast(message){const n=$('#notice');n.textContent=message;n.hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>n.hidden=true,5500);}
async function request(path,{method='GET',body,token=session?.token}={}){
 const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
 try{
  const r=await fetch(API_ROOT+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined,signal:controller.signal,cache:'no-store',credentials:'omit'});
  const data=await r.json();if(!r.ok){const error=Error(data.error||'לא הצלחנו להתחבר. נסו שוב.');error.status=r.status;throw error;}return data;
 }catch(e){if(!e.status)throw Error('אין כרגע חיבור למשחק. העבודה נשמרת בטלפון; נסו שוב כשהחיבור יחזור.');throw e;}finally{clearTimeout(timeout);}
}
function footer(){return `<footer><span>היצירות © חנה גולדברג · <a href="https://www.chanagoldberg.com/" target="_blank" rel="noopener">לאתר האמנית</a></span></footer>`;}
function home(){
 view=url.searchParams.has('host')?'host':view;const last=get('chana-last');
 app.innerHTML=`<main class="landing"><div class="landing-copy">${brand()}<p class="lead">סדרו 52 יצירות לפי שנת התערוכה,<br>מהמוקדם למאוחר.</p><div class="join-panel">${view==='host'?`<h1>ניהול המשחק</h1>${button('פתיחת משחק חדש','create')}<button class="text-button" data-action="join-view">הצטרפות למשחק</button>`:`<h1>הצטרפות למשחק</h1><form id="join-form"><label>קוד המשחק<input id="room-code" name="code" inputmode="numeric" pattern="[0-9]{6}" autocomplete="off" maxlength="6" minlength="6" dir="ltr" placeholder="000000" value="${esc(roomParam)}" required></label><label>שם<input name="name" autocomplete="given-name" maxlength="30" placeholder="השם שלך" required></label><button class="primary" type="submit">הצטרפות</button><p class="form-error" role="alert"></p></form><button class="text-button" data-action="host-view">ניהול המשחק במסך הגדול</button>`}${last?.code?`<button class="resume" data-action="resume">חזרה למשחק ${esc(last.code)}</button>`:''}</div></div><div class="landing-art"><img src="./art/chana/cover.webp" alt="נוף שמיים ומים מתוך יצירותיה של חנה גולדברג"></div></main>${footer()}`;
}
function remember(s){session=s;put('chana-session-'+s.role+'-'+s.code,s);put('chana-last',s);const u=new URL(location);u.search='?room='+s.code;u.hash=s.role==='host'?'host='+s.token:'';history.replaceState({},'',u);}
async function enter(data,s){remember(s);artworks=new Map(data.artworks.map(a=>[a.id,a]));state=data;undo=[];
 if(data.me){const saved=get('chana-progress-'+s.code);local=saved&&saved.playerId===data.me.id&&saved.revision>data.me.revision&&!data.me.submitted?saved:{playerId:data.me.id,order:data.me.order,guesses:data.me.guesses,revision:data.me.revision};if(local.revision>data.me.revision)saveMessage='שינויים שמורים בטלפון';}
 render();poll();clearInterval(pollTimer);pollTimer=setInterval(poll,2500);if(local&&local.revision>data.me?.revision&&data.room.phase==='playing')scheduleSave();
}
function stateSignature(s){return JSON.stringify({phase:s.room.phase,index:s.room.reviewIndex,players:s.players,submitted:s.me?.submitted,results:s.results});}
function applyState(data){
 const phases=['lobby','playing','review','results'];if(state&&phases.indexOf(data.room.phase)<phases.indexOf(state.room.phase))return;if(state?.me?.submitted&&data.me&&!data.me.submitted)return;
 const previous=state?.room.phase,wasSubmitted=state?.me?.submitted;state=data;artworks=new Map(data.artworks.map(a=>[a.id,a]));
 if(data.me&&((data.me.submitted&&!wasSubmitted)||!local)){local={playerId:data.me.id,order:data.me.order,guesses:data.me.guesses,revision:data.me.revision};}
 const next=stateSignature(data);if(next!==lastSignature){
  lastSignature=next;
  if(previous!==data.room.phase||wasSubmitted!==data.me?.submitted||session.role==='host'||data.room.phase!=='playing'){if(modal.open)modal.close();render();}
  else updateHeader();
 }
}
async function poll(){if(!session||busy||document.hidden)return;try{const data=await request('/rooms/'+session.code);applyState(data);if(pollError){pollError=false;updateHeader();if(local&&state.room.phase==='playing'&&!state.me?.submitted)scheduleSave();}}catch(e){pollError=true;updateHeader();if(e.status===403||e.status===404){clearInterval(pollTimer);toast(e.message);}}}
function topbar(){return `<header class="topbar">${brand()}<div class="session-meta"><span class="room-tag" dir="ltr">${state.room.code}</span><span>${session.role==='host'?'מסך המנחה':esc(state.me.name)}</span>${button('?', 'help','help-button','aria-label="איך משחקים"')}</div></header>`;}
function updateHeader(){const s=$('#save-status');if(s){s.textContent=pollError?'החיבור מתחדש…':saveMessage;s.classList.toggle('pending',pollError||saveMessage!=='נשמר במשחק');}const c=$('#submitted-count');if(c)c.textContent=`${state.players.filter(p=>p.submitted).length} מתוך ${state.players.length} שלחו`;}
function qrHtml(){const q=qrcode(0,'M');q.addData(GAME_URL.origin+GAME_URL.pathname+'?room='+state.room.code);q.make();return q.createSvgTag({cellSize:5,margin:12,scalable:true});}
function playerList(){return `<ul class="players">${state.players.map(p=>`<li><span class="avatar">${esc([...p.name][0])}</span><span class="player-name">${esc(p.name)}</span><span class="player-state ${p.submitted?'done':''}">${p.submitted?'✓ נשלח':state.room.phase==='lobby'?'הצטרפו':'מסדרים…'}</span>${session.role==='host'&&!p.submitted?`<button class="remove" data-remove="${p.id}" aria-label="הסרת ${esc(p.name)}">×</button>`:''}</li>`).join('')||'<li class="empty">ממתינים למשתתפים</li>'}</ul>`;}
function render(){
 if(!state)return home();lastSignature=stateSignature(state);
 app.innerHTML=topbar()+`<main class="game-main ${session.role==='host'?'host-main':''}" id="screen"></main>`+footer();
 const screen=$('#screen');
 if(state.room.phase==='lobby'){
  if(session.role==='host')screen.innerHTML=`<div class="host-heading"><h1>הצטרפות למשחק</h1><p>סרקו בטלפון והכניסו שם.</p></div><div class="lobby-layout"><section class="join-board"><div class="qr">${qrHtml()}</div><span class="muted">או נכנסים עם קוד המשחק</span><strong class="big-code" dir="ltr">${state.room.code}</strong><div class="button-row">${button('העתקת קישור','copy-join','secondary')}${button('מסך מלא','fullscreen','secondary')}</div></section><section class="attendance"><div class="section-heading"><h2>משתתפים</h2><span class="count">${state.players.length}</span></div>${playerList()}${button('התחלת המשחק','start','primary wide',state.players.length?'':'disabled')}<p class="small">ההצטרפות נסגרת עם תחילת המשחק.</p><button class="text-button" data-action="copy-host">העתקת קישור למנחה</button></section></div>`;
  else screen.innerHTML=`<section class="waiting"><span class="round-icon">✓</span><h1>ממתינים להתחלה</h1><div class="waiting-art"><img src="./art/chana/cover.webp" alt="ציור של חנה גולדברג"></div><span class="muted">${state.players.length} משתתפים</span></section>`;
 }else if(state.room.phase==='playing'){
  if(session.role==='host'){
   const done=state.players.filter(p=>p.submitted).length,all=done===state.players.length&&done>0;
   screen.innerHTML=`<div class="host-heading"><h1>${all?'כולם שלחו':'ממתינים לשליחה'}</h1></div><div class="playing-layout"><section class="progress-panel"><div class="progress-number">${done}<span>/${state.players.length}</span></div><h2>שלחו</h2><progress value="${done}" max="${state.players.length||1}"></progress>${button('הצגת התשובות','review','primary wide',all?'':'disabled')}<p class="small">התשובות נפתחות אחרי שכולם שולחים.</p>${button('מסך מלא','fullscreen','text-button')}</section><section class="attendance">${playerList()}<p class="small">× להסרת משתתף שלא שלח.</p></section></div>`;
  }else if(state.me.submitted){screen.innerHTML=`<section class="waiting"><span class="round-icon">✓</span><h1>נשלח</h1><p>ממתינים לתשובות במסך הגדול.</p><span class="pill" id="submitted-count">${state.players.filter(p=>p.submitted).length} מתוך ${state.players.length} שלחו</span><div class="waiting-art"><img src="./art/chana/cover.webp" alt="ציור של חנה גולדברג"></div></section>`;}
  else renderTimeline(screen);
 }else if(state.room.phase==='review')renderReview(screen);
 else renderResults(screen);
 updateHeader();if(reviewDetailOpen&&state.room.phase==='review'&&session.role==='host')reviewGuesses();
}
function renderTimeline(screen){
 screen.innerHTML=`<section class="timeline-heading"><div><h1>סדר היצירות</h1></div><span class="piece-count">52<small>יצירות</small></span></section><p class="instructions">סדרו לפי שנת התערוכה, מהמוקדם למאוחר.<br>לחצו על ציור להגדלה ולניחוש שם התערוכה.</p><div class="timeline-tools"><span class="save-status" id="save-status" role="status">${esc(saveMessage)}</span>${button('ביטול הזזה אחרונה','undo','text-button',undo.length?'':'disabled')}</div><div class="timeline-edge"><span>מוקדם ↑</span></div><div class="art-grid" id="art-grid">${local.order.map(card).join('')}</div><div class="timeline-edge end"><span>↓ מאוחר</span></div><div class="submit-bar">${button('שליחת הסדר','confirm-submit','primary wide')}</div>`;
}
function card(id,i){const a=artworks.get(id);return `<article class="art-card" data-art="${id}" draggable="true"><div class="card-top"><span class="position">${i+1}</span>${local.guesses[id]?.trim()?'<span class="guess-mark" aria-label="נוסף ניחוש">✦</span>':''}</div><button class="art-image" data-detail="${id}" aria-label="הגדלה וניחוש ליצירה ${i+1}"><img src="${a.thumbPath}" width="${a.width}" height="${a.height}" alt="יצירה ${i+1} על הציר" loading="lazy" decoding="async"></button><button class="move-button" data-move="${id}" aria-label="הזזת יצירה ${i+1}">↕ הזזה</button></article>`;}
function persist(){if(!put('chana-progress-'+session.code,local))toast('השמירה בטלפון אינה זמינה. השאירו את הדף פתוח עד השליחה.');}
function changed(){local.revision++;persist();saveMessage='נשמר בטלפון…';updateHeader();scheduleSave();}
function scheduleSave(){clearTimeout(saveTimer);saveTimer=setTimeout(save,700);}
async function save(){
 if(saving||!local||!state||state.room.phase!=='playing'||state.me?.submitted)return;
 saving=true;const revision=local.revision,body={order:[...local.order],guesses:{...local.guesses},revision};
 try{const data=await request('/rooms/'+session.code+'/progress',{method:'PUT',body});saveMessage=local.revision===revision?'נשמר במשחק':'נשמר בטלפון…';applyState(data);}catch(e){saveMessage='נשמר בטלפון · ממתין לחיבור';if(e.status===409)toast(e.message);}finally{saving=false;updateHeader();if(local.revision>revision)scheduleSave();}
}
function moveTo(id,index){const old=local.order.indexOf(id);if(old<0||old===index)return;undo.push([...local.order]);if(undo.length>20)undo.shift();local.order.splice(old,1);local.order.splice(Math.max(0,Math.min(51,index)),0,id);changed();render();const el=$(`[data-art="${id}"]`);el?.scrollIntoView({behavior:'smooth',block:'center'});el?.classList.add('just-moved');toast('היצירה הועברה למקום '+(local.order.indexOf(id)+1));}
function openModal(html,kind=''){modal.className=kind;modal.innerHTML=`<button class="modal-close" data-action="close-modal" aria-label="סגירה">×</button>${html}`;if(!modal.open)modal.showModal();}
function detail(id){const a=artworks.get(id),i=local.order.indexOf(id);selectedId=id;openModal(`<div class="detail-image"><img src="${a.imagePath}" alt="יצירה ${i+1} בהגדלה"></div><div class="detail-content"><span class="eyebrow">יצירה ${i+1} על הציר שלך</span><label>שם התערוכה <span class="muted">(בונוס, לא חובה)</span><input id="guess-input" maxlength="100" value="${esc(local.guesses[id]||'')}" placeholder="הניחוש שלך" autocomplete="off"></label><p class="small">2 נקודות לתערוכה. מספיק ניחוש נכון אחד.</p><div class="button-row">${button('שמירה וסגירה','close-detail')}${button('שינוי מיקום','detail-move','secondary')}</div></div>`,'detail-modal');}
function moveDialog(id){selectedId=id;const a=artworks.get(id);openModal(`<div class="move-dialog"><div class="moving-art"><img src="${a.thumbPath}" alt="היצירה להעברה"><div><span class="eyebrow">מקום נוכחי ${local.order.indexOf(id)+1}</span><h2>לאן להעביר?</h2></div></div><form id="move-form"><label>מספר המקום החדש<input type="number" inputmode="numeric" name="position" min="1" max="52" value="${local.order.indexOf(id)+1}" required></label><button class="primary" type="submit">העברה</button></form><p class="small">או בחרו את היצירה שלפניה תרצו למקם:</p><div class="move-targets">${local.order.map((other,i)=>`<button data-target="${other}" ${other===id?'disabled':''} aria-label="לפני יצירה ${i+1}"><img src="${artworks.get(other).thumbPath}" alt="" loading="lazy"><span>${i+1}</span></button>`).join('')}</div>${button('העברה לסוף הציר','move-last','secondary wide')}</div>`,'move-modal');}
function renderReview(screen){
 const g=state.answers[state.room.reviewIndex],idx=state.room.reviewIndex,host=session.role==='host',mine=state.results.find(p=>p.id===state.me?.id);
 const named=state.results.filter(p=>p.bonuses.find(b=>b.collectionId===g.id)?.correct).length;
 screen.innerHTML=`<div class="review-heading"><span class="eyebrow">תערוכה ${idx+1} מתוך 18</span><div class="review-title"><h1>${esc(g.titleHe)}</h1><span class="review-year" dir="ltr">${g.yearStart===g.yearEnd?g.yearStart:g.yearStart+'–'+g.yearEnd}</span></div></div><div class="review-pictures">${g.artworkIds.map(id=>`<button class="review-picture" data-zoom="${id}"><img src="${artworks.get(id).imagePath}" alt="יצירה מתוך ${esc(g.titleHe)}"></button>`).join('')}</div><div class="review-bottom"><span class="pill">✦ ${named} משתתפים זיהו את התערוכה${mine?.bonuses.find(b=>b.collectionId===g.id)?.correct?' · גם אתם! +2 נק׳':''}</span><span class="small">השנה היא שנת התערוכה</span></div>${host?`${button('ניחושים ובונוסים','review-guesses','secondary review-guesses-button')}<nav class="review-controls">${button('→ הקודמת','previous','secondary',idx===0?'disabled':'')}<span>${idx+1} / 18</span>${idx===17?button('תוצאות','results'):button('הבאה ←','next')}</nav><details class="review-jump"><summary>מעבר לתערוכה</summary><div class="review-dots">${state.answers.map((c,i)=>`<button data-review-index="${i}" class="${i===idx?'active':''}" aria-label="${esc(c.titleHe)}" title="${esc(c.titleHe)}">${i+1}</button>`).join('')}</div></details>`:`<div class="following"><span class="pulse"></span>מסונכרן עם המסך הגדול</div>`}`;
}
function renderResults(screen){
 const mine=state.results.find(p=>p.id===state.me?.id);
 screen.innerHTML=`<section class="results-heading"><h1>תוצאות</h1>${mine?`<div class="my-score"><strong>${mine.total}</strong><span>הנקודות שלך<br><small>${mine.chronology} על הסדר + ${mine.bonus} בונוס</small></span></div>`:''}</section><section class="results-table"><div class="section-heading"><span class="muted">מתוך 136 נקודות</span></div><table><thead><tr><th>מקום</th><th>שם</th><th>סדר</th><th>בונוס</th><th>סה״כ</th></tr></thead><tbody>${state.results.map(p=>`<tr class="${p.id===mine?.id?'my-row':''}"><td>${p.rank===1?'✦ ':''}${p.rank}</td><th scope="row">${esc(p.name)}</th><td>${p.chronology}</td><td>${p.bonus}</td><td class="total">${p.total}</td></tr>`).join('')}</tbody></table></section><div class="button-row results-actions">${button('הסדר הנכון','all-answers','secondary')}${session.role==='host'?button('הורדת התוצאות','download','secondary'):''}${session.role==='host'?button('פתיחת משחק נוסף','new-game','text-button'):''}</div>`;
}
function reviewGuesses(){
 reviewDetailOpen=true;const g=state.answers[state.room.reviewIndex];
 openModal(`<div class="review-guesses"><h2>${esc(g.titleHe)}</h2><p class="small">אפשר לאשר בונוס גם על שגיאת כתיב. 2 נקודות לתערוכה.</p>${state.submissions.map(p=>{const b=state.results.find(r=>r.id===p.id).bonuses.find(b=>b.collectionId===g.id),answers=g.artworkIds.map(id=>p.guesses[id]?.trim()).filter(Boolean),positions=g.artworkIds.map(id=>p.order.indexOf(id)+1);return `<section class="guess-review-row"><h3>${esc(p.name)}</h3><p>${answers.length?[...new Set(answers)].map(esc).join(' · '):'<span class="muted">לא נכתב ניחוש</span>'}</p><div class="guess-review-bottom"><small>מיקומים בציר: <bdi>${positions.join(', ')}</bdi></small><button class="${b.correct?'approved':'secondary'}" data-bonus-player="${p.id}" data-bonus-correct="${!b.correct}" aria-pressed="${b.correct}">${b.correct?'✓ בונוס מאושר · 2 נק׳':'אישור בונוס +2'}</button></div></section>`;}).join('')}</div>`,'answers-modal');
}
function allAnswers(){openModal(`<div class="answers"><h2>הסדר הנכון</h2>${state.answers.map(g=>`<section><div class="section-heading"><h3>${esc(g.titleHe)}</h3><span dir="ltr">${g.yearStart===g.yearEnd?g.yearStart:g.yearStart+'–'+g.yearEnd}</span></div><div class="answer-art">${g.artworkIds.map(id=>`<button data-zoom="${id}"><img src="${artworks.get(id).thumbPath}" alt="יצירה מתוך ${esc(g.titleHe)}" loading="lazy"></button>`).join('')}</div></section>`).join('')}</div>`,'answers-modal');}
async function hostAction(action,body){if(busy)return;busy=true;try{applyState(await request('/rooms/'+session.code+'/'+action,{method:'POST',body:body||{}}));}catch(e){toast(e.message);}finally{busy=false;}}
async function copy(text){try{await navigator.clipboard.writeText(text);toast('הקישור הועתק');}catch{openModal(`<h2>הקישור שלך</h2><label>אפשר להעתיק מכאן<input readonly dir="ltr" value="${esc(text)}"></label>`);}}
async function act(action){
 if(action==='host-view'||action==='join-view'){view=action==='host-view'?'host':'join';url.searchParams.delete('host');home();return;}
 if(action==='create'){
  if(busy)return;busy=true;const b=$('[data-action="create"]');if(b){b.disabled=true;b.textContent='פותחים את המשחק…';}
  const token=get('chana-pending-host')||crypto.randomUUID();put('chana-pending-host',token);
  try{const data=await request('/rooms',{method:'POST',body:{hostToken:token},token:null});put('chana-pending-host',null);await enter(data,{code:data.room.code,token,role:'host'});}catch(e){toast(e.message);home();}finally{busy=false;}return;
 }
 if(action==='resume'){const s=get('chana-last');if(s)try{await enter(await request('/rooms/'+s.code,{token:s.token}),s);}catch(e){toast(e.message);}return;}
 if(action==='close-modal'||action==='close-detail'){reviewDetailOpen=false;modal.close();if(state?.room.phase==='playing'&&state.me&&!state.me.submitted)render();return;}
 if(action==='detail-move'){moveDialog(selectedId);return;}
 if(action==='move-last'){const id=selectedId;modal.close();moveTo(id,51);return;}
 if(action==='undo'){if(undo.length){local.order=undo.pop();changed();render();}return;}
 if(action==='confirm-submit'){openModal(`<div class="confirm"><h2>לשלוח?</h2><p>לא ניתן לערוך את הסדר והניחושים אחרי השליחה.</p><div class="button-row">${button('כן, לשלוח','submit')}${button('חזרה','close-modal','secondary')}</div><p id="submit-error" class="form-error" role="alert"></p></div>`);return;}
 if(action==='submit'){
  if(busy)return;busy=true;const b=$('[data-action="submit"]');b.disabled=true;b.textContent='שולחים…';clearTimeout(saveTimer);
  try{const data=await request('/rooms/'+session.code+'/submit',{method:'POST',body:{order:local.order,guesses:local.guesses,revision:local.revision}});modal.close();applyState(data);toast('נשלח');}catch(e){$('#submit-error').textContent=e.message;b.disabled=false;b.textContent='ניסיון שליחה נוסף';}finally{busy=false;}return;
 }
 if(action==='help'){openModal(`<div class="help-content"><h2>איך משחקים?</h2><ol><li>סדרו לפי שנת התערוכה, מהמוקדם למאוחר. לחצו על ״הזזה״ לשינוי מיקום.</li><li>לחצו על ציור להגדלה ולניחוש שם התערוכה.</li><li>שלחו כשסיימתם. עוברים על התשובות יחד במסך הגדול.</li></ol><p class="small">עד 100 נקודות על הסדר + 2 לכל תערוכה שזוהתה (עד 36). שנים זהות או חופפות יכולות להופיע בכל סדר ביניהן.</p><p class="small">הסדר נשמר אוטומטית. לחזרה, פתחו באותו דפדפן.</p>${button('סגירה','close-modal')}</div>`);return;}
 if(action==='copy-join'){copy(GAME_URL.origin+GAME_URL.pathname+'?room='+state.room.code);return;}
 if(action==='copy-host'){copy(GAME_URL.origin+GAME_URL.pathname+'?room='+state.room.code+'#host='+session.token);return;}
 if(action==='fullscreen'){try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{toast('אפשר להגדיל את החלון דרך הדפדפן.');}return;}
 if(action==='previous'||action==='next'){hostAction('advance',{index:state.room.reviewIndex+(action==='next'?1:-1)});return;}
 if(['start','review','results'].includes(action)){hostAction(action);return;}
 if(action==='review-guesses'){reviewGuesses();return;}
 if(action==='all-answers'){allAnswers();return;}
 if(action==='new-game'){location.href=GAME_URL.pathname+'?host';return;}
 if(action==='download'){
  const data={room:state.room.code,scoring:{chronologyMax:100,bonusPerExhibition:2,totalMax:136},results:state.results,submissions:state.submissions,answers:state.answers};const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='chana-'+state.room.code+'-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);return;
 }
}
document.addEventListener('click',e=>{
 const target=e.target.closest('button');if(!target)return;
 if(target.dataset.action)act(target.dataset.action);
 if(target.dataset.detail)detail(target.dataset.detail);
 if(target.dataset.move)moveDialog(target.dataset.move);
 if(target.dataset.target){const id=selectedId,other=target.dataset.target;const remaining=local.order.filter(a=>a!==id),index=remaining.indexOf(other);modal.close();moveTo(id,index);}
 if(target.dataset.bonusPlayer)hostAction('bonus',{playerId:target.dataset.bonusPlayer,collectionId:state.answers[state.room.reviewIndex].id,correct:target.dataset.bonusCorrect==='true'});
 if(target.dataset.reviewIndex)hostAction('advance',{index:Number(target.dataset.reviewIndex)});
 if(target.dataset.remove){const id=target.dataset.remove,p=state.players.find(p=>p.id===id);openModal(`<div class="confirm"><h2>להסיר את ${esc(p.name)}?</h2><p>המשתתף יוסר מרשימת המשחק ולא יוכל לשלוח.</p>${button('הסרת המשתתף','remove-confirm','primary',`data-player="${id}"`)} ${button('ביטול','close-modal','secondary')}</div>`);}
 if(target.dataset.action==='remove-confirm'){const id=target.dataset.player;modal.close();hostAction('remove',{playerId:id});}
 if(target.dataset.zoom){const id=target.dataset.zoom;openModal(`<img class="zoom-image" src="${artworks.get(id).imagePath}" alt="יצירה בהגדלה">`,'zoom-modal');}
});
document.addEventListener('keydown',e=>{if(session?.role==='host'&&state?.room.phase==='review'&&!modal.open&&!['INPUT','TEXTAREA'].includes(e.target.tagName)){if(['ArrowLeft','PageDown'].includes(e.key)&&state.room.reviewIndex<17){e.preventDefault();act('next');}if(['ArrowRight','PageUp'].includes(e.key)&&state.room.reviewIndex>0){e.preventDefault();act('previous');}}});
document.addEventListener('input',e=>{if(e.target.id==='guess-input'&&selectedId){local.guesses[selectedId]=e.target.value;changed();}});
document.addEventListener('submit',async e=>{
 if(e.target.id==='join-form'){
  e.preventDefault();if(busy)return;const form=e.target,fields=new FormData(form),code=String(fields.get('code')).trim(),name=String(fields.get('name')).trim();
  if(!/^\d{6}$/.test(code)){form.querySelector('.form-error').textContent='קוד המשחק מורכב משש ספרות.';return;}
  busy=true;const submit=form.querySelector('[type="submit"]');submit.disabled=true;submit.textContent='מצטרפים…';
  const existing=get('chana-session-player-'+code);const token=existing?.role==='player'?existing.token:(get('chana-pending-player-'+code)||crypto.randomUUID());put('chana-pending-player-'+code,token);
  try{await enter(await request('/rooms/'+code+'/join',{method:'POST',body:{name,playerToken:token},token:null}),{code,token,role:'player'});}catch(error){form.querySelector('.form-error').textContent=error.message;submit.disabled=false;submit.textContent='הצטרפות';}finally{busy=false;}
 }
 if(e.target.id==='move-form'){e.preventDefault();const n=Number(new FormData(e.target).get('position'));if(Number.isInteger(n)&&n>=1&&n<=52){const id=selectedId;modal.close();moveTo(id,n-1);}}
});
let dragId=null;document.addEventListener('dragstart',e=>{const card=e.target.closest('[data-art]');if(card){dragId=card.dataset.art;e.dataTransfer.setData('text/plain',dragId);e.dataTransfer.effectAllowed='move';}});document.addEventListener('dragover',e=>{if(dragId&&e.target.closest('[data-art]'))e.preventDefault();});document.addEventListener('drop',e=>{const card=e.target.closest('[data-art]');if(dragId&&card){e.preventDefault();moveTo(dragId,local.order.indexOf(card.dataset.art));}dragId=null;});document.addEventListener('dragend',()=>dragId=null);
window.addEventListener('online',()=>{poll();scheduleSave();});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){poll();scheduleSave();}else if(local&&session&&state?.room.phase==='playing'&&!state.me?.submitted){persist();fetch(API_ROOT+'/rooms/'+session.code+'/progress',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.token},body:JSON.stringify({order:local.order,guesses:local.guesses,revision:local.revision}),keepalive:true}).catch(()=>{});}});
modal.addEventListener('cancel',()=>{reviewDetailOpen=false;});
modal.addEventListener('click',e=>{if(e.target===modal){const r=modal.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){reviewDetailOpen=false;modal.close();}}});
modal.addEventListener('close',()=>{if(state?.room.phase==='playing'&&state.me&&!state.me.submitted){const grid=$('#art-grid');if(grid)grid.innerHTML=local.order.map(card).join('');}});
async function init(){
 const hostToken=new URLSearchParams(location.hash.slice(1)).get('host');
 const s=hostToken&&/^\d{6}$/.test(roomParam)?{code:roomParam,token:hostToken,role:'host'}:roomParam?(get('chana-session-player-'+roomParam)||(get('chana-pending-player-'+roomParam)?{code:roomParam,token:get('chana-pending-player-'+roomParam),role:'player'}:null)):null;
 if(s){try{await enter(await request('/rooms/'+s.code,{token:s.token}),s);return;}catch(e){toast(e.message);}}
 home();
}
init();
