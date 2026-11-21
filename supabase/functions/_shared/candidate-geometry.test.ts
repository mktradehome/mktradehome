import { candidateValidationReason } from "./candidate-geometry.ts";

function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}

Deno.test("accepts BUY and SELL targets when only binary floating-point noise is present", () => {
  const buy = { signal: "BUY" as const, entry: 184.4219196531691, riskDistance: 16.15939135010594,
    stopLoss: 168.26252865316916, takeProfit1: 216.74070295905098, takeProfit2: 232.9000946122201 };
  const sell = { signal: "SELL" as const, entry: 184.4219196531691, riskDistance: 16.15939135010594,
    stopLoss: 200.58131130610504, takeProfit1: 152.10313634725722, takeProfit2: 135.94374469408734 };
  assert(candidateValidationReason(buy) === null, "BUY should pass within machine precision");
  assert(candidateValidationReason(sell) === null, "SELL should pass within machine precision");
});

Deno.test("rejects a genuinely undersized target beyond numerical tolerance", () => {
  const c = { signal: "SELL" as const, entry: 184.4219196531691, riskDistance: 16.15939135010594,
    stopLoss: 200.58131130610504, takeProfit1: 152.10413634725722, takeProfit2: 135.94374469408734 };
  assert(candidateValidationReason(c) === "TP1_BELOW_2R");
});

Deno.test("rejects wrong-side stops and inconsistent risk distance", () => {
  const wrongStop = { signal: "BUY" as const, entry: 100, stopLoss: 101, takeProfit1: 104,
    takeProfit2: 106, riskDistance: 1 };
  const wrongRisk = { signal: "BUY" as const, entry: 100, stopLoss: 98, takeProfit1: 104,
    takeProfit2: 106, riskDistance: 1 };
  assert(candidateValidationReason(wrongStop) === "STOP_LOSS_ON_WRONG_SIDE");
  assert(candidateValidationReason(wrongRisk) === "RISK_DISTANCE_MISMATCH");
});
