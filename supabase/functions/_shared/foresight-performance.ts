type ForecastMetricRow={id:string;symbol:string;horizon:string;expected_return:number};
type OutcomeMetricRow={forecast_id:string;actual_return:number;interval_covered:boolean};
function metric(rows:{expected:number;actual:number;covered:boolean}[]){
 const errors=rows.map(r=>Math.abs(r.actual-r.expected));
 const directional=rows.filter(r=>r.expected!==0&&r.actual!==0);
 return {
  evaluated:rows.length,
  directionalSample:directional.length,
  directionalAccuracyPct:directional.length?directional.filter(r=>Math.sign(r.expected)===Math.sign(r.actual)).length/directional.length*100:null,
  meanAbsoluteReturnErrorPct:errors.length?errors.reduce((a,b)=>a+b,0)/errors.length*100:null,
  intervalCoveragePct:rows.length?rows.filter(r=>r.covered).length/rows.length*100:null
 };
}
export function summarizeForecastPerformance(forecasts:ForecastMetricRow[],outcomes:OutcomeMetricRow[]){
 const byId=new Map((Array.isArray(forecasts)?forecasts:[]).map(f=>[f.id,f]));
 const groups=new Map<string,{expected:number;actual:number;covered:boolean}[]>();
 const marketGroups=new Map<string,{expected:number;actual:number;covered:boolean}[]>();
 for(const outcome of Array.isArray(outcomes)?outcomes:[]){
  const f=byId.get(outcome.forecast_id),expected=Number(f?.expected_return),actual=Number(outcome.actual_return);
  if(!f||!Number.isFinite(expected)||!Number.isFinite(actual)||typeof outcome.interval_covered!=="boolean")continue;
  const horizon=String(f.horizon||"UNKNOWN").toUpperCase();
  if(!groups.has(horizon))groups.set(horizon,[]);
  groups.get(horizon)!.push({expected,actual,covered:outcome.interval_covered});
  const symbol=String(f.symbol||"").toUpperCase();
  if(!symbol)continue;
  const marketKey=symbol+"|"+horizon;
  if(!marketGroups.has(marketKey))marketGroups.set(marketKey,[]);
  marketGroups.get(marketKey)!.push({expected,actual,covered:outcome.interval_covered});
 }
 const all=[...groups.values()].flat();
 return {
  overall:metric(all),
  byHorizon:["15M","1H","4H"].map(horizon=>({horizon,...metric(groups.get(horizon)||[])})),
  byMarketHorizon:[...marketGroups.entries()].map(([key,values])=>{const [symbol,horizon]=key.split("|");return {symbol,horizon,...metric(values)};}).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.horizon.localeCompare(b.horizon)),
  sampleLimit:2000,
  probabilitiesCalibrated:false
 };
}
