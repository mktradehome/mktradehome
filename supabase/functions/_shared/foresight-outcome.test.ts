import { assertEquals, assertNotEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { resolveForecastOutcome } from "./foresight-outcome.ts";
const forecast={id:"f1",generated_at:"2026-11-19T12:02:00.000Z",horizon_minutes:15,reference_price:100,expected_price:101,lower_price:98,upper_price:104};
Deno.test("uses the first completed 5M close covering the forecast horizon, not a later price",()=>{
 const result=resolveForecastOutcome(forecast,[
  {candle_time:"2026-11-19T12:05:00.000Z",high:102,low:99,close:101},
  {candle_time:"2026-11-19T12:10:00.000Z",high:103,low:100,close:102},
  {candle_time:"2026-11-19T12:15:00.000Z",high:104,low:101,close:103},
  {candle_time:"2026-11-19T12:20:00.000Z",high:110,low:90,close:109}
 ],Date.parse("2026-11-19T12:30:00.000Z"));
 assertEquals(result?.actual_price,103);
 assertEquals(result?.actual_high,104);
 assertEquals(result?.actual_low,99);
 assertEquals(result?.horizon_endpoint_close_time,"2026-11-19T12:20:00.000Z");
});
Deno.test("does not evaluate before the horizon matures",()=>{
 assertEquals(resolveForecastOutcome(forecast,[],Date.parse("2026-11-19T12:16:59.000Z")),null);
});
Deno.test("abstains when the horizon endpoint candle is missing",()=>{
 const result=resolveForecastOutcome(forecast,[
  {candle_time:"2026-11-19T12:05:00.000Z",high:102,low:99,close:101},
  {candle_time:"2026-11-19T12:10:00.000Z",high:103,low:100,close:102}
 ],Date.parse("2026-11-19T12:30:00.000Z"));
 assertEquals(result,null);
});
Deno.test("rejects invalid OHLC evidence",()=>{
 const result=resolveForecastOutcome(forecast,[
  {candle_time:"2026-11-19T12:15:00.000Z",high:100,low:105,close:103}
 ],Date.parse("2026-11-19T12:30:00.000Z"));
 assertEquals(result,null);
});
Deno.test("records return and absolute forecast error from horizon close",()=>{
 const result=resolveForecastOutcome(forecast,[
  {candle_time:"2026-11-19T12:15:00.000Z",high:104,low:101,close:103}
 ],Date.parse("2026-11-19T12:30:00.000Z"));
 assertEquals(result?.actual_return,0.03);
 assertEquals(result?.absolute_error,2);
 assertNotEquals(result?.actual_price,109);
});
