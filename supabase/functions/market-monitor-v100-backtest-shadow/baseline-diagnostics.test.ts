import { baselineRejectionReason, type BaselineDiagnosticFrames } from "./baseline-diagnostics.ts";

function makeFrames(): BaselineDiagnosticFrames {
  const f = { close: 100.2, ema20: 100, ema50: 99, atr14: 1, macdHistogram: 0.2 };
  return { "4H": { ...f }, "1H": { ...f }, "15M": { ...f }, "5M": { ...f } };
}
function input(
  frames = makeFrames(),
  scores = { "4H": 20, "1H": 30, "15M": 20, "5M": 20 },
) {
  return { frames, scores, price: 100.2, spread: 0.02 };
}

Deno.test("baseline diagnostic identifies no 1H EMA direction", () => {
  const f = makeFrames();
  f["1H"] = { ...f["1H"], ema20: 99, ema50: 99 };
  if (baselineRejectionReason(input(f)) !== "NO_1H_DIRECTION") throw new Error("Expected NO_1H_DIRECTION");
});
Deno.test("baseline diagnostic identifies weak BUY 1H confirmation", () => {
  const f = makeFrames();
  if (baselineRejectionReason(input(f, { "4H": 0, "1H": 11, "15M": 0, "5M": 0 })) !== "WEAK_1H_BIAS") {
    throw new Error("Expected WEAK_1H_BIAS");
  }
});
Deno.test("baseline diagnostic identifies weak SELL 1H confirmation", () => {
  const f = makeFrames();
  f["1H"] = { ...f["1H"], ema20: 98, ema50: 99 };
  if (baselineRejectionReason(input(f, { "4H": 0, "1H": -11, "15M": 0, "5M": 0 })) !== "WEAK_1H_BIAS") {
    throw new Error("Expected WEAK_1H_BIAS");
  }
});
Deno.test("baseline diagnostic identifies strong 4H opposition", () => {
  const f = makeFrames();
  if (baselineRejectionReason(input(f, { "4H": -31, "1H": 30, "15M": 20, "5M": 20 })) !== "4H_CONFLICT") {
    throw new Error("Expected 4H_CONFLICT");
  }
});
Deno.test("baseline diagnostic identifies pending 15M structure", () => {
  const f = makeFrames();
  f["15M"] = { ...f["15M"], ema20: 98, ema50: 99 };
  if (baselineRejectionReason(input(f, { "4H": 0, "1H": 30, "15M": -10, "5M": 20 })) !== "15M_SETUP_PENDING") {
    throw new Error("Expected 15M_SETUP_PENDING");
  }
});
Deno.test("baseline diagnostic allows the same qualified SELL pullback reversal as the builder", () => {
  const f = makeFrames();
  f["1H"] = { ...f["1H"], ema20: 98, ema50: 99 };
  f["15M"] = { ...f["15M"], close: 99.5, ema20: 101, ema50: 100 };
  f["5M"] = { ...f["5M"], close: 99, ema20: 100, macdHistogram: -0.1 };
  const reason = baselineRejectionReason({ ...input(f, { "4H": 0, "1H": -30, "15M": -30, "5M": 0 }), price: 99.5 });
  if (reason !== "BUILDER_OR_FINAL_VALIDATION") throw new Error("Qualified pullback should pass directional gates");
});
Deno.test("baseline diagnostic identifies strong 5M entry conflict", () => {
  const f = makeFrames();
  if (baselineRejectionReason(input(f, { "4H": 0, "1H": 30, "15M": 20, "5M": -41 })) !== "5M_ENTRY_CONFLICT") {
    throw new Error("Expected 5M_ENTRY_CONFLICT");
  }
});
Deno.test("baseline diagnostic identifies invalid ATR", () => {
  const f = makeFrames();
  f["15M"] = { ...f["15M"], atr14: 0 };
  if (baselineRejectionReason(input(f)) !== "ATR_INVALID") throw new Error("Expected ATR_INVALID");
});
Deno.test("baseline diagnostic identifies an overextended entry", () => {
  const f = makeFrames();
  if (baselineRejectionReason({ ...input(f), price: 102 }) !== "ENTRY_TOO_EXTENDED") {
    throw new Error("Expected ENTRY_TOO_EXTENDED");
  }
});
Deno.test("baseline diagnostic identifies invalid risk geometry", () => {
  const f = makeFrames();
  f["15M"] = { ...f["15M"], atr14: 100 };
  if (baselineRejectionReason(input(f)) !== "RISK_INVALID") throw new Error("Expected RISK_INVALID");
});
