export type ForecastForResolution = {
 id?: string;
 generated_at: string;
 horizon_minutes: number;
 reference_price: number;
 expected_price: number;
 lower_price: number;
 upper_price: number;
};
export type ArchivedFiveMinuteBar = {
 candle_time: string | number;
 high: number;
 low: number;
 close: number;
};
export function resolveForecastOutcome(
 forecast: ForecastForResolution,
 bars: ArchivedFiveMinuteBar[],
 evaluatedAt: number
) {
 const generatedAt=Date.parse(forecast.generated_at);
 const horizonMinutes=Number(forecast.horizon_minutes);
 const reference=Number(forecast.reference_price);
 const expected=Number(forecast.expected_price);
 const lower=Number(forecast.lower_price);
 const upper=Number(forecast.upper_price);
 if(!Number.isFinite(generatedAt)||!Number.isFinite(horizonMinutes)||horizonMinutes<=0||
    !Number.isFinite(reference)||reference<=0||!Number.isFinite(expected)||expected<=0||
    !Number.isFinite(lower)||!Number.isFinite(upper)||lower<=0||upper<lower||
    !Number.isFinite(evaluatedAt)) return null;
 const expiry=generatedAt+horizonMinutes*60000;
 if(evaluatedAt<expiry||!Array.isArray(bars)||!bars.length)return null;
 const normalized=bars.map(bar=>{
  let time=typeof bar.candle_time==="string"?Date.parse(bar.candle_time):Number(bar.candle_time);
  if(Number.isFinite(time)&&time>0&&time<1e12)time*=1000;
  return {time,high:Number(bar.high),low:Number(bar.low),close:Number(bar.close)};
 }).filter(bar=>Number.isFinite(bar.time)&&Number.isFinite(bar.high)&&Number.isFinite(bar.low)&&Number.isFinite(bar.close)&&
  bar.high>=Math.max(bar.close,bar.low)&&bar.low<=Math.min(bar.close,bar.high)&&bar.high>=bar.low)
 .sort((a,b)=>a.time-b.time);
 if(!normalized.length)return null;
 // Candle timestamps are candle-open times. Use the first completed 5M candle
 // whose close reaches or passes the forecast horizon, never the later live quote.
 const endpoint=normalized.find(bar=>bar.time<expiry&&bar.time+300000>=expiry);
 if(!endpoint)return null;
 const windowBars=normalized.filter(bar=>bar.time+300000>generatedAt&&bar.time<expiry);
 if(!windowBars.length)return null;
 const actualPrice=endpoint.close;
 return {
  actual_price:actualPrice,
  actual_return:actualPrice/reference-1,
  actual_high:Math.max(...windowBars.map(bar=>bar.high)),
  actual_low:Math.min(...windowBars.map(bar=>bar.low)),
  absolute_error:Math.abs(actualPrice-expected),
  interval_covered:actualPrice>=lower&&actualPrice<=upper,
  outcome_status:"REALIZED",
  source:"biquote.io_completed_5m_horizon_close",
  horizon_endpoint_candle_time:new Date(endpoint.time).toISOString(),
  horizon_endpoint_close_time:new Date(endpoint.time+300000).toISOString()
 };
}
