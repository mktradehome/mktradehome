import { validateIndependentCandidateProof, type IndependentProof, type SavedCandidate } from "./approval-proof.ts";
function assert(value:unknown,message="Assertion failed"){if(!value)throw new Error(message);}
function frame(v:Partial<any>={}){
 return {close:102,ema20:101,ema20Previous:100.8,ema50:100,rsi14:58,macdHistogram:0.5,atr14:1,bars:200,candleAgeSeconds:5,...v};
}
function fixture(pullback=false):{candidate:SavedCandidate;proof:IndependentProof}{
 const h4=frame({close:100.2,ema20:100.1,ema20Previous:100.05,ema50:100,rsi14:51,macdHistogram:0.01});
 const h1=frame();
 const m15=pullback?frame({close:100.2,ema20:100,ema20Previous:100.2,ema50:100.1,rsi14:45,macdHistogram:-0.1}):frame({close:100.2});
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
Deno.test("accepts a valid SELL candidate with bearish score alignment",()=>{
 const h4=frame({close:100,ema20:100.1,ema20Previous:100.15,ema50:100.2,rsi14:49,macdHistogram:-0.01});
 const h1=frame({close:98.2,ema20:99,ema20Previous:99.2,ema50:100,rsi14:42,macdHistogram:-0.5});
 const m15=frame({close:99.8,ema20:100,ema20Previous:100.05,ema50:100.1,rsi14:42,macdHistogram:-0.1});
 const m5=frame({close:99.9,ema20:100,ema20Previous:100.05,ema50:100.1,rsi14:48,macdHistogram:-0.1,atr14:0.5});
 const bid=99.79,ask=99.81,price=(bid+ask)/2,risk=Math.max(m15.atr14*1.5,m5.atr14*2,(ask-bid)*2.5);
 const candidate:SavedCandidate={signal:"SELL",entry_price:price,stop_loss:price+risk,take_profit_1:price-2*risk,take_profit_2:price-3*risk};
 const proof:IndependentProof={qualityScore:85,qualityScoreIsWinProbability:false,timeframes:{"4H":h4,"1H":h1,"15M":m15,"5M":m5},quote:{bid,ask,price,quoteAgeSeconds:2,marketState:"open"}};
 assert(validateIndependentCandidateProof(candidate,proof).valid);
});
Deno.test("rejects a BUY candidate when 5M score strongly opposes it",()=>{
 const f=fixture(false);
 f.proof.timeframes!["5M"]={...f.proof.timeframes!["5M"],close:98,ema20:100,ema20Previous:100.2,ema50:101,rsi14:35,macdHistogram:-0.5};
 assert(!validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
Deno.test("rejects a saved quote midpoint that does not match bid and ask",()=>{
 const f=fixture(false);f.proof.quote!.price=100.5;assert(!validateIndependentCandidateProof(f.candidate,f.proof).valid);
});
Deno.test("rejects stale candle evidence",()=>{
 const f=fixture(false);f.proof.timeframes!["5M"].candleAgeSeconds=999;assert(!validateIndependentCandidateProof(f.candidate,f.proof).valid);
});

Deno.test("accepts a real persisted XAUUSD SELL candidate proof from production",()=>{
 const candidate:SavedCandidate={
  signal:"SELL",
  entry_price:3699.441,
  stop_loss:3718.0469999999996,
  take_profit_1:3662.229,
  take_profit_2:3643.6229999999996
 };
 const proof:IndependentProof={
  qualityScore:85,
  qualityScoreIsWinProbability:false,
  timeframes:{
   "5M":{close:3700.011,ema20:3729.9509849755505,ema20Previous:3733.1024272878003,ema50:3736.8083136929777,rsi14:17.697986190588793,macdHistogram:-5.395204826067454,atr14:7.654857142857087,bars:240,candleAgeSeconds:3.246},
   "15M":{close:3700.011,ema20:3736.342668653656,ema20Previous:3740.167336977283,ema50:3744.654597410937,rsi14:27.747407747659594,macdHistogram:-4.149754104166943,atr14:12.403999999999996,bars:192,candleAgeSeconds:3.249},
   "1H":{close:3709.285,ema20:3755.1851773924354,ema20Previous:3760.016347558598,ema50:3795.8011936049684,rsi14:31.715524238515016,macdHistogram:1.4829655609357886,atr14:23.035142857142937,bars:168,candleAgeSeconds:903.249},
   "4H":{close:3740.246,ema20:3826.290168447272,ema20Previous:3835.3474062427167,ema50:3900.028200585187,rsi14:25.294995715928337,macdHistogram:-8.21452877170183,atr14:33.101142857142705,bars:180,candleAgeSeconds:11703.251}
  },
  quote:{bid:3699.357,ask:3699.525,price:3699.441,quoteAgeSeconds:0,marketState:"open"}
 };
 const result=validateIndependentCandidateProof(candidate,proof);
 assert(result.valid,result.reason);
});
