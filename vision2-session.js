/* Mktradehome Vision 2.0 focused review sessions.
   Local-only planning timer; does not alter the four-market engine cadence,
   production V63 eligibility, approvals, account mode, or MT5 execution. */
(()=>{
 const scanner=document.querySelector('.mk-v2-view[data-section="scanner"] .mk-v2-content');
 if(!scanner||document.getElementById("mkReviewSession"))return;
 const card=document.createElement("section");
 card.id="mkReviewSession";card.className="card mk-review-session";
 card.innerHTML=`
  <h2>Focused Market Review</h2>
  <p>Set a time-boxed review window and choose which markets you want to pay closest attention to.</p>
  <div class="mk-review-grid">
   <label><input type="checkbox" value="BTCUSD" checked> BTC/USD</label>
   <label><input type="checkbox" value="EURUSD" checked> EUR/USD</label>
   <label><input type="checkbox" value="XAUUSD" checked> Gold</label>
   <label><input type="checkbox" value="USDJPY" checked> USD/JPY</label>
  </div>
  <label for="mkReviewDuration">Review duration</label>
  <select id="mkReviewDuration"><option value="15">15 minutes</option><option value="30" selected>30 minutes</option><option value="60">1 hour</option><option value="120">2 hours</option></select>
  <div class="mk-review-actions"><button type="button" id="mkReviewStart">Start Review</button><button type="button" id="mkReviewEnd" class="secondary" disabled>End Review</button><button type="button" id="mkReviewRefresh" class="secondary">Refresh All Markets</button></div>
  <div id="mkReviewStatus" class="status" role="status" aria-live="polite">No review session running.</div>
  <p class="small">Important: this is a personal review timer, not a separate trading engine. Mktradehome's existing background monitor continues to check all four markets on its normal schedule. The focus list does not filter signals. Refresh updates existing dashboard prices and technical context; production V63 rules alone govern eligible trade proposals. No trade is placed by starting a session.</p>
 `;
 const title=scanner.querySelector("h2");
 if(title?.parentElement?.classList.contains("mk-v2-heading"))title.parentElement.after(card);
 else scanner.prepend(card);
 const key="mktradehome_review_session_v1";
 const $=id=>document.getElementById(id);
 let tick=null;
 const boxes=()=>Array.from(card.querySelectorAll('input[type="checkbox"]'));
 const selected=()=>boxes().filter(x=>x.checked).map(x=>x.value);
 const fmt=ms=>{const n=Math.max(0,Math.ceil(ms/1000));return String(Math.floor(n/3600)).padStart(2,"0")+":"+String(Math.floor(n%3600/60)).padStart(2,"0")+":"+String(n%60).padStart(2,"0");};
 const setRunning=running=>{$("mkReviewStart").disabled=running;$("mkReviewEnd").disabled=!running;$("mkReviewDuration").disabled=running;boxes().forEach(x=>x.disabled=running);};
 const clear=()=>{if(tick)clearInterval(tick);tick=null;localStorage.removeItem(key);setRunning(false);};
 function paint(session){
  const left=session.endsAt-Date.now();
  if(left<=0){clear();$("mkReviewStatus").textContent="Review session completed. Your selected markets were "+session.markets.join(", ")+". Background monitoring remains unchanged.";return;}
  $("mkReviewStatus").textContent="REVIEW IN PROGRESS · "+fmt(left)+" remaining · Focus: "+session.markets.join(", ")+" · Started "+new Date(session.startedAt).toLocaleTimeString()+".";
 }
 function resume(){
  let session;try{session=JSON.parse(localStorage.getItem(key)||"null");}catch(_){session=null;}
  if(!session||!Array.isArray(session.markets)||!session.markets.length||!Number.isFinite(session.endsAt)||session.endsAt<=Date.now()){if(session)clear();return;}
  setRunning(true);paint(session);tick=setInterval(()=>paint(session),1000);
 }
 $("mkReviewStart").addEventListener("click",()=>{
  const markets=selected();
  if(!markets.length){$("mkReviewStatus").textContent="Choose at least one market to focus on.";return;}
  const minutes=Number($("mkReviewDuration").value);
  if(![15,30,60,120].includes(minutes))return;
  const session={startedAt:Date.now(),endsAt:Date.now()+minutes*60000,markets};
  localStorage.setItem(key,JSON.stringify(session));setRunning(true);paint(session);
  tick=setInterval(()=>paint(session),1000);
 });
 $("mkReviewEnd").addEventListener("click",()=>{clear();$("mkReviewStatus").textContent="Review session ended by you. Background monitoring continues as normal.";});
 $("mkReviewRefresh").addEventListener("click",()=>{
  const button=document.getElementById("refreshBtn");
  if(!button){$("mkReviewStatus").textContent="Dashboard refresh control is unavailable.";return;}
  button.click();
  $("mkReviewStatus").textContent="Requested the existing all-market dashboard refresh. The review timer and production trading rules are unchanged.";
 });
 resume();
})();
