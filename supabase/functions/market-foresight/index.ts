const headers={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"content-type,x-monitor-secret,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"};
const symbols=["BTCUSD","EURUSD","XAUUSD","USDJPY"];
const frames=[{key:"5M",interval:"5m",ms:300000},{key:"15M",interval:"15m",ms:900000},{key:"1H",interval:"1h",ms:3600000},{key:"4H",interval:"4h",ms:14400000}];
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,"Content-Type":"application/json"}});
const finite=(n:number)=>Number.isFinite(n)&&n>0;
function getServiceKey(){
 const legacy=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
 if(legacy)return legacy;
 const keys=Deno.env.get("SUPABASE_SECRET_KEYS");
 if(keys){try{return JSON.parse(keys).default||"";}catch{}}
 return "";
}
async function provider(url:string){
 const r=await fetch(url,{headers:{Accept:"application/json"},signal:AbortSignal.timeout(15000)});
 if(!r.ok)throw new Error("Market data provider HTTP "+r.status);
 return await r.json();
}
function candlesFrom(raw:any[],frame:any){
 const now=Date.now();
 const rows=raw.filter((c:any)=>c&&c.isOpen!==true).map((c:any)=>{
  const v=c.time??c.openTime??c.timestamp??c.open_time;
  let t=typeof v==="string"?(/^\\d+(\\.\\d+)?$/.test(v)?Number(v):Date.parse(v)):Number(v);
  if(Number.isFinite(t)&&t>0&&t<1e12)t*=1000;
  return {open:Number(c.open),high:Number(c.high),low:Number(c.low),close:Number(c.close),time:t};
 }).filter((c:any)=>[c.open,c.high,c.low,c.close,c.time].every(Number.isFinite)).sort((a:any,b:any)=>a.time-b.time);
 const unique=rows.filter((c:any,i:number)=>i===0||c.time>rows[i-1].time);
 if(unique.length<60)throw new Error("Insufficient completed "+frame.key+" candles.");
 for(const c of unique)if(!finite(c.open)||!finite(c.high)||!finite(c.low)||!finite(c.close)||c.high<Math.max(c.open,c.close)||c.low>Math.min(c.open,c.close)||c.high<c.low)throw new Error("Invalid OHLC data.");
 const last=unique[unique.length-1],age=now-(last.time+frame.ms);
 if(age< -120000||age>frame.ms*1.5)throw new Error("Stale "+frame.key+" candle data.");
 const diffs=unique.slice(1).map((c:any,i:number)=>c.time-unique[i].time).filter((n:number)=>n>0).sort((a:number,b:number)=>a-b);
 const median=diffs[Math.floor(diffs.length/2)];
 if(!median||median<frame.ms*.8||median>frame.ms*1.2)throw new Error("Unexpected "+frame.key+" candle cadence.");
 return unique;
}
function forecast(symbol:string,price:number,series:any[],horizon:string,bars:number,generatedAt:string){
 const closes=series.map(c=>c.close),returns:number[]=[];
 for(let i=Math.max(1,closes.length-49);i<closes.length;i++)returns.push(Math.log(closes[i]/closes[i-1]));
 if(returns.length<30)throw new Error("Not enough 5M returns to forecast.");
 const sample=returns.slice(-48),mean=sample.reduce((a,b)=>a+b,0)/sample.length;
 const variance=sample.reduce((a,b)=>a+(b-mean)**2,0)/(sample.length-1);
 const sigma=Math.sqrt(variance);
 const drift=mean*bars,uncertainty=1.645*sigma*Math.sqrt(bars);
 const expected=price*Math.exp(drift);
 const lower=price*Math.exp(drift-uncertainty),upper=price*Math.exp(drift+uncertainty);
 const threshold=sigma*Math.sqrt(bars)*.15;
 const bias=drift>threshold?"UP":drift< -threshold?"DOWN":"SIDEWAYS";
 return {symbol,generated_at:generatedAt,source:"biquote.io",model_version:"foresight-baseline-0.1.0",model_type:"VOLATILITY_AND_RECENT_DRIFT_BASELINE",horizon,horizon_minutes:bars*5,reference_price:price,expected_return:Math.exp(drift)-1,expected_price:expected,lower_price:lower,upper_price:upper,realized_volatility:sigma*Math.sqrt(bars),directional_bias:bias,probabilities_calibrated:false,probability_up:null,probability_down:null,probability_sideways:null,scenario:{baseline:"Recent log-return drift plus historical volatility interval",horizonBars:bars,intervalLevel:"approximately 90% under a normal-return assumption; not empirically calibrated",upsideCondition:"Price holds above the reference and realized momentum remains positive.",downsideCondition:"Price breaks below the reference and realized momentum remains negative.",invalidation:"Fresh data or a volatility/regime shift invalidates this snapshot."},feature_snapshot:{sampleBars:sample.length,meanLogReturnPer5m:mean,standardDeviationPer5m:sigma,calculation:"5M completed candle close-to-close log returns"},data_quality:{completedCandles:series.length,latestCandleTime:new Date(series[series.length-1].time).toISOString(),quoteReference:"latest quote midpoint when fresh; otherwise last completed 5M close",probabilityStatus:"NOT_CALIBRATED"},evaluation_status:"PENDING"};
}
async function rest(path:string,key:string,method="GET",body?:any,prefer?:string){
 const base=Deno.env.get("SUPABASE_URL");if(!base)throw new Error("SUPABASE_URL missing");
 const h:Record<string,string>={"apikey":key,"Content-Type":"application/json"};
 if(!key.startsWith("sb_secret_"))h.Authorization="Bearer "+key;
 if(prefer)h.Prefer=prefer;
 const r=await fetch(base+"/rest/v1/"+path,{method,headers:h,body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
 const t=await r.text();if(!r.ok)throw new Error("Database request failed ("+r.status+"): "+t.slice(0,500));
 return t?JSON.parse(t):null;
}
async function archive(rows:any[],key:string){
 let saved=0;
 for(let i=0;i<rows.length;i+=400){
  await rest("market_candle_archive?on_conflict=symbol%2Ctimeframe%2Ccandle_time",key,"POST",rows.slice(i,i+400),"resolution=merge-duplicates,return=minimal");
  saved+=Math.min(400,rows.length-i);
 }
 return saved;
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers});
 if(req.method!=="POST")return json({error:"POST required"},405);
 try{
  const secret=Deno.env.get("MARKET_MONITOR_SECRET");
  const supplied=req.headers.get("x-monitor-secret");
  const bearer=(req.headers.get("authorization")||"").replace(/^Bearer\\s+/i,"");
  let authorized=Boolean(secret&&supplied===secret);
  if(!authorized&&bearer){
   const anon=Deno.env.get("SUPABASE_ANON_KEY")||(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")?JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS")!).default:"");
   const base=Deno.env.get("SUPABASE_URL");
   if(anon&&base){
    const authCheck=await fetch(base+"/auth/v1/user",{headers:{apikey:anon,Authorization:"Bearer "+bearer},signal:AbortSignal.timeout(8000)});
    authorized=authCheck.ok;
   }
  }
  if(!authorized)return json({error:"Sign in to run the Market Foresight scan."},401);
  const key=getServiceKey();if(!key)throw new Error("Supabase server secret is not configured.");
  const started=Date.now(),generatedAt=new Date().toISOString(),archiveRows:any[]=[],results:any[]=[];
  const q=await provider("https://biquote.io/api/latest?symbols=BTCUSD&symbols=EURUSD&symbols=XAUUSD&symbols=USDJPY");
  const quotes=q.data||q.quotes||q;
  for(const symbol of symbols){
   try{
    const byFrame:Record<string,any[]>={};
    for(const frame of frames){
     const p=await provider("https://biquote.io/api/"+encodeURIComponent(symbol)+"/ohlc?interval="+frame.interval+"&limit=240");
     if(p.symbol&&String(p.symbol).toUpperCase()!==symbol)throw new Error("Provider symbol mismatch.");
     if(p.interval&&String(p.interval).toLowerCase()!==frame.interval)throw new Error("Provider timeframe mismatch.");
     const raw=Array.isArray(p)?p:(p.bars||p.data||p.candles||[]);
     if(!Array.isArray(raw)||!raw.length)throw new Error("Empty "+frame.key+" history.");
     const cs=candlesFrom(raw,frame);byFrame[frame.key]=cs;
     for(const c of cs)archiveRows.push({symbol,timeframe:frame.key,candle_time:new Date(c.time).toISOString(),open:c.open,high:c.high,low:c.low,close:c.close,source:"biquote.io"});
    }
    const quote=quotes[symbol],bid=Number(quote?.bid),ask=Number(quote?.ask),age=Number(quote?.quoteAgeSeconds);
    const quoteFresh=quote&&quote.stale===false&&Number.isFinite(age)&&age>=0&&age<=30&&finite(bid)&&finite(ask)&&ask>=bid;
    const price=quoteFresh?(bid+ask)/2:byFrame["5M"][byFrame["5M"].length-1].close;
    const forecasts=[
     forecast(symbol,price,byFrame["5M"],"15M",3,generatedAt),
     forecast(symbol,price,byFrame["5M"],"1H",12,generatedAt),
     forecast(symbol,price,byFrame["5M"],"4H",48,generatedAt)
    ];
    for(const f of forecasts)f.data_quality={...f.data_quality,quoteFresh:Boolean(quoteFresh),quoteAgeSeconds:quoteFresh?age:null,referencePriceSource:quoteFresh?"fresh_bid_ask_midpoint":"last_completed_5m_close"};
    results.push({symbol,status:"FORECAST_READY",referencePrice:price,referenceSource:quoteFresh?"fresh_quote_midpoint":"completed_5m_close",quoteAgeSeconds:quoteFresh?age:null,forecasts});
   }catch(e){results.push({symbol,status:"ABSTAINED",reason:e instanceof Error?e.message:"Market data unavailable."});}
  }
  const archived=await archive(archiveRows,key);
  const forecastRows=results.flatMap(r=>r.forecasts||[]);
  let inserted=0;
  for(let i=0;i<forecastRows.length;i+=100){
   const out=await rest("market_foresight_forecasts",key,"POST",forecastRows.slice(i,i+100),"return=representation");
   inserted+=Array.isArray(out)?out.length:0;
  }
  return json({success:true,engine:"Mktradehome Market Foresight",modelVersion:"foresight-baseline-0.1.0",generatedAt,durationMs:Date.now()-started,markets:results.length,forecastsCreated:inserted,candlesArchived:archived,probabilitiesCalibrated:false,createsApprovals:false,createsQueueItems:false,executesTrades:false,results});
 }catch(e){return json({error:e instanceof Error?e.message:"Foresight engine failed safely."},500);}
});