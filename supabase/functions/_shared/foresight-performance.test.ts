import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeForecastPerformance } from "./foresight-performance.ts";
Deno.test("summarizes rolling forecast errors and interval coverage by horizon",()=>{
 const result=summarizeForecastPerformance([
  {id:"a",symbol:"EURUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:00:00.000Z",expected_return:0.02},
  {id:"b",symbol:"BTCUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:00:00.000Z",expected_return:-0.01},
  {id:"c",symbol:"XAUUSD",horizon:"1H",horizon_minutes:60,generated_at:"2026-01-01T00:00:00.000Z",expected_return:0}
 ],[
  {forecast_id:"a",actual_return:0.01,interval_covered:true},
  {forecast_id:"b",actual_return:0.02,interval_covered:false},
  {forecast_id:"c",actual_return:0,interval_covered:true}
 ]);
 assertEquals(result.overall.evaluated,3);
 assertEquals(result.overall.directionalSample,2);
 assertEquals(result.overall.directionalAccuracyPct,50);
 assertAlmostEquals(result.overall.meanAbsoluteReturnErrorPct??NaN,1.3333333333,1e-8);
 assertAlmostEquals(result.overall.zeroReturnBaselineErrorPct??NaN,1,1e-8);
 assertAlmostEquals(result.overall.intervalCoveragePct??NaN,66.6666666667,1e-8);
 assertEquals(result.byHorizon[0].evaluated,2);
 assertEquals(result.byHorizon[1].evaluated,1);
 assertEquals(result.byMarketHorizon.length,3);
 assertEquals(result.byMarketHorizon.find(x=>x.symbol==="EURUSD"&&x.horizon==="15M")?.evaluated,1);
 assertEquals(result.byMarketHorizon.find(x=>x.symbol==="BTCUSD"&&x.horizon==="15M")?.directionalAccuracyPct,0);
 assertEquals(result.nonOverlappingOverall.evaluated,3);
});
Deno.test("removes overlapping forecasts within each market and horizon",()=>{
 const result=summarizeForecastPerformance([
  {id:"a",symbol:"EURUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:00:00.000Z",expected_return:0.005},
  {id:"b",symbol:"EURUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:05:00.000Z",expected_return:-0.02},
  {id:"c",symbol:"EURUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:15:00.000Z",expected_return:-0.005}
 ],[
  {forecast_id:"a",actual_return:0.01,interval_covered:true},
  {forecast_id:"b",actual_return:0.02,interval_covered:false},
  {forecast_id:"c",actual_return:-0.01,interval_covered:true}
 ]);
 assertEquals(result.overall.evaluated,3);
 assertEquals(result.nonOverlappingOverall.evaluated,2);
 assertEquals(result.nonOverlappingByHorizon[0].directionalAccuracyPct,100);
 assertAlmostEquals(result.nonOverlappingOverall.meanAbsoluteReturnErrorPct??NaN,0.5,1e-8);
 assertAlmostEquals(result.nonOverlappingOverall.zeroReturnBaselineErrorPct??NaN,1,1e-8);
 assertAlmostEquals(result.nonOverlappingOverall.improvementVsZeroBaselinePct??NaN,50,1e-8);
});
Deno.test("returns null metrics rather than inventing a score when no outcomes exist",()=>{
 const result=summarizeForecastPerformance([],[]);
 assertEquals(result.overall.evaluated,0);
 assertEquals(result.overall.directionalAccuracyPct,null);
 assertEquals(result.overall.meanAbsoluteReturnErrorPct,null);
 assertEquals(result.overall.intervalCoveragePct,null);
 assertEquals(result.nonOverlappingOverall.evaluated,0);
});
Deno.test("ignores orphaned outcomes and invalid numeric observations",()=>{
 const result=summarizeForecastPerformance([{id:"a",symbol:"EURUSD",horizon:"15M",horizon_minutes:15,generated_at:"2026-01-01T00:00:00.000Z",expected_return:0.01}],[
  {forecast_id:"missing",actual_return:0.01,interval_covered:true},
  {forecast_id:"a",actual_return:NaN,interval_covered:true}
 ]);
 assertEquals(result.overall.evaluated,0);
});
