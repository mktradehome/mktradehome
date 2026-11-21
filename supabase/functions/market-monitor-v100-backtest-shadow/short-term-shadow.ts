export type ShortTermSide = "BUY" | "SELL";
export interface ShortTermIndicators {
  close:number; ema20:number; ema20Previous:number; ema50:number;
  rsi14:number; macdHistogram:number; atr14:number;
}
export interface ShortTermCandidate {
  signal:ShortTermSide; entry:number; stopLoss:number;
  takeProfit1:number; takeProfit2:number; riskDistance:number;
  qualityScore:number; explanation:string;
}
const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const valid=(n:number)=>Number.isFinite(n)&&n>0;
export function shortTermScore(f:ShortTermIndicators):number {
  const a=Math.max(f.atr14,Number.EPSILON);
  const p=clamp((f.close-f.ema20)/a*24,-24,24);
  const e=clamp((f.ema20-f.ema50)/a*28,-28,28);
  const s=clamp((f.ema20-f.ema20Previous)/a*160,-16,16);
  const r=clamp((f.rsi14-50)*.65,-13,13);
  const m=clamp(f.macdHistogram/a*100,-12,12);
  return Math.round(clamp(p+e+s+r+m,-100,100));
}
export function buildShortTermCandidate(
  frames:{ "4H":ShortTermIndicators;"1H":ShortTermIndicators;"15M":ShortTermIndicators;"5M":ShortTermIndicators },
  entry:number
):ShortTermCandidate|null {
  const values=Object.values(frames).flatMap(f=>[f.close,f.ema20,f.ema20Previous,f.ema50,f.rsi14,f.macdHistogram,f.atr14]);
  if(!values.every(Number.isFinite)||!valid(entry)||!values.every((v,i)=>i%7!==6||v>0))return null;
  const m15=frames["15M"],m5=frames["5M"],h1=frames["1H"],h4=frames["4H"];
  const s15=shortTermScore(m15),s5=shortTermScore(m5),s1=shortTermScore(h1),s4=shortTermScore(h4);
  const side:ShortTermSide=m15.ema20>m15.ema50&&s15>=18?"BUY":
    m15.ema20<m15.ema50&&s15<=-18?"SELL":null as never;
  if(!side)return null;
  const signed=(score:number)=>side==="BUY"?score:-score;
  // Higher timeframes are context/vetoes, not the directional trigger.
  if(signed(s1)<-25||signed(s4)<-35)return null;
  // The completed 5M candle must independently confirm the 15M direction.
  const fiveMinuteConfirmed=side==="BUY"
    ? m5.close>m5.ema20&&m5.ema20>m5.ema50&&m5.ema20>m5.ema20Previous&&m5.rsi14>=52&&m5.rsi14<=68&&m5.macdHistogram>0
    : m5.close<m5.ema20&&m5.ema20<m5.ema50&&m5.ema20<m5.ema20Previous&&m5.rsi14>=32&&m5.rsi14<=48&&m5.macdHistogram<0;
  if(!fiveMinuteConfirmed||signed(s5)<18)return null;
  // Avoid chasing a completed 5M close far from its fast EMA.
  if(Math.abs(m5.close-m5.ema20)>m5.atr14*.75)return null;
  const risk=Math.max(m5.atr14*1.5,m15.atr14*.75);
  if(!valid(risk)||risk>=entry)return null;
  const stopLoss=side==="BUY"?entry-risk:entry+risk;
  const takeProfit1=side==="BUY"?entry+2*risk:entry-2*risk;
  const takeProfit2=side==="BUY"?entry+3*risk:entry-3*risk;
  const aligned=[frames["4H"],frames["1H"],m15].filter(f=>side==="BUY"?f.ema20>=f.ema50:f.ema20<=f.ema50).length;
  return {signal:side,entry,stopLoss,takeProfit1,takeProfit2,riskDistance:risk,
    qualityScore:Math.min(90,65+aligned*5+(signed(s5)>=30?5:0)),
    explanation:"Shadow-only short-term setup: 15M directional structure, completed 5M momentum confirmation, 1H/4H conflict vetoes, non-extended entry, ATR stop and 1:2/1:3 reference targets. Not connected to live alerts or execution."};
}
