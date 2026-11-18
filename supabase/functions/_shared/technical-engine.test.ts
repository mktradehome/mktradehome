import { analyseTimeframe, buildCandidate, normalizeCandles, validateCandidate, type Candle, type Indicators } from "./technical-engine.ts";

function assert(value: unknown, message = "Assertion failed") { if (!value) throw new Error(message); }
function assertEquals(actual: unknown, expected: unknown) {
  if (actual !== expected) throw new Error("Expected " + String(expected) + ", got " + String(actual));
}
function trendCandles(direction: 1|-1, timeframeMs: number, now: number): Candle[] {
  const out:Candle[]=[]; let p=direction===1?100:200;
  for(let i=0;i<240;i++){
    const move=direction*(0.02 + i*0.0001 + (i%2===0 ? 0.12 : -0.12));
    const open=p, close=p+move;
    out.push({open,close,high:Math.max(open,close)+0.04,low:Math.min(open,close)-0.04,time:now-(240-i)*timeframeMs});
    p=close;
  }
  return out;
}
Deno.test("rejects malformed or stale candles",()=>{
  const now=Date.now();
  const good=trendCandles(1,5*60_000,now);
  assertEquals(normalizeCandles(good,"5M",now).length,240);
  let threw=false;
  try{normalizeCandles(good.slice(0,20),"5M",now);}catch{threw=true;}
  assert(threw);
});
Deno.test("trend indicator produces a directional result on a persistent trend",()=>{
  const now=Date.now();
  const up=trendCandles(1,5*60_000,now);
  const down=trendCandles(-1,5*60_000,now);
  assertEquals(analyseTimeframe(up,"5M",now).signal,"BUY");
  assertEquals(analyseTimeframe(down,"5M",now).signal,"SELL");
});
Deno.test("candidate must pass multi-timeframe alignment and price/risk checks",()=>{
  const mk=(signal:"BUY"|"SELL"|"WAIT"):Indicators=>({
    signal,close:100,ema20:101,ema20Previous:100.9,ema50:99,rsi14:58,macd:1,macdSignal:0.5,macdHistogram:0.5,atr14:1,bars:200,candleAgeSeconds:5,reason:"fixture"
  });
  const frames={ "4H":mk("BUY"),"1H":mk("BUY"),"15M":mk("BUY"),"5M":mk("WAIT") };
  const c=buildCandidate(frames,{bid:99.99,ask:100.01,stale:false,marketState:"open",quoteAgeSeconds:2});
  assert(c && validateCandidate(c));
  assertEquals(buildCandidate({...frames,"1H":mk("SELL")},{bid:99.99,ask:100.01,stale:false,marketState:"open",quoteAgeSeconds:2}),null);
  assertEquals(buildCandidate(frames,{bid:99.99,ask:100.01,stale:true,marketState:"open",quoteAgeSeconds:2}),null);
});
