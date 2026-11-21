import { buildShortTermCandidate, shortTermScore, type ShortTermIndicators } from "./short-term-shadow.ts";
function frame(overrides:Partial<ShortTermIndicators>={}):ShortTermIndicators{return {close:101,ema20:100,ema20Previous:99.8,ema50:99,rsi14:60,macdHistogram:.2,atr14:1,...overrides};}
function frames(){return {"4H":frame(),"1H":frame(),"15M":frame(),"5M":frame()};}
Deno.test("short-term builder accepts aligned BUY with completed 5M confirmation",()=>{
 const c=buildShortTermCandidate(frames(),101);
 if(!c||c.signal!=="BUY"||c.takeProfit1-c.entry<2*c.riskDistance)throw new Error("Expected valid BUY with >=2R TP1");
});
Deno.test("short-term builder accepts aligned SELL",()=>{
 const f=Object.fromEntries(Object.entries(frames()).map(([k])=>[k,frame({close:99,ema20:100,ema20Previous:100.2,ema50:101,rsi14:40,macdHistogram:-.2})])) as ReturnType<typeof frames>;
 const c=buildShortTermCandidate(f,99);
 if(!c||c.signal!=="SELL"||c.stopLoss<=c.entry)throw new Error("Expected valid SELL");
});
Deno.test("short-term builder permits neutral higher timeframe context but labels candidate for normal class downstream",()=>{
 const f=frames();f["1H"]=frame({close:100,ema20:100,ema20Previous:100,ema50:100.2,rsi14:50,macdHistogram:0});f["4H"]=f["1H"];
 const c=buildShortTermCandidate(f,101);
 if(!c)throw new Error("Expected valid 15M/5M setup with non-opposing higher timeframes");
});
Deno.test("short-term builder vetoes strongly opposing 1H",()=>{
 const f=frames();f["1H"]=frame({close:97,ema20:98,ema20Previous:98.5,ema50:100,rsi14:35,macdHistogram:-.5});
 if(buildShortTermCandidate(f,101)!==null)throw new Error("Expected 1H conflict veto");
});
Deno.test("short-term builder rejects missing/non-finite evidence",()=>{
 const f=frames();f["5M"]=frame({macdHistogram:Number.NaN});
 if(buildShortTermCandidate(f,101)!==null)throw new Error("Expected invalid evidence veto");
});
Deno.test("short-term builder rejects weak 5M confirmation",()=>{
 const f=frames();f["5M"]=frame({rsi14:50,macdHistogram:0});
 if(buildShortTermCandidate(f,101)!==null)throw new Error("Expected 5M confirmation veto");
});
Deno.test("short-term score is directional for bullish evidence",()=>{
 if(shortTermScore(frame())<=0)throw new Error("Expected positive score");
});
