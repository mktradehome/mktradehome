import { createClient } from "npm:@supabase/supabase-js@2";
export type Side = "BUY" | "SELL" | "WAIT";
export type Timeframe = "5M" | "15M" | "1H" | "4H";

export interface Candle {
  open: number; high: number; low: number; close: number;
  time: number; isOpen?: boolean;
}
export interface Indicators {
  signal: Side; close: number; ema20: number; ema20Previous: number; ema50: number;
  rsi14: number; macd: number; macdSignal: number; macdHistogram: number;
  atr14: number; bars: number; candleAgeSeconds: number;
  reason: string;
}
export interface Candidate {
  signal: "BUY" | "SELL"; entry: number; stopLoss: number;
  takeProfit1: number; takeProfit2: number; riskDistance: number;
  qualityScore: number; explanation: string;
}
const PERIOD_MS: Record<Timeframe, number> = {
  "5M": 5 * 60_000, "15M": 15 * 60_000,
  "1H": 60 * 60_000, "4H": 4 * 60 * 60_000,
};
const finite = (n: number) => Number.isFinite(n) && n > 0;

export function ema(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return NaN;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gain += delta; else loss -= delta;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function macd(values: number[]) {
  const fast = ema(values.slice(-120), 12);
  const slow = ema(values.slice(-120), 26);
  const line = fast - slow;
  const lines: number[] = [];
  for (let i = 26; i <= values.length; i++) {
    const sample = values.slice(0, i);
    lines.push(ema(sample.slice(-120), 12) - ema(sample.slice(-120), 26));
  }
  const signal = ema(lines.slice(-60), 9);
  return { line, signal, histogram: line - signal };
}
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return NaN;
  const ranges: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}
export function normalizeCandles(input: any[], timeframe: Timeframe, now = Date.now()): Candle[] {
  if (!Array.isArray(input)) throw new Error("Candle response is not an array.");
  const rows = input.filter((c) => c && c.isOpen !== true).map((c) => {
    let raw = c.time ?? c.openTime ?? c.timestamp ?? c.open_time;
    let time = typeof raw === "string"
      ? (/^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw))
      : Number(raw);
    if (Number.isFinite(time) && time > 0 && time < 1e12) time *= 1000;
    return { open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), time };
  }).filter((c) => [c.open,c.high,c.low,c.close,c.time].every(Number.isFinite))
    .sort((a,b) => a.time-b.time);
  const unique = rows.filter((c,i) => i === 0 || c.time > rows[i-1].time);
  if (unique.length < 60) throw new Error("Fewer than 60 valid completed candles.");
  for (const c of unique) {
    if (!finite(c.open) || !finite(c.high) || !finite(c.low) || !finite(c.close) ||
      c.high < c.low || c.high < Math.max(c.open,c.close) || c.low > Math.min(c.open,c.close)) {
      throw new Error("Invalid OHLC candle.");
    }
  }
  const last = unique[unique.length - 1];
  const age = now - (last.time + PERIOD_MS[timeframe]);
  if (age < -120_000 || age > PERIOD_MS[timeframe] * 1.5) {
    throw new Error("Latest completed candle is stale or timestamp is invalid.");
  }
  return unique;
}
export function analyseTimeframe(candles: Candle[], timeframe: Timeframe, now = Date.now()): Indicators {
  if (candles.length < 60) throw new Error("Insufficient candles.");
  const closes = candles.map(c => c.close);
  const close = closes[closes.length - 1];
  const ema20 = ema(closes.slice(-100),20);
  const ema50 = ema(closes.slice(-120),50);
  const priorEma20 = ema(closes.slice(-101,-1),20);
  const rsi14 = rsi(closes,14);
  const m = macd(closes);
  const atr14 = atr(candles,14);
  if (![close,ema20,ema50,priorEma20,rsi14,m.line,m.signal,m.histogram,atr14].every(Number.isFinite) || atr14 <= 0) {
    throw new Error("Indicator calculation failed.");
  }
  const bullish = close > ema20 && ema20 > ema50 && ema20 > priorEma20 &&
    rsi14 >= 52 && rsi14 <= 68 && m.histogram > 0;
  const bearish = close < ema20 && ema20 < ema50 && ema20 < priorEma20 &&
    rsi14 >= 32 && rsi14 <= 48 && m.histogram < 0;
  const signal: Side = bullish ? "BUY" : bearish ? "SELL" : "WAIT";
  const age = Math.max(0, now - (candles[candles.length-1].time + PERIOD_MS[timeframe])) / 1000;
  return { signal, close, ema20, ema20Previous:priorEma20, ema50, rsi14, macd:m.line, macdSignal:m.signal,
    macdHistogram:m.histogram, atr14, bars:candles.length, candleAgeSeconds:age,
    reason: signal === "BUY" ? "EMA trend, RSI and MACD agree bullishly" :
      signal === "SELL" ? "EMA trend, RSI and MACD agree bearishly" : "Indicators are mixed or momentum is not confirmed" };
}
export function buildCandidate(
  frames: Record<Timeframe, Indicators>,
  quote: { bid:number; ask:number; stale:boolean; marketState:string; quoteAgeSeconds:number },
): Candidate | null {
  const price = (quote.bid + quote.ask) / 2;
  if (!finite(quote.bid) || !finite(quote.ask) || quote.ask < quote.bid ||
      quote.stale !== false || quote.marketState.toLowerCase() !== "open" ||
      !Number.isFinite(quote.quoteAgeSeconds) || quote.quoteAgeSeconds < 0 || quote.quoteAgeSeconds > 30) return null;

  // Balanced multi-timeframe rules: 1H sets direction; 4H confirms or may be neutral;
  // 15M must show compatible structure; 5M is an entry-timing veto only when strongly opposed.
  const side: "BUY" | "SELL" | "WAIT" = frames["1H"].ema20 > frames["1H"].ema50 ? "BUY" :
    frames["1H"].ema20 < frames["1H"].ema50 ? "SELL" : "WAIT";
  if (side === "WAIT" || Math.abs(scoreTimeframe(frames["1H"])) < 12 ||
      (side === "BUY" && scoreTimeframe(frames["1H"]) < 12) ||
      (side === "SELL" && scoreTimeframe(frames["1H"]) > -12)) return null;

  const s4 = scoreTimeframe(frames["4H"]);
  const s15 = scoreTimeframe(frames["15M"]);
  const s5 = scoreTimeframe(frames["5M"]);
  const opposite = (score:number) => side === "BUY" ? score : -score;
  if (opposite(s4) < -30) return null;
  const m15 = frames["15M"];
  const m15Aligned = side === "BUY" ? m15.ema20 >= m15.ema50 : m15.ema20 <= m15.ema50;
  // A strong 15M pullback can still qualify when price has reclaimed the
  // trend-side EMA50 and 5M momentum has turned back with the 1H trend.
  const pullbackReversal = opposite(s15) < -25 &&
    (side === "SELL"
      ? price < m15.ema50 && frames["5M"].close < frames["5M"].ema20 && frames["5M"].macdHistogram < 0
      : price > m15.ema50 && frames["5M"].close > frames["5M"].ema20 && frames["5M"].macdHistogram > 0);
  if ((!m15Aligned || opposite(s15) < -25) && !pullbackReversal) return null;
  if (opposite(s5) < -40) return null;

  const atr15 = frames["15M"].atr14, atr5 = frames["5M"].atr14;
  if (!finite(atr15) || !finite(atr5)) return null;
  if (Math.abs(price - frames["15M"].close) > atr15 * 0.75) return null;
  const spread = quote.ask - quote.bid;
  const riskDistance = Math.max(atr15 * 1.5, atr5 * 2, spread * 2.5);
  if (!finite(riskDistance) || riskDistance >= price) return null;
  const stopLoss = side === "BUY" ? price-riskDistance : price+riskDistance;
  const takeProfit1 = side === "BUY" ? price+2*riskDistance : price-2*riskDistance;
  const takeProfit2 = side === "BUY" ? price+3*riskDistance : price-3*riskDistance;
  const risk = side === "BUY" ? price-stopLoss : stopLoss-price;
  const reward1 = side === "BUY" ? takeProfit1-price : price-takeProfit1;
  const reward2 = side === "BUY" ? takeProfit2-price : price-takeProfit2;
  if (!(risk > 0 && reward1 >= 2*risk && reward2 >= 3*risk)) return null;
  const aligned = [frames["4H"],frames["1H"],frames["15M"]].filter(f =>
    side === "BUY" ? f.ema20 >= f.ema50 : f.ema20 <= f.ema50).length;
  const lowerBonus = opposite(s5) >= 0 ? 5 : 0;
  return { signal:side, entry:price, stopLoss, takeProfit1, takeProfit2, riskDistance,
    qualityScore:Math.min(90,65+aligned*5+lowerBonus),
    explanation:"Balanced setup passed: 1H directional EMA structure and momentum score, 4H not strongly opposed, 15M structure aligned with tolerable pullback, 5M not strongly opposed, fresh quote, ATR-based risk and 1:2/1:3 targets. Quality score is not a win probability." };
}

function diagnoseCandidate(frames: Record<Timeframe, Indicators>, quote: {bid:number;ask:number;stale:boolean;marketState:string;quoteAgeSeconds:number}): string {
  const price=(quote.bid+quote.ask)/2;
  if(!finite(quote.bid)||!finite(quote.ask)||quote.ask<quote.bid||quote.stale!==false||quote.marketState.toLowerCase()!=="open"||!Number.isFinite(quote.quoteAgeSeconds)||quote.quoteAgeSeconds<0||quote.quoteAgeSeconds>30) return "QUOTE_BLOCK: quote is stale, invalid, closed or older than 30 seconds.";
  const h1=frames["1H"], h4=frames["4H"], m15=frames["15M"], m5=frames["5M"];
  const h1Score=scoreTimeframe(h1), h4Score=scoreTimeframe(h4), m15Score=scoreTimeframe(m15), m5Score=scoreTimeframe(m5);
  const side:"BUY"|"SELL"| "WAIT" = h1.ema20>h1.ema50?"BUY":h1.ema20<h1.ema50?"SELL":"WAIT";
  if(side==="WAIT") return "NO_1H_DIRECTION: 1H EMA20 and EMA50 are flat/equal; no directional bias.";
  if((side==="BUY"&&h1Score<12)||(side==="SELL"&&h1Score>-12)) return "WEAK_1H_BIAS: 1H EMA structure and directional momentum do not agree strongly enough for "+side+" (score "+h1Score+").";
  const opposite=(score:number)=>side==="BUY"?score:-score;
  if(opposite(h4Score)<-30) return "4H_CONFLICT: 4H strongly opposes the 1H "+side+" bias (score "+h4Score+").";
  const aligned=side==="BUY"?m15.ema20>=m15.ema50:m15.ema20<=m15.ema50;
  const pullbackReversal=opposite(m15Score)<-25&&(side==="SELL"
    ?price<m15.ema50&&m5.close<m5.ema20&&m5.macdHistogram<0
    :price>m15.ema50&&m5.close>m5.ema20&&m5.macdHistogram>0);
  if((!aligned||opposite(m15Score)<-25)&&!pullbackReversal) return "15M_SETUP_PENDING: 1H "+side+" bias exists, but 15M structure/pullback has not met the entry rule (15M score "+m15Score+").";
  if(opposite(m5Score)<-40) return "5M_ENTRY_CONFLICT: 5M strongly opposes the "+side+" bias (score "+m5Score+").";
  if(!finite(m15.atr14)||!finite(m5.atr14)) return "ATR_INVALID: required volatility data is missing.";
  if(Math.abs(price-m15.close)>m15.atr14*.75) return "ENTRY_TOO_EXTENDED: current quote is more than 0.75 of 15M ATR from the reference close.";
  const risk=Math.max(m15.atr14*1.5,m5.atr14*2,(quote.ask-quote.bid)*2.5);
  if(!finite(risk)||risk>=price) return "RISK_INVALID: ATR/spread-based stop distance is invalid.";
  return "OTHER_VALIDATION: candidate passed directional checks but failed final validation; inspect risk and price inputs.";
}


function clamp(n:number,min:number,max:number){return Math.max(min,Math.min(max,n));}
function scoreTimeframe(f:Indicators){
 const atrValue=Math.max(f.atr14,Number.EPSILON);
 const priceVsEma=clamp((f.close-f.ema20)/atrValue*24,-24,24);
 const emaAlignment=clamp((f.ema20-f.ema50)/atrValue*28,-28,28);
 const emaSlope=clamp((f.ema20-f.ema20Previous)/atrValue*160,-16,16);
 const rsiMomentum=clamp((f.rsi14-50)*0.65,-13,13);
 const macdMomentum=clamp(f.macdHistogram/atrValue*100,-12,12);
 return Math.round(clamp(priceVsEma+emaAlignment+emaSlope+rsiMomentum+macdMomentum,-100,100));
}
function buildSetupWatch(frames:Record<Timeframe,Indicators>,quote:{bid:number;ask:number;stale:boolean;marketState:string;quoteAgeSeconds:number}){
 const h1=frames["1H"],h4=frames["4H"],m15=frames["15M"],m5=frames["5M"];
 const h1Score=scoreTimeframe(h1),h4Score=scoreTimeframe(h4),m15Score=scoreTimeframe(m15),m5Score=scoreTimeframe(m5);
 const side:"BUY"|"SELL"|null=h1.ema20>h1.ema50&&h1Score>=12?"BUY":h1.ema20<h1.ema50&&h1Score<=-12?"SELL":null;
 if(!side)return {status:"NO_SETUP",direction:null,reason:"No sufficiently strong 1H directional setup yet.",summary:"No developing setup: 1H direction/momentum is not strong enough."};
 const opposite=(score:number)=>side==="BUY"?score:-score;
 if(opposite(h4Score)<-30)return {status:"NO_SETUP",direction:side,reason:"4H strongly conflicts with the 1H direction.",summary:"No developing "+side+" setup: 4H strongly conflicts with 1H."};
 const price=(quote.bid+quote.ask)/2;
 const m15Aligned=side==="BUY"?m15.ema20>=m15.ema50:m15.ema20<=m15.ema50;
 const pullback=opposite(m15Score)<-25;
 const pullbackReversal=pullback&&(side==="SELL"?price<m15.ema50&&m5.close<m5.ema20&&m5.macdHistogram<0:price>m15.ema50&&m5.close>m5.ema20&&m5.macdHistogram>0);
 let reason="";
 if((!m15Aligned||pullback)&&!pullbackReversal)reason=pullback?"15M is still pulling back against the 1H direction; wait for the pullback to stall and 5M momentum to turn back.":"Wait for 15M EMA structure to align with the 1H direction.";
 else if(opposite(m5Score)<-40)reason="15M structure is ready, but 5M momentum still opposes the setup.";
 else if(!finite(m15.atr14)||!finite(m5.atr14))reason="Volatility data is incomplete; no entry can be calculated safely.";
 else if(Math.abs(price-m15.close)>m15.atr14*.75)reason="Setup direction is present, but price is extended; wait for a pullback into the entry zone.";
 else if(quote.stale!==false||quote.marketState.toLowerCase()!=="open"||!Number.isFinite(quote.quoteAgeSeconds)||quote.quoteAgeSeconds>30)reason="Wait for a fresh quote and confirmed open market.";
 else reason="Directional setup is forming; final risk and entry checks are still pending.";
 return {status:"WATCH_"+side,direction:side,reason,summary:"DEVELOPING "+side+" SETUP — "+reason};
}
function buildMarketIntelligence(frames:Record<Timeframe,Indicators>){
 const scores={ "4H":scoreTimeframe(frames["4H"]), "1H":scoreTimeframe(frames["1H"]), "15M":scoreTimeframe(frames["15M"]), "5M":scoreTimeframe(frames["5M"]) };
 const score=Math.round(scores["4H"]*.30+scores["1H"]*.35+scores["15M"]*.25+scores["5M"]*.10);
 const gap=Math.abs(frames["1H"].ema20-frames["1H"].ema50)/Math.max(frames["1H"].atr14,Number.EPSILON);
 let regime:"BULL_TREND"|"BEAR_TREND"|"RANGE"|"TRANSITION"="TRANSITION";
 if(gap<.15&&Math.abs(score)<20)regime="RANGE";
 else if(score>=24&&frames["1H"].ema20>frames["1H"].ema50)regime="BULL_TREND";
 else if(score<=-24&&frames["1H"].ema20<frames["1H"].ema50)regime="BEAR_TREND";
 const bias=score>=15?"BULLISH":score<=-15?"BEARISH":"MIXED";
 const summary=`Market bias ${bias.toLowerCase()} (${score}/100); regime ${regime.toLowerCase().replace("_"," ")}. 4H ${scores["4H"]}, 1H ${scores["1H"]}, 15M ${scores["15M"]}, 5M ${scores["5M"]}. This is market context, not an entry signal.`;
 return {bias,regime,score,summary,timeframes:Object.fromEntries(Object.entries(frames).map(([k,v])=>[k,{signal:v.signal,score:scores[k as Timeframe],close:v.close,ema20:v.ema20,ema50:v.ema50,rsi14:v.rsi14,macdHistogram:v.macdHistogram,atr14:v.atr14,candleAgeSeconds:v.candleAgeSeconds,reason:v.reason}]))};
}

export function validateCandidate(c: Candidate): boolean {
  const nums=[c.entry,c.stopLoss,c.takeProfit1,c.takeProfit2,c.riskDistance];
  if (!nums.every(Number.isFinite) || nums.some(n=>n<=0)) return false;
  const risk=c.signal==="BUY"?c.entry-c.stopLoss:c.stopLoss-c.entry;
  const r1=c.signal==="BUY"?c.takeProfit1-c.entry:c.entry-c.takeProfit1;
  const r2=c.signal==="BUY"?c.takeProfit2-c.entry:c.entry-c.takeProfit2;
  return risk>0 && r1>=2*risk && r2>=3*risk &&
    (c.signal==="BUY" ? c.stopLoss<c.entry&&c.takeProfit1>c.entry&&c.takeProfit2>c.entry :
      c.stopLoss>c.entry&&c.takeProfit1<c.entry&&c.takeProfit2<c.entry);
}

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
 if(!Array.isArray(p)){
  if(p.symbol && String(p.symbol).toUpperCase()!==symbol.toUpperCase()) throw new Error(`DATA_SYMBOL_MISMATCH:${frame.key} returned ${p.symbol}, expected ${symbol}`);
  if(p.interval && String(p.interval).toLowerCase()!==frame.interval.toLowerCase()) throw new Error(`DATA_TIMEFRAME_MISMATCH:${frame.key} request ${frame.interval}, provider returned ${p.interval}`);
 }
 const raw=Array.isArray(p)?p:(p.bars||p.data||p.candles||[]);
 if(!Array.isArray(raw)||raw.length===0) throw new Error(`DATA_EMPTY:${symbol} ${frame.key} returned no candle array`);
 const candles=normalizeCandles(raw,frame.key);
 const steps=candles.slice(1).map((c,i)=>c.time-candles[i].time).filter(n=>Number.isFinite(n)&&n>0).sort((a,b)=>a-b);
 const medianStep=steps.length?steps[Math.floor(steps.length/2)]:0;
 const expected=PERIOD_MS[frame.key];
 if(!medianStep||medianStep<expected*.8||medianStep>expected*1.2) throw new Error(`DATA_CADENCE_MISMATCH:${symbol} ${frame.key} expected about ${expected/1000}s bars, median spacing ${medianStep/1000}s`);
 console.log("MKTRADEHOME_CANDLE_AUDIT",JSON.stringify({symbol,requested:frame.interval,returned:Array.isArray(p)?"array":p.interval||"unspecified",bars:candles.length,medianStepSeconds:medianStep/1000,lastOpenTime:new Date(candles[candles.length-1].time).toISOString(),lastClose:candles[candles.length-1].close}));
 return candles;
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
    const intelligence=buildMarketIntelligence(tf);
    const setupWatch=buildSetupWatch(tf,quote);
    intelligence.summary += " "+setupWatch.summary;
    const {error:intelligenceError}=await db.from("market_analysis_snapshots").upsert({
     user_id:DASHBOARD_USER_ID,symbol,bias:intelligence.bias,regime:intelligence.regime,
     score:intelligence.score,summary:intelligence.summary,timeframes:intelligence.timeframes,
     quote_age_seconds:age,source:"mktradehome-independent-market-intelligence",updated_at:new Date().toISOString()
    },{onConflict:"user_id,symbol"});
    if(intelligenceError)console.error("MKTRADEHOME_INTELLIGENCE_SAVE_ERROR",symbol,intelligenceError.message);
    const candidate=buildCandidate(tf,quote);
    if(!candidate||!validateCandidate(candidate)){
     results.push({symbol,signal:"WAIT",reason:diagnoseCandidate(tf,quote),setupWatch,timeframes:tf,intelligence,
      intelligenceSaved:!intelligenceError});continue;
    }
    const {data:prev,error:prevError}=await db.from("market_signal_state").select("last_signal,updated_at").eq("symbol",symbol).maybeSingle();
    if(prevError)throw prevError;
    const ageMs=prev?.updated_at?Date.now()-Date.parse(prev.updated_at):Infinity;
    if(prev?.last_signal===candidate.signal&&ageMs>=0&&ageMs<600000){
     results.push({symbol,signal:candidate.signal,setupWatch,duplicateSuppressed:true});continue;
    }
    const {data:queueRows,error:activeError}=await db.from("mt5_trade_queue").select("id,status,expires_at").eq("account_number",DEMO_ACCOUNT).eq("account_server",DEMO_SERVER).eq("symbol",symbol).in("status",["approved","executing"]);
    if(activeError)throw activeError;
    const active=(queueRows||[]).some((row:any)=>row.status==="executing"||(row.status==="approved"&&row.expires_at&&Date.parse(row.expires_at)>Date.now()));
    if(active){results.push({symbol,signal:candidate.signal,setupWatch,duplicateSuppressed:true,reason:"An approval or execution is already active."});continue;}
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
     user_id:DASHBOARD_USER_ID,symbol,alert_type:candidate.signal,message
    });
    if(alertError)errors.push("In-app alert: "+alertError.message);
    // Deliver verified signal notifications immediately; this is an alert only.
    // It does not create an approval, queue item, or execute a trade.
    let telegramDelivered=false;
    try {
     const botToken=Deno.env.get("TELEGRAM_BOT_TOKEN");
     if(!botToken) throw new Error("TELEGRAM_BOT_TOKEN is not configured.");
     const {data:telegramUser,error:telegramUserError}=await db.from("telegram_users").select("chat_id").eq("user_id",DASHBOARD_USER_ID).maybeSingle();
     if(telegramUserError) throw telegramUserError;
     if(!telegramUser?.chat_id) throw new Error("Telegram is not connected for this dashboard user.");
     const telegramResponse=await fetch("https://api.telegram.org/bot"+botToken+"/sendMessage",{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:telegramUser.chat_id,text:message}),
      signal:AbortSignal.timeout(10000)
     });
     const telegramResult=await telegramResponse.json();
     if(!telegramResponse.ok||!telegramResult.ok) throw new Error(telegramResult.description||"Telegram delivery failed.");
     telegramDelivered=true;
    }catch(notificationError){
     errors.push("Telegram notification: "+(notificationError instanceof Error?notificationError.message:"delivery failed"));
    }
    const {error:stateError}=await db.from("market_signal_state").upsert({symbol,last_signal:candidate.signal,updated_at:created});
    if(stateError)errors.push("State: "+stateError.message);
    results.push({symbol,signal:candidate.signal,status:"Independent candidate saved for manual Demo review. Alert delivery attempted immediately; no approval or trade was created.",candidateId:row.id,inAppAlert:!alertError,telegramDelivered,expiresInMinutes:10,qualityScore:candidate.qualityScore,intelligence,intelligenceSaved:!intelligenceError,errors});
   }catch(e){results.push({symbol,signal:"WAIT",reason:e instanceof Error?e.message:"Analysis failed safely."});}
  }
  console.log("MKTRADEHOME_SCAN", JSON.stringify(results.map((r:any) => {
    const detail:any = {symbol:r.symbol, signal:r.signal, reason:r.reason||r.status||"", quoteAgeSeconds:r.quoteAgeSeconds};
    if (r.candidateId !== undefined) {
      detail.candidateId = r.candidateId;
      detail.qualityScore = r.qualityScore;
      detail.inAppAlertSaved = r.inAppAlert;
      detail.telegramDelivered = r.telegramDelivered;
      detail.notificationErrors = (r.errors||[]).filter((message:string) => /notification|alert/i.test(message));
    }
    if (r.timeframes) detail.timeframes = Object.fromEntries(Object.entries(r.timeframes).map(([k,v]:any) => [k, {
      signal:v.signal, close:v.close, ema20:v.ema20, ema50:v.ema50, rsi14:v.rsi14,
      macdHistogram:v.macdHistogram, atr14:v.atr14, bars:v.bars,
      candleAgeSeconds:v.candleAgeSeconds, reason:v.reason
    }]));
    return detail;
  })));
  return reply({success:true,engine:"mktradehome-technical-engine",gptUsed:false,results});
 }catch(e){return reply({error:e instanceof Error?e.message:"Monitor error"},500);}
});
