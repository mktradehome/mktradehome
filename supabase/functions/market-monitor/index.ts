import { createClient } from "npm:@supabase/supabase-js@2";
import { analyseTimeframe, buildCandidate, normalizeCandles, validateCandidate, type Timeframe } from "../_shared/technical-engine.ts";

const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-monitor-secret","Access-Control-Allow-Methods":"POST,OPTIONS"};
const symbols=["BTCUSD","EURUSD","XAUUSD","USDJPY"];
const DEMO_ACCOUNT="486163696";
const DEMO_SERVER="Exness-MT5Trial10";
const DASHBOARD_USER_ID="eb254614-cc9d-4846-adb6-fd45e5594a96";
const frames:{key:Timeframe;interval:string}[]=[
 {key:"5M",interval:"5m"},{key:"15M",interval:"15m"},{key:"1H",interval:"1h"},{key:"4H",interval:"4h"}
];
const reply=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json"}});
async function getJson(url:string,timeout=12000){
 const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeout)});
 if(!r.ok)throw new Error("Provider HTTP "+r.status);
 return await r.json();
}
async function getFrame(symbol:string,frame:{key:Timeframe;interval:string}){
 const p=await getJson(`https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc?interval=${frame.interval}&limit=240`);
 return normalizeCandles(Array.isArray(p)?p:(p.bars||p.data||p.candles||[]),frame.key);
}
Deno.serve(async(req)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try{
  const secret=Deno.env.get("MARKET_MONITOR_SECRET");
  if(!secret||req.headers.get("x-monitor-secret")!==secret)return reply({error:"Unauthorized"},401);
  const url=Deno.env.get("SUPABASE_URL"),key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!key)return reply({error:"Missing Supabase configuration"},500);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const qdata=await getJson("https://biquote.io/api/latest?symbols=BTCUSD&symbols=EURUSD&symbols=XAUUSD&symbols=USDJPY");
  const quotes=qdata.data||qdata.quotes||qdata,results:any[]=[];
  for(const symbol of symbols){
   try{
    const q=quotes[symbol],bid=Number(q?.bid),ask=Number(q?.ask),age=Number(q?.quoteAgeSeconds);
    const quote={bid,ask,stale:q?.stale,marketState:symbol==="BTCUSD"?"open":String(q?.marketState||"").toLowerCase(),quoteAgeSeconds:age};
    if(!q||quote.stale!==false||quote.marketState!=="open"||!Number.isFinite(age)||age<0||age>30||!Number.isFinite(bid)||!Number.isFinite(ask)||bid<=0||ask<bid){
     results.push({symbol,signal:"WAIT",reason:"Quote is stale, invalid or market is not confirmed open."});continue;
    }
    const sets=await Promise.all(frames.map(f=>getFrame(symbol,f)));
    const tf={} as Record<Timeframe,ReturnType<typeof analyseTimeframe>>;
    for(let i=0;i<frames.length;i++)tf[frames[i].key]=analyseTimeframe(sets[i],frames[i].key);
    const candidate=buildCandidate(tf,quote);
    if(!candidate||!validateCandidate(candidate)){
     results.push({symbol,signal:"WAIT",reason:"Trend alignment, indicator, candle freshness, entry distance or risk checks failed.",timeframes:tf});continue;
    }
    const {data:prev,error:prevError}=await db.from("market_signal_state").select("last_signal,updated_at").eq("symbol",symbol).maybeSingle();
    if(prevError)throw prevError;
    const ageMs=prev?.updated_at?Date.now()-Date.parse(prev.updated_at):Infinity;
    if(prev?.last_signal===candidate.signal&&ageMs>=0&&ageMs<600000){
     results.push({symbol,signal:candidate.signal,duplicateSuppressed:true});continue;
    }
    const {data:queueRows,error:activeError}=await db.from("mt5_trade_queue").select("id,status,expires_at").eq("account_number",DEMO_ACCOUNT).eq("account_server",DEMO_SERVER).eq("symbol",symbol).in("status",["approved","executing"]);
    if(activeError)throw activeError;
    const active=(queueRows||[]).some((row:any)=>row.status==="executing"||(row.status==="approved"&&row.expires_at&&Date.parse(row.expires_at)>Date.now()));
    if(active){results.push({symbol,signal:candidate.signal,duplicateSuppressed:true,reason:"An approval or execution is already active."});continue;}
    const created=new Date().toISOString();
    const proof={
     source:"mktradehome-technical-engine",engineVersion:"1.0.0",engineVerified:true,
     verificationStatus:"PASSED",gptVerified:false,fallbackVerified:false,
     checkedAt:created,expiresAt:new Date(Date.now()+600000).toISOString(),
     qualityScore:candidate.qualityScore,qualityScoreIsWinProbability:false,
     explanation:candidate.explanation,risk_note:"Rule-based analysis is not a guarantee. Check the live chart before manual Demo approval.",
     timeframes:tf,quote:{bid,ask,price:candidate.entry,quoteAgeSeconds:age,marketState:quote.marketState}
    };
    const message=[
     "📊 MKTRADEHOME TECHNICAL SIGNAL","",symbol+" · "+candidate.signal,
     "Entry: "+candidate.entry,"Stop Loss: "+candidate.stopLoss,
     "TP1 (1:2): "+candidate.takeProfit1,"TP2 (1:3): "+candidate.takeProfit2,
     "Rule quality score: "+candidate.qualityScore+"/100 (not win probability)",
     "Engine: independent technical rules — no GPT API",
     "Expires in 10 minutes. Review the live chart before deciding.",
     "Alert only — no trade has been placed."
    ].join("\n");
    const errors:string[]=[];
    const {data:row,error:saveError}=await db.from("trade_signals").insert({
     user_id:DASHBOARD_USER_ID,symbol,signal:candidate.signal,entry_price:candidate.entry,
     stop_loss:candidate.stopLoss,take_profit_1:candidate.takeProfit1,take_profit_2:candidate.takeProfit2,
     confidence:candidate.qualityScore,analysis:JSON.stringify(proof)
    }).select("id").single();
    if(saveError||!row)throw new Error("Signal save failed: "+(saveError?.message||"no row returned"));
    const {error:alertError}=await db.from("trade_alerts").insert({
     user_id:DASHBOARD_USER_ID,trade_id:row.id,symbol,alert_type:candidate.signal,message
    });
    if(alertError)errors.push("In-app alert: "+alertError.message);
    const {error:stateError}=await db.from("market_signal_state").upsert({symbol,last_signal:candidate.signal,updated_at:created});
    if(stateError)errors.push("State: "+stateError.message);
    results.push({symbol,signal:candidate.signal,status:"Independent candidate saved; open dashboard for manual Demo review. Telegram is sent only after approval.",candidateId:row.id,inAppAlert:!alertError,telegramDelivered:false,expiresInMinutes:10,qualityScore:candidate.qualityScore,errors});
   }catch(e){results.push({symbol,signal:"WAIT",reason:e instanceof Error?e.message:"Analysis failed safely."});}
  }
  console.log("MKTRADEHOME_SCAN",JSON.stringify(results.map(r=>({symbol:r.symbol,signal:r.signal,reason:r.reason||r.status||"",timeframes:r.timeframes?Object.fromEntries(Object.entries(r.timeframes).map(([k,v]:any)=>[k,v.signal])):undefined,quoteAgeSeconds:r.quoteAgeSeconds}))));
  return reply({success:true,engine:"mktradehome-technical-engine",gptUsed:false,results});
 }catch(e){return reply({error:e instanceof Error?e.message:"Monitor error"},500);}
});
