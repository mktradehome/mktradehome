import { classifyValidatedSignal } from "./signal-classification.ts";

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
  const geometryTolerance = Math.max(1, Math.abs(price)) * 1e-10;
  if (!(risk > 0 && reward1 + geometryTolerance >= 2*risk && reward2 + geometryTolerance >= 3*risk)) return null;
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
  if(Math.abs(h1Score)<12) return "WEAK_1H_BIAS: 1H EMA direction exists but momentum score is below 12 (score "+h1Score+").";
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

export function candidateValidationReason(c: Candidate): string | null {
  const nums=[c.entry,c.stopLoss,c.takeProfit1,c.takeProfit2,c.riskDistance];
  if (!nums.every(Number.isFinite) || nums.some(n=>n<=0)) return "NON_FINITE_OR_NON_POSITIVE_PRICE";
  const isBuy=c.signal==="BUY";
  const risk=isBuy?c.entry-c.stopLoss:c.stopLoss-c.entry;
  const r1=isBuy?c.takeProfit1-c.entry:c.entry-c.takeProfit1;
  const r2=isBuy?c.takeProfit2-c.entry:c.entry-c.takeProfit2;
  const tolerance=Math.max(1,Math.abs(c.entry))*1e-10;
  if (!(risk>0)) return "STOP_LOSS_ON_WRONG_SIDE";
  if (Math.abs(risk-c.riskDistance)>tolerance*10) return "RISK_DISTANCE_MISMATCH";
  if (r1+ tolerance < 2*risk) return "TP1_BELOW_2R";
  if (r2+ tolerance < 3*risk) return "TP2_BELOW_3R";
  if (isBuy ? !(c.stopLoss<c.entry&&c.takeProfit1>c.entry&&c.takeProfit2>c.entry)
            : !(c.stopLoss>c.entry&&c.takeProfit1<c.entry&&c.takeProfit2<c.entry)) return "TARGET_OR_STOP_SIDE_INVALID";
  return null;
}
export function validateCandidate(c: Candidate): boolean {
  return candidateValidationReason(c) === null;
}


const cors={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization,content-type,apikey,x-client-info","Access-Control-Allow-Methods":"POST,OPTIONS"};
const symbols=["BTCUSD","EURUSD","XAUUSD","USDJPY"];
const frames:{key:Timeframe;interval:string;ms:number}[] = [
 {key:"5M",interval:"5m",ms:300000},{key:"15M",interval:"15m",ms:900000},
 {key:"1H",interval:"1h",ms:3600000},{key:"4H",interval:"4h",ms:14400000}
];
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
function parseHistory(raw:any[],period:number):Candle[]{
 const rows=raw.filter((x:any)=>x&&!x.isOpen).map((x:any)=>{
  const v=x.time??x.openTime??x.timestamp??x.open_time;
  let t=typeof v==="string"?(/^\d+(\.\d+)?$/.test(v)?Number(v):Date.parse(v)):Number(v);
  if(Number.isFinite(t)&&t>0&&t<1e12)t*=1000;
  return {open:Number(x.open),high:Number(x.high),low:Number(x.low),close:Number(x.close),time:t};
 }).filter((x:Candle)=>[x.open,x.high,x.low,x.close,x.time].every(Number.isFinite)&&x.open>0&&x.high>=x.low&&x.high>=Math.max(x.open,x.close)&&x.low<=Math.min(x.open,x.close));
 const map=new Map<number,Candle>();for(const c of rows)map.set(c.time,c);
 const out=[...map.values()].sort((a,b)=>a.time-b.time);
 return out.filter((c,i)=>i===0||c.time-out[i-1].time>=period*.8);
}
async function loadHistory(symbol:string,frame:{key:Timeframe;interval:string;ms:number},days:number):Promise<Candle[]>{
 const start=Date.now()-(days+12)*86400000;let end=Date.now()+60000,all:Candle[]=[];
 for(let page=0;page<16&&end>start;page++){
  const url=`https://biquote.io/api/${encodeURIComponent(symbol)}/ohlc?interval=${frame.interval}&limit=1000&from=${encodeURIComponent(new Date(start).toISOString())}&to=${encodeURIComponent(new Date(end).toISOString())}`;
  const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(18000)});
  if(!r.ok)throw new Error(symbol+" "+frame.key+" history HTTP "+r.status);
  const payload=await r.json();const raw=Array.isArray(payload)?payload:(payload.bars||payload.data||payload.candles||[]);
  if(!Array.isArray(raw)||!raw.length)break;
  const batch=parseHistory(raw,frame.ms);if(!batch.length)break;
  all.push(...batch);const oldest=batch[0].time;if(oldest<=start||batch.length<2)break;
  if(oldest<=start||batch.length<1000)break;
  const next=oldest-1;if(next>=end)break;end=next;
 }
 const unique=new Map<number,Candle>();for(const c of all)if(c.time>=start&&c.time+frame.ms<=Date.now())unique.set(c.time,c);
 const result=[...unique.values()].sort((a,b)=>a.time-b.time);
 if(result.length<60)throw new Error(symbol+" "+frame.key+" has fewer than 60 completed historical candles.");
 return result;
}

function getArchiveServiceKey(){
 const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(legacy)return legacy;
 const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
 if(keys){try{return JSON.parse(keys).default||"";}catch{}}
 return "";
}
async function loadArchivedHistory(symbol:string,frame:{key:Timeframe;interval:string;ms:number},days:number):Promise<Candle[]>{
 const base=Deno.env.get("SUPABASE_URL"),key=getArchiveServiceKey();
 if(!base||!key)throw new Error("Server-side archive credentials are unavailable.");
 const start=Date.now()-(days+12)*86400000,all:any[]=[];
 for(let offset=0;offset<100000;offset+=1000){
  const url=new URL(base+"/rest/v1/market_candle_archive");
  url.searchParams.set("symbol","eq."+symbol);
  url.searchParams.set("timeframe","eq."+frame.key);
  url.searchParams.set("select","candle_time,open,high,low,close");
  url.searchParams.set("candle_time","gte."+new Date(start).toISOString());
  url.searchParams.set("order","candle_time.asc");
  url.searchParams.set("limit","1000");
  url.searchParams.set("offset",String(offset));
  const headers:Record<string,string>={apikey:key,Accept:"application/json"};
  if(!key.startsWith("sb_secret_"))headers.Authorization="Bearer "+key;
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(20000)});
  if(!response.ok)throw new Error("Archived "+symbol+" "+frame.key+" history HTTP "+response.status);
  const batch=await response.json();
  if(!Array.isArray(batch))throw new Error("Archived "+symbol+" "+frame.key+" history response is invalid.");
  all.push(...batch.map((row:any)=>({...row,time:row.candle_time})));
  if(batch.length<1000)break;
 }
 return parseHistory(all,frame.ms);
}
async function loadCombinedHistory(symbol:string,frame:{key:Timeframe;interval:string;ms:number},days:number){
 let archived:Candle[]=[],provider:Candle[]=[],archiveError="",providerError="";
 try{archived=await loadArchivedHistory(symbol,frame,days);}catch(e){archiveError=e instanceof Error?e.message:"Archive unavailable";}
 try{provider=await loadHistory(symbol,frame,days);}catch(e){providerError=e instanceof Error?e.message:"Provider unavailable";}
 const combined=parseHistory([...archived,...provider],frame.ms);
 if(combined.length<60)throw new Error(symbol+" "+frame.key+" has insufficient history. Archive: "+(archiveError||archived.length+" bars")+". Provider: "+(providerError||provider.length+" bars")+".");
 return {bars:combined,archiveBars:archived.length,providerBars:provider.length,source:archived.length&&provider.length?"archive+rolling-provider":archived.length?"archive":"rolling-provider"};
}

function completedAt(bars:Candle[],at:number,period:number):Candle[]{
 let lo=0,hi=bars.length;
 while(lo<hi){const mid=(lo+hi)>>1;if(bars[mid].time+period<=at)lo=mid+1;else hi=mid;}
 return bars.slice(0,lo);
}
function metrics(trades:any[]){
 const wins=trades.filter(t=>t.r>0),losses=trades.filter(t=>t.r<0);
 const grossWin=wins.reduce((s,t)=>s+t.r,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.r,0));
 let equity=0,peak=0,dd=0;for(const t of trades){equity+=t.r;peak=Math.max(peak,equity);dd=Math.max(dd,peak-equity);}
 return {trades:trades.length,wins:wins.length,losses:losses.length,winRatePct:trades.length?+(wins.length/trades.length*100).toFixed(1):0,
 netR:+trades.reduce((s,t)=>s+t.r,0).toFixed(2),averageR:trades.length?+(trades.reduce((s,t)=>s+t.r,0)/trades.length).toFixed(3):0,
 profitFactor:grossLoss?+(grossWin/grossLoss).toFixed(2):(grossWin?"No losses yet":0),maxDrawdownR:+dd.toFixed(2),
 tp1HitPct:trades.length?+(trades.filter(t=>t.tp1).length/trades.length*100).toFixed(1):0};
}
function replay(symbol:string,data:Record<Timeframe,Candle[]>,testStart:number){
 const m15=data["15M"],all:any[]=[],openAtEnd:{side:string;signalClass:"GOOD_AND_CLEAR"|"NORMAL";displayLabel:string;entryTime:string;entry:number;exit:string;holdingBars:number;floatingR:number}[]=[];let lo=0,hi=m15.length;while(lo<hi){const mid=(lo+hi)>>1;if(m15[mid].time+PERIOD_MS["15M"]<testStart)lo=mid+1;else hi=mid;}let i=Math.max(59,lo),signals=0,blocked=0,staleDataBlocks=0;
 while(i<m15.length-2){
  const signalAt=m15[i].time+PERIOD_MS["15M"];
  const f={} as Record<Timeframe,Indicators>;let enough=true;
  for(const tf of ["4H","1H","15M","5M"] as Timeframe[]){
   const bars=tf==="15M"?m15.slice(0,i+1):completedAt(data[tf],signalAt,PERIOD_MS[tf]);
   if(bars.length<60){enough=false;break;}
   f[tf]=analyseTimeframe(bars,tf,signalAt);
  }
  if(!enough){i++;continue;}
  const staleFrame=([ "5M","15M","1H","4H" ] as Timeframe[]).some(tf=>f[tf].candleAgeSeconds>PERIOD_MS[tf]*1.5/1000);
  if(staleFrame){staleDataBlocks++;i++;continue;}
  // No look-ahead: signal is evaluated after the completed 15M bar;
  // entry is the OPEN of the next 15M bar.
  const fillBar=m15[i+1],entry=fillBar.open;
  if(!finite(entry)){i++;continue;}
  const quote={bid:entry,ask:entry,stale:false,marketState:"open",quoteAgeSeconds:0};
  const candidate=buildCandidate(f,quote);
  if(!candidate||!validateCandidate(candidate)){i++;continue;}
  const classification=classifyValidatedSignal({
   side:candidate.signal,hardGatesPassed:true,
   frames:{
    "4H":{emaAligned:candidate.signal==="BUY"?f["4H"].ema20>=f["4H"].ema50:f["4H"].ema20<=f["4H"].ema50,directionalScore:scoreTimeframe(f["4H"])},
    "1H":{emaAligned:candidate.signal==="BUY"?f["1H"].ema20>=f["1H"].ema50:f["1H"].ema20<=f["1H"].ema50,directionalScore:scoreTimeframe(f["1H"])},
    "15M":{emaAligned:candidate.signal==="BUY"?f["15M"].ema20>=f["15M"].ema50:f["15M"].ema20<=f["15M"].ema50,directionalScore:scoreTimeframe(f["15M"])},
    "5M":{emaAligned:candidate.signal==="BUY"?f["5M"].ema20>=f["5M"].ema50:f["5M"].ema20<=f["5M"].ema50,directionalScore:scoreTimeframe(f["5M"])}
   }
  });
  signals++;
  const risk=candidate.riskDistance,side=candidate.signal,sl=side==="BUY"?entry-risk:entry+risk;
  const tp1=side==="BUY"?entry+2*risk:entry-2*risk,tp2=side==="BUY"?entry+3*risk:entry-3*risk;
  const filledCandidate:Candidate={signal:side,entry,stopLoss:sl,takeProfit1:tp1,takeProfit2:tp2,riskDistance:risk,qualityScore:candidate.qualityScore,explanation:candidate.explanation};
  if(!validateCandidate(filledCandidate)){blocked++;i++;continue;}
  let first=false,exitR=0,exit="TIME",closed=false;
  const plannedExitIndex=i+1+96,exitIndex=Math.min(plannedExitIndex,m15.length-1);
  for(let j=i+2;j<=exitIndex;j++){
   const b=m15[j],stop=side==="BUY"?b.low<=sl:b.high>=sl,t1=side==="BUY"?b.high>=tp1:b.low<=tp1;
   if(stop){exitR=-1;exit="SL";closed=true;break;}
   if(t1){first=true;exitR=2;exit="TP1";closed=true;break;}
   if(j===plannedExitIndex){const signed=side==="BUY"?(b.close-entry)/risk:(entry-b.close)/risk;exitR=signed;exit="TIME";closed=true;}
  }
  const record={side,signalClass:classification.label,displayLabel:classification.displayLabel,entryTime:new Date(fillBar.time).toISOString(),entry:+entry.toPrecision(10),exit,holdingBars:exitIndex-(i+1)};
  if(closed)all.push({...record,r:+exitR.toFixed(3),tp1:first});
  else {const last=m15[exitIndex],floatingR=side==="BUY"?(last.close-entry)/risk:(entry-last.close)/risk;openAtEnd.push({...record,floatingR:+floatingR.toFixed(3)});}
  i=Math.max(i+1,exitIndex);
 }
 const goodAndClear=all.filter(t=>t.signalClass==="GOOD_AND_CLEAR");
 const normal=all.filter(t=>t.signalClass==="NORMAL");
 const openGoodAndClear=openAtEnd.filter(t=>t.signalClass==="GOOD_AND_CLEAR");
 const openNormal=openAtEnd.filter(t=>t.signalClass==="NORMAL");
 return {symbol,bars:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,v.length])),signalsConsidered:signals,validationBlocks:blocked,staleDataBlocks,openAtEndCount:openAtEnd.length,openMarkToMarketR:+openAtEnd.reduce((sum:number,t:{floatingR:number})=>sum+t.floatingR,0).toFixed(2),...metrics(all),bySignalClass:{goodAndClear:{...metrics(goodAndClear),openAtEnd:openGoodAndClear.length},normal:{...metrics(normal),openAtEnd:openNormal.length}},recentTrades:all.slice(-10),recentOpenSetups:openAtEnd.slice(-10)};
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return reply({error:"POST required"},405);
 try{
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return reply({error:"Sign in required."},401);
  const body=await req.json().catch(()=>({}));const days=Math.min(30,Math.max(7,Number(body.days)||14));
  const results=await Promise.all(symbols.map(async symbol=>{
   try{
    const loaded=await Promise.all(frames.map(async frame=>[frame.key,await loadCombinedHistory(symbol,frame,days)] as const));
    const data=Object.fromEntries(loaded.map(([key,value])=>[key,value.bars])) as Record<Timeframe,Candle[]>;
    const historySources=Object.fromEntries(loaded.map(([key,value])=>[key,{source:value.source,archivedBars:value.archiveBars,rollingProviderBars:value.providerBars}]));
    const testStart=Date.now()-days*86400000;
    const warmupStarts=Object.entries(data).map(([tf,bars])=>bars[59].time+PERIOD_MS[tf as Timeframe]);
    const m15Warmup=data["15M"][Math.min(59,data["15M"].length-1)].time+PERIOD_MS["15M"];
    const effectiveStart=Math.max(testStart,...warmupStarts,m15Warmup);
    const effectiveEnd=Math.min(...Object.entries(data).map(([tf,bars])=>bars[bars.length-1].time+PERIOD_MS[tf as Timeframe]));
    const r=replay(symbol,data,effectiveStart);
    const actualCoverageDays=Math.max(0,(effectiveEnd-effectiveStart)/86400000);
    return {...r,historySources,actualCoverageStart:new Date(effectiveStart).toISOString(),actualCoverageEnd:new Date(effectiveEnd).toISOString(),actualCoverageDays:+actualCoverageDays.toFixed(2),coverageLimited:actualCoverageDays+0.25<days};
   }catch(e){return {symbol,error:e instanceof Error?e.message:"Historical replay failed safely."};}
  }));
  return reply({success:true,engine:"Mktradehome V100 SHADOW BACKTEST",baseline:"Exact V100 shadow buildCandidate/scoreTimeframe/validateCandidate helpers",testMode:"Historical OHLC replay only; isolated shadow; no orders, approvals, alerts, queue items, or database writes.",
   requestedDays:days,tp2Mode:"REFERENCE_ONLY_NOT_EXECUTED",generatedAt:new Date().toISOString(),assumptions:[
    "Only completed candles are used. Historical candles are loaded from the project-owned market_candle_archive and merged with the provider rolling window; the result reports true common overlap after indicator warm-up. The archive grows only while the Market Foresight collector is running.",
    "Signal is evaluated after a completed 15M candle; entry is the next 15M candle OPEN to avoid same-candle look-ahead.",
    "Entry, stop and targets are recalculated around the next-candle fill using the V100 ATR risk formula. Historical bid/ask is unavailable, so spread is zero in replay and the live spread-based stop-distance component is omitted; live and historical stop distances may differ.",
    "The full position exits at TP1 (2R), matching the current MT5 queue which sends one take-profit price; TP2 is reference-only and is not counted as an executed exit.",
    "If SL and TP1 touch in the same candle, SL is assumed first; maximum holding is 24 hours. Setups without enough future candles at the end of the history window are shown separately as unclosed and excluded from win-rate and profit-factor metrics.",
    "Historical commission, swap, slippage and broker execution are unavailable and excluded; results are gross, not net-realistic.",
    "Historical quote/session state is unavailable for every candle, so market-open is still an explicit replay assumption. Stale timeframe evidence is now skipped when its last completed candle is older than 1.5 timeframe periods; weekend/session gaps are not interpreted as tradable bars.",
    "Quality score is not a win probability."
   ],productionWrites:false,createsApprovals:false,createsQueueItems:false,telegramAlerts:false,executesTrades:false,results});
 }catch(e){return reply({error:e instanceof Error?e.message:"Shadow backtest failed safely."},500);}
});
