type ForecastMetricRow={id:string;symbol:string;horizon:string;horizon_minutes:number;generated_at:string;expected_return:number};
type OutcomeMetricRow={forecast_id:string;actual_return:number;interval_covered:boolean};
type Observation={symbol:string;horizon:string;generatedAt:number;horizonMinutes:number;expected:number;actual:number;covered:boolean};
function metric(rows:Observation[]){
 const modelErrors=rows.map(r=>Math.abs(r.actual-r.expected));
 const baselineErrors=rows.map(r=>Math.abs(r.actual));
 const directional=rows.filter(r=>r.expected!==0&&r.actual!==0);
 const modelMae=modelErrors.length?modelErrors.reduce((a,b)=>a+b,0)/modelErrors.length:null;
 const baselineMae=baselineErrors.length?baselineErrors.reduce((a,b)=>a+b,0)/baselineErrors.length:null;
 return {
  evaluated:rows.length,
  directionalSample:directional.length,
  directionalAccuracyPct:directional.length?directional.filter(r=>Math.sign(r.expected)===Math.sign(r.actual)).length/directional.length*100:null,
  meanAbsoluteReturnErrorPct:modelMae===null?null:modelMae*100,
  zeroReturnBaselineErrorPct:baselineMae===null?null:baselineMae*100,
  improvementVsZeroBaselinePct:modelMae===null||baselineMae===null||baselineMae===0?null:(1-modelMae/baselineMae)*100,
  intervalCoveragePct:rows.length?rows.filter(r=>r.covered).length/rows.length*100:null
 };
}
function groupMetrics(rows:Observation[]){
 const horizons=new Map<string,Observation[]>(),markets=new Map<string,Observation[]>();
 for(const row of rows){
  if(!horizons.has(row.horizon))horizons.set(row.horizon,[]);
  horizons.get(row.horizon)!.push(row);
  const key=row.symbol+"|"+row.horizon;
  if(!markets.has(key))markets.set(key,[]);
  markets.get(key)!.push(row);
 }
 return {
  byHorizon:["15M","1H","4H"].map(horizon=>({horizon,...metric(horizons.get(horizon)||[])})),
  byMarketHorizon:[...markets.entries()].map(([key,values])=>{const [symbol,horizon]=key.split("|");return {symbol,horizon,...metric(values)};}).sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.horizon.localeCompare(b.horizon))
 };
}
function selectNonOverlapping(rows:Observation[]){
 const sorted=[...rows].sort((a,b)=>a.symbol.localeCompare(b.symbol)||a.horizon.localeCompare(b.horizon)||a.generatedAt-b.generatedAt);
 const lastEnd=new Map<string,number>(),selected:Observation[]=[];
 for(const row of sorted){
  if(!Number.isFinite(row.generatedAt)||!Number.isFinite(row.horizonMinutes)||row.horizonMinutes<=0)continue;
  const key=row.symbol+"|"+row.horizon;
  const previousEnd=lastEnd.get(key);
  if(previousEnd!==undefined&&row.generatedAt<previousEnd)continue;
  selected.push(row);
  lastEnd.set(key,row.generatedAt+row.horizonMinutes*60000);
 }
 return selected;
}
export function summarizeForecastPerformance(forecasts:ForecastMetricRow[],outcomes:OutcomeMetricRow[]){
 const byId=new Map((Array.isArray(forecasts)?forecasts:[]).map(f=>[f.id,f]));
 const rows:Observation[]=[];
 for(const outcome of Array.isArray(outcomes)?outcomes:[]){
  const f=byId.get(outcome.forecast_id),expected=Number(f?.expected_return),actual=Number(outcome.actual_return);
  if(!f||!Number.isFinite(expected)||!Number.isFinite(actual)||typeof outcome.interval_covered!=="boolean")continue;
  const symbol=String(f.symbol||"").toUpperCase(),horizon=String(f.horizon||"UNKNOWN").toUpperCase();
  const generatedAt=Date.parse(f.generated_at),horizonMinutes=Number(f.horizon_minutes);
  if(!symbol)continue;
  rows.push({symbol,horizon,generatedAt,horizonMinutes,expected,actual,covered:outcome.interval_covered});
 }
 const rolling=groupMetrics(rows);
 const nonOverlapping=selectNonOverlapping(rows);
 const nonOverlap=groupMetrics(nonOverlapping);
 return {
  overall:metric(rows),
  ...rolling,
  nonOverlappingOverall:metric(nonOverlapping),
  nonOverlappingByHorizon:nonOverlap.byHorizon,
  nonOverlappingByMarketHorizon:nonOverlap.byMarketHorizon,
  sampleLimit:2000,
  nonOverlappingMethod:"Within each symbol and horizon, retain the earliest forecast and skip later forecasts until that forecast horizon has elapsed.",
  directionalMetricDefinition:"Sign agreement between expected_return and realized horizon-close return; this is not a win probability.",
  probabilitiesCalibrated:false
 };
}
