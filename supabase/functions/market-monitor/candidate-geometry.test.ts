import { candidateValidationReason } from "./candidate-geometry.ts";

function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}
function fixture(signal: "BUY" | "SELL") {
  const entry = 184.4219196531691;
  const riskDistance = 16.15939135010594;
  return {
    signal, entry, riskDistance,
    stopLoss: signal === "BUY" ? entry - riskDistance : entry + riskDistance,
    takeProfit1: signal === "BUY" ? entry + 2 * riskDistance : entry - 2 * riskDistance,
    takeProfit2: signal === "BUY" ? entry + 3 * riskDistance : entry - 3 * riskDistance,
  };
}

Deno.test("accepts BUY and SELL targets when only binary floating-point noise is present", () => {
  assert(candidateValidationReason(fixture("BUY")) === null, "BUY should pass within machine precision");
  assert(candidateValidationReason(fixture("SELL")) === null, "SELL should pass within machine precision");
});

Deno.test("rejects a genuinely undersized target beyond numerical tolerance", () => {
  const c = fixture("SELL");
  c.takeProfit1 -= 0.001;
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
