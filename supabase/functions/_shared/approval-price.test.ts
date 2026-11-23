import { validateApprovalExecutionPrice } from "./approval-price.ts";
function assert(value: unknown, message = "Assertion failed") { if (!value) throw new Error(message); }
const base = {
  side: "BUY" as const, entry: 100, stopLoss: 98, takeProfit1: 104, takeProfit2: 106,
  bid: 100.9, ask: 101, timeframe15m: { close: 100, atr14: 2 },
  originalQuote: { bid: 99.9, ask: 100.1 },
};
Deno.test("uses Ask for BUY and permits favourable movement when original RR remains valid", () => {
  const r = validateApprovalExecutionPrice({ ...base, bid: 99.4, ask: 99.5 });
  assert(r.valid && r.executionEntry === 99.5 && (r.rr1 ?? 0) >= 2 && (r.rr2 ?? 0) >= 3);
});
Deno.test("uses Bid for SELL", () => {
  const r = validateApprovalExecutionPrice({ ...base, side: "SELL", entry: 100, stopLoss: 102, takeProfit1: 96, takeProfit2: 94, bid: 100.5, ask: 100.6 });
  assert(r.valid && r.executionEntry === 100.5);
});
Deno.test("rejects adverse movement when RR falls below minimum", () => {
  const r = validateApprovalExecutionPrice({ ...base, bid: 101.4, ask: 101.5 });
  assert(!r.valid && r.reason.includes("risk/reward"));
});
Deno.test("rejects movement outside the original 15M ATR entry zone", () => {
  const r = validateApprovalExecutionPrice({ ...base, bid: 101.8, ask: 101.9 });
  assert(!r.valid && r.reason.includes("15M ATR"));
});
Deno.test("rejects an excessively widened spread", () => {
  const r = validateApprovalExecutionPrice({ ...base, bid: 99, ask: 101 });
  assert(!r.valid && r.reason.includes("spread"));
});
Deno.test("rejects price crossing original stop", () => {
  const r = validateApprovalExecutionPrice({ ...base, bid: 97.8, ask: 97.9, timeframe15m: { close: 100, atr14: 4 } });
  assert(!r.valid && r.reason.includes("crossed"));
});
