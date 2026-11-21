export type DiagnosticTimeframe = {
  close:number; ema20:number; ema50:number; atr14:number; macdHistogram:number;
};
export type BaselineDiagnosticFrames = {
  "4H":DiagnosticTimeframe; "1H":DiagnosticTimeframe;
  "15M":DiagnosticTimeframe; "5M":DiagnosticTimeframe;
};
export type BaselineDiagnosticInput = {
  frames:BaselineDiagnosticFrames;
  scores:{"4H":number;"1H":number;"15M":number;"5M":number};
  price:number;
  spread:number;
};
export function baselineRejectionReason(input:BaselineDiagnosticInput):string {
  const {frames:f,scores:s,price,spread}=input;
  const h1=f["1H"],h4=f["4H"],m15=f["15M"],m5=f["5M"];
  const side:"BUY"|"SELL"|null=h1.ema20>h1.ema50?"BUY":h1.ema20<h1.ema50?"SELL":null;
  if(!side)return "NO_1H_DIRECTION";
  if((side==="BUY"&&s["1H"]<12)||(side==="SELL"&&s["1H"]>-12))return "WEAK_1H_BIAS";
  const opposite=(score:number)=>side==="BUY"?score:-score;
  if(opposite(s["4H"]) < -30)return "4H_CONFLICT";
  const aligned=side==="BUY"?m15.ema20>=m15.ema50:m15.ema20<=m15.ema50;
  const pullbackReversal=opposite(s["15M"]) < -25 && (side==="SELL"
    ?price<m15.ema50&&m5.close<m5.ema20&&m5.macdHistogram<0
    :price>m15.ema50&&m5.close>m5.ema20&&m5.macdHistogram>0);
  if((!aligned||opposite(s["15M"]) < -25)&&!pullbackReversal)return "15M_SETUP_PENDING";
  if(opposite(s["5M"]) < -40)return "5M_ENTRY_CONFLICT";
  if(!Number.isFinite(m15.atr14)||m15.atr14<=0||!Number.isFinite(m5.atr14)||m5.atr14<=0)return "ATR_INVALID";
  if(Math.abs(price-m15.close)>m15.atr14*.75)return "ENTRY_TOO_EXTENDED";
  const risk=Math.max(m15.atr14*1.5,m5.atr14*2,spread*2.5);
  if(!Number.isFinite(risk)||risk<=0||risk>=price)return "RISK_INVALID";
  return "BUILDER_OR_FINAL_VALIDATION";
}
