import { assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { summarizeForecastPerformance } from "./foresight-performance.ts";
Deno.test("summarizes directional accuracy, return error and interval coverage by horizon",()=>{
 const result=summarizeForecastPerformance([
  {id:"a",symbol:"EURUSD",horizon:"15M",expected_return:0.02},
  {id:"b",symbol:"BTCUSD",horizon:"15M",expected_return:-0.01},
  {id:"c",symbol:"XAUUSD",horizon:"1H",expected_return:0}
 ],[
  {forecast_id:"a",actual_return:0.01,interval_covered:true},
  {forecast_id:"b",actual_return:0.02,interval_covered:false},
  {forecast_id:"c",actual_return:0,interval_covered:true}
 ]);
 assertEquals(result.overall.evaluated,3);
 assertEquals(result.overall.directionalSample,2);
 assertEquals(result.overall.directionalAccuracyPct,50);
 assertAlmostEquals(result.overall.meanAbsoluteReturnErrorPct??NaN,1.3333333333,1e-8);
 assertAlmostEquals(result.overall.intervalCoveragePct??NaN,66.6666666667,1e-8);
 assertEquals(result.byHorizon[0].evaluated,2);
 assertEquals(result.byHorizon[1].evaluated,1);
});
Deno.test("returns null metrics rather than inventing a score when no outcomes exist",()=>{
 const result=summarizeForecastPerformance([],[]);
 assertEquals(result.overall.evaluated,0);
 assertEquals(result.overall.directionalAccuracyPct,null);
 assertEquals(result.overall.meanAbsoluteReturnErrorPct,null);
 assertEquals(result.overall.intervalCoveragePct,null);
});
Deno.test("ignores orphaned outcomes and invalid numeric observations",()=>{
 const result=summarizeForecastPerformance([{id:"a",symbol:"EURUSD",horizon:"15M",expected_return:0.01}],[
  {forecast_id:"missing",actual_return:0.01,interval_covered:true},
  {forecast_id:"a",actual_return:NaN,interval_covered:true}
 ]);
 assertEquals(result.overall.evaluated,0);
});
