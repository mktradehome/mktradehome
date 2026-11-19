import { validateIndependentCandidateProof, type IndependentProof, type SavedCandidate } from "./approval-proof.ts";
function assert(value:unknown,message="Assertion failed"){if(!value)throw new Error(message);}
function frame(v:Partial<any>={}){
 return {close:102,ema20:101,ema20Previous:100.8,ema50:100,rsi14:58,macdHistogram:0.5,atr14:1,bars:200,candleAgeSeconds:5,...v};
}
function fixture(pullback=false):{candidate:SavedCandidate;proof:IndependentProof}{
 const h4=frame({close:100.2,ema20:100.1,ema20Previous:100.05,ema50:100,rsi14:51,macdHistogram:0.01});
 const h1=frame();
 const m15=pullback?frame({close:100.2,ema20:100.2,ema20Previous:100.4,ema50:100.3,rsi14:45,macdHistogram:-0.1}):frame({close:100.2});
 const m5=frame({close:100.3,ema20:100.1,ema20Previous:100.05,ema50:99.9,rsi14:55,macdHistogram:0.1,atr14:0.5});
 const bid=100.19,ask=100.21,price=(bid+ask)/2,risk=Math.max(m15.atr14*1.5,m5.atr14*2,(ask-bid)*2.5);
 const aligned=[h4,h1,m15].filter(f=>f.ema20>=f.ema50).length;
 const score5=(()=>{
  const atr=Math.max(m5.atr14,Number.EPSILON);
  const clamp=(n:number,a:number,b:number)=>Math.max(a,Math.min(b,n));
  return Math.round(clamp(clamp((m5.close-m5.ema20)/atr*24,-24,24)+clamp((m5.ema20-m5.ema50)/atr*28,-28,28)+clamp((m5.ema20-m5.ema20Previous)/atr*160,-16,16)+clamp((m5.rsi14-50)*.65,-13,13)+clamp(m5.macdHistogram/atr*100,-12,12),-100,100));
 })();
 const opposite5=score5;
 const quality=Math.min(90,65+aligned*5+(opposite5>=0?5:0));
 return {candidate:{signal:"BUY",entry_price:price,stop_loss:price-risk,take_profit_1:price+2*risk,take_profit_2:price+3*risk},
 proof:{qualityScore:quality,qualityScoreIsWinProbability:false,timeframes:{"4H":h4,"1H":h1,"15M":m15,"5M":m5},quote:{bid,ask,price,quoteAgeSeconds:2,marketState:"open"}}};
}
Deno.test("accepts a valid engine candidate even when 5M categorical signal is WAIT",()=>{
 const f=fixture(false);assert(validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
Deno.test("accepts the engine's qualified 15M pullback reversal",()=>{
 const f=fixture(true);assert(validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
Deno.test("rejects a candidate whose saved target geometry is changed",()=>{
 const f=fixture(false);f.candidate.take_profit_1+=0.2;assert(!validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
Deno.test("rejects stale candle evidence",()=>{
 const f=fixture(false);f.proof.timeframes!["5M"].candleAgeSeconds=999;assert(!validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
