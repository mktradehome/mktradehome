/* Mktradehome Vision 2.0 dashboard navigation.
   Presentation-only reorganisation: existing cards and event-bound elements are moved,
   not rebuilt. No strategy, approval, risk, account or execution logic is changed. */
(()=>{
 const dashboard=document.getElementById("dashboard");
 const oldTrack=document.getElementById("pagesTrack");
 if(!dashboard||!oldTrack||document.getElementById("mkV2Shell"))return;
 const sourcePages=["tradingPage","recordsPage","journeyPage"].map(id=>document.getElementById(id)).filter(Boolean);
 const sections=[
  ["overview","Overview","System health and latest market snapshot"],
  ["account","My Account","Selected MT5 account and verified account snapshot"],
  ["charts","Watch Charts","Interactive charts and multi-timeframe market view"],
  ["scanner","Market Scanner","Compare markets and inspect evidence; WAIT when no candidate qualifies"],
  ["approval","Approval Centre","Review and manually approve eligible Demo proposals"],
  ["trades","Open Trades","Broker-confirmed positions only"],
  ["history","Trade History","Recorded completed trades and safety records"],
  ["performance","Performance","Backtests and measured outcomes with sample-size warnings"],
  ["alerts","Alerts & Activity","Market news, reminders and system notifications"],
  ["settings","Settings","Optional tools and account preferences"],
  ["journey","My Journey","Project milestones and progress"]
 ];
 const shell=document.createElement("div");shell.id="mkV2Shell";shell.className="mk-v2-shell";
 const sidebar=document.createElement("aside");sidebar.className="mk-v2-sidebar";
 sidebar.innerHTML='<div class="mk-v2-brand">MKTRADEHOME · WORKSTATION</div><nav class="mk-v2-nav" aria-label="Dashboard sections"></nav>';
 const nav=sidebar.querySelector("nav");
 const main=document.createElement("main");main.className="mk-v2-main";
 const views={};
 sections.forEach(([id,title,desc])=>{
  const view=document.createElement("section");view.className="mk-v2-view";view.dataset.section=id;view.hidden=true;
  view.innerHTML='<div class="mk-v2-heading"><div><h2>'+title+'</h2><p>'+desc+'</p></div></div><div class="mk-v2-content"></div>';
  views[id]=view;main.appendChild(view);
  const b=document.createElement("button");b.type="button";b.textContent=title;b.dataset.mkNav=id;b.addEventListener("click",()=>activate(id));nav.appendChild(b);
 });
 const mapCard=(card,origin)=>{
  const id=card.id||"";
  const heading=card.querySelector("h2")?.textContent.trim()||"";
  if(id==="accountSelectorCard"||id==="accountMonitor")return "account";
  if(id==="marketChartCard")return "charts";
  if(id==="approvalCentre")return "approval";
  if(id==="historicalBacktestCard")return "performance";
  if(id==="marketNewsCard")return "alerts";
  if(id==="safetyStatus"||heading==="Trading Safety & Records")return "history";
  if(heading==="Trading Reminder")return "settings";
  if(heading==="My Mktradehome Journey")return "journey";
  if(heading==="Markets"||id==="marketForesightCard"||id==="unifiedMarketContextCard"||id==="opportunityIntelligenceCard"||heading==="Market Analysis"||heading==="Market Intelligence")return "scanner";
  if(heading==="Trading Dashboard")return "overview";
  return origin==="recordsPage"?"history":origin==="journeyPage"?"journey":"settings";
 };
 sourcePages.forEach(page=>{
  Array.from(page.children).forEach(node=>{
   if(node.id==="advancedTools"){
    /* Unwrap the legacy More tools container first; it also has class=card. */
    Array.from(node.querySelectorAll(":scope > .card")).forEach(card=>{
     const key=mapCard(card,page.id);views[key].querySelector(".mk-v2-content").appendChild(card);
    });
    node.remove();
   }else if(node.classList?.contains("card")){
    const key=mapCard(node,page.id);views[key].querySelector(".mk-v2-content").appendChild(node);
   }
  });
 });
 const trades=views.trades.querySelector(".mk-v2-content");
 const note=document.createElement("div");note.className="mk-v2-placeholder";
 note.innerHTML="<strong>Live position feed not yet verified.</strong><p>Individual open positions and floating P/L will appear here only after the MT5 EA reports a complete, authenticated broker snapshot. Until then, Mktradehome will not guess whether a trade is open or closed.</p>";
 trades.appendChild(note);
 const mobile=document.createElement("nav");mobile.className="mk-v2-mobile-nav";mobile.setAttribute("aria-label","Quick dashboard navigation");
 const quick=[["overview","Home"],["charts","Charts"],["scanner","Scanner"],["trades","Trades"],["account","Account"]];
 quick.forEach(([id,label])=>{const b=document.createElement("button");b.type="button";b.textContent=label;b.dataset.mkNav=id;b.addEventListener("click",()=>activate(id));mobile.appendChild(b);});
 const more=document.createElement("button");more.type="button";more.textContent="More";more.setAttribute("aria-expanded","false");mobile.appendChild(more);
 const morePanel=document.createElement("div");morePanel.className="mk-v2-more";morePanel.hidden=true;
 sections.filter(([id])=>!quick.some(q=>q[0]===id)).forEach(([id,title])=>{const b=document.createElement("button");b.type="button";b.textContent=title;b.addEventListener("click",()=>{activate(id);morePanel.hidden=true;more.setAttribute("aria-expanded","false");});morePanel.appendChild(b);});
 more.addEventListener("click",()=>{morePanel.hidden=!morePanel.hidden;more.setAttribute("aria-expanded",String(!morePanel.hidden));});
 document.addEventListener("click",e=>{if(!morePanel.hidden&&!morePanel.contains(e.target)&&e.target!==more){morePanel.hidden=true;more.setAttribute("aria-expanded","false");}});
 shell.append(sidebar,main);dashboard.insertBefore(shell,oldTrack);dashboard.append(mobile,morePanel);
 function activate(id){
  sections.forEach(([key])=>{views[key].hidden=key!==id;});
  document.querySelectorAll("[data-mk-nav]").forEach(b=>b.classList.toggle("active",b.dataset.mkNav===id));
  const current=sections.find(s=>s[0]===id);if(current)document.title="Mktradehome | "+current[1];
  if(window.matchMedia("(max-width:760px)").matches)window.scrollTo({top:0,behavior:"smooth"});
  if(id==="charts"&&window.dispatchEvent)window.dispatchEvent(new Event("resize"));
 }
 activate("overview");
})();
