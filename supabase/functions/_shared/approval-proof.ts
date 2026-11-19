export type ProofSide = "BUY" | "SELL";
export interface ProofFrame {
  close:number; ema20:number; ema20Previous:number; ema50:number;
  rsi14:number; macdHistogram:number; atr14:number; bars:number; candleAgeSeconds:number;
  signal?:string;
}
export interface IndependentProof {
  source?:string; engineVersion?:string; engineVerified?:boolean; verificationStatus?:string;
  expiresAt?:string; qualityScore?:number; qualityScoreIsWinProbability?:boolean;
  timeframes?:Record<string,ProofFrame>;
  quote?:{bid?:number;ask?:number;price?:number;quoteAgeSeconds?:number;marketState?:string};
}
export interface SavedCandidate {
  signal:string; entry_price:number; stop_loss:number; take_profit_1:number; take_profit_2:number;
}
export interface ProofValidation { valid:boolean; reason:string; }

const clamp=(n:number,min:number,max:number)=>Math.max(min,Math.min(max,n));
const finite=(n:unknown)=>typeof n==="number"&&Number.isFinite(n);
function scoreFrame(f:ProofFrame):number{
  const atr=Math.max(f.atr14,Number.EPSILON);
  const priceVsEma=clamp((f.close-f.ema20)/atr*24,-24,24);
  const emaAlignment=clamp((f.ema20-f.ema50)/atr*28,-28,28);
  const emaSlope=clamp((f.ema20-f.ema20Previous)/atr*160,-16,16);
  const rsiMomentum=clamp((f.rsi14-50)*0.65,-13,13);
  const macdMomentum=clamp(f.macdHistogram/atr*100,-12,12);
  return Math.round(clamp(priceVsEma+emaAlignment+emaSlope+rsiMomentum+macdMomentum,-100,100));
}
export function validateIndependentCandidateProof(candidate:SavedCandidate,proof:IndependentProof,maxQuoteAgeSeconds=30):ProofValidation{
  const side=String(candidate.signal||"").toUpperCase();
  if(side!=="BUY"&&side!=="SELL")return {valid:false,reason:"Unsupported candidate direction."};
  const frames=proof?.timeframes||{};
  const ageLimit:Record<string,number>={"4H":21600,"1H":5400,"15M":1350,"5M":450};
  for(const key of ["4H","1H","15M","5M"]){
    const f=frames[key];
    if(!f||![f.close,f.ema20,f.ema20Previous,f.ema50,f.rsi14,f.macdHistogram,f.atr14,f.bars,f.candleAgeSeconds].every(finite)||
      f.close<=0||f.ema20<=0||f.ema50<=0||f.atr14<=0||f.bars<60||
      f.candleAgeSeconds<0||f.candleAgeSeconds>ageLimit[key]){
      return {valid:false,reason:"Missing, invalid or stale "+key+" indicator evidence."};
    }
  }
  const q=proof.quote||{},bid=Number(q.bid),ask=Number(q.ask),price=Number(q.price),quoteAge=Number(q.quoteAgeSeconds);
  if(q.marketState!=="open"||!finite(bid)||!finite(ask)||!finite(price)||!finite(quoteAge)||
    bid<=0||ask<bid||price<=0||Math.abs(price-(bid+ask)/2)>Math.max(1,Math.abs(price))*1e-9||
    quoteAge<0||quoteAge>maxQuoteAgeSeconds){
    return {valid:false,reason:"Saved quote evidence is stale or invalid."};
  }
  const h4=frames["4H"],h1=frames["1H"],m15=frames["15M"],m5=frames["5M"];
  const s4=scoreFrame(h4),s1=scoreFrame(h1),s15=scoreFrame(m15),s5=scoreFrame(m5);
  const opposite=(score:number)=>side==="BUY"?score:-score;
  const h1Direction=side==="BUY"?h1.ema20>h1.ema50&&s1>=12:h1.ema20<h1.ema50&&s1<=-12;
  if(!h1Direction)return {valid:false,reason:"1H direction or momentum does not meet the engine rule."};
  if(opposite(s4)<-30)return {valid:false,reason:"4H strongly opposes the 1H direction."};
  const m15Aligned=side==="BUY"?m15.ema20>=m15.ema50:m15.ema20<=m15.ema50;
  const pullbackReversal=opposite(s15)<-25&&(side==="SELL"
    ?price<m15.ema50&&m5.close<m5.ema20&&m5.macdHistogram<0
    :price>m15.ema50&&m5.close>m5.ema20&&m5.macdHistogram>0);
  if((!m15Aligned||opposite(s15)<-25)&&!pullbackReversal)
    return {valid:false,reason:"15M structure or pullback-reversal confirmation failed."};
  if(opposite(s5)<-40)return {valid:false,reason:"5M strongly opposes the 1H direction."};
  if(Math.abs(price-m15.close)>m15.atr14*.75)
    return {valid:false,reason:"Entry is extended beyond the 15M ATR limit."};
  const spread=ask-bid,expectedRisk=Math.max(m15.atr14*1.5,m5.atr14*2,spread*2.5);
  if(!finite(spread)||spread<0||!finite(expectedRisk)||expectedRisk<=0||expectedRisk>=price)
    return {valid:false,reason:"ATR/spread-based risk distance is invalid."};
  const entry=Number(candidate.entry_price),stop=Number(candidate.stop_loss);
  const tp1=Number(candidate.take_profit_1),tp2=Number(candidate.take_profit_2);
  if(![entry,stop,tp1,tp2].every(Number.isFinite))return {valid:false,reason:"Candidate prices are invalid."};
  const tolerance=Math.max(1,Math.abs(price))*1e-9;
  const riskTolerance=Math.max(tolerance,expectedRisk*1e-8);
  const actualRisk=side==="BUY"?entry-stop:stop-entry;
  const reward1=side==="BUY"?tp1-entry:entry-tp1;
  const reward2=side==="BUY"?tp2-entry:entry-tp2;
  if(Math.abs(entry-price)>tolerance||Math.abs(actualRisk-expectedRisk)>riskTolerance||
    Math.abs((side==="BUY"?stop:stop)-(side==="BUY"?price-expectedRisk:price+expectedRisk))>riskTolerance||
    Math.abs(reward1-2*expectedRisk)>riskTolerance||Math.abs(reward2-3*expectedRisk)>riskTolerance||
    !(actualRisk>0&&reward1>=2*actualRisk&&reward2>=3*actualRisk)||
    (side==="BUY"?!(stop<entry&&tp1>entry&&tp2>entry):!(stop>entry&&tp1<entry&&tp2<entry))){
    return {valid:false,reason:"Saved entry, stop-loss or targets do not match the ATR-based 1:2/1:3 candidate."};
  }
  const aligned=[h4,h1,m15].filter(f=>side==="BUY"?f.ema20>=f.ema50:f.ema20<=f.ema50).length;
  const expectedQuality=Math.min(90,65+aligned*5+(opposite(s5)>=0?5:0));
  if(proof.qualityScoreIsWinProbability!==false||proof.qualityScore!==expectedQuality)
    return {valid:false,reason:"Engine quality-score evidence does not match the saved indicators."};
  return {valid:true,reason:"Exact independent-engine strategy, quote and risk checks passed."};
}
