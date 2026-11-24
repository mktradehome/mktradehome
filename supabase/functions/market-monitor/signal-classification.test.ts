import { classifyValidatedSignal, type SignalClassificationInput } from "./signal-classification.ts";

function assert(value: unknown, message = "Assertion failed") {
  if (!value) throw new Error(message);
}
function fixture(side: "BUY" | "SELL" = "BUY"): SignalClassificationInput {
  const sign = side === "BUY" ? 1 : -1;
  const frame = (score: number) => ({ emaAligned: true, directionalScore: score * sign });
  return {
    side,
    hardGatesPassed: true,
    frames: { "4H": frame(18), "1H": frame(32), "15M": frame(21), "5M": frame(4) },
  };
}

Deno.test("classifies fully aligned BUY as Good and Clear", () => {
  const result = classifyValidatedSignal(fixture("BUY"));
  assert(result.label === "GOOD_AND_CLEAR");
  assert(result.displayLabel === "GOOD AND CLEAR SIGNAL");
});

Deno.test("classifies fully aligned SELL as Good and Clear", () => {
  const result = classifyValidatedSignal(fixture("SELL"));
  assert(result.label === "GOOD_AND_CLEAR");
});

Deno.test("keeps a verified but less-confluent candidate as Normal, not WAIT", () => {
  const input = fixture();
  input.frames["4H"] = { emaAligned: false, directionalScore: -4 };
  const result = classifyValidatedSignal(input);
  assert(result.label === "NORMAL");
  assert(result.displayLabel === "NORMAL SIGNAL");
});

Deno.test("does not downgrade hard validation for Normal classification", () => {
  const input = fixture();
  input.hardGatesPassed = false;
  const result = classifyValidatedSignal(input);
  assert(result.label === "WAIT");
  assert(result.displayLabel === "WAIT");
});

Deno.test("does not classify WAIT as a trade signal", () => {
  const input = fixture();
  input.side = "WAIT";
  const result = classifyValidatedSignal(input);
  assert(result.label === "WAIT");
});

Deno.test("rejects non-finite directional scores from Good and Clear tier", () => {
  const input = fixture();
  input.frames["15M"].directionalScore = Number.NaN;
  const result = classifyValidatedSignal(input);
  assert(result.label === "WAIT");
});


Deno.test("treats a zero 5M score as non-opposition, not confirmation", () => {
  const input = fixture("BUY");
  input.frames["5M"].directionalScore = 0;
  const result = classifyValidatedSignal(input);
  assert(result.label === "GOOD_AND_CLEAR");
  assert(result.reason.includes("does not oppose"));
});

Deno.test("keeps a verified candidate NORMAL when 5M score opposes direction", () => {
  const input = fixture("BUY");
  input.frames["5M"].directionalScore = -1;
  const result = classifyValidatedSignal(input);
  assert(result.label === "NORMAL");
});

Deno.test("fails closed when timeframe evidence is missing", () => {
  const input = fixture("BUY");
  input.frames["15M"] = undefined as never;
  const result = classifyValidatedSignal(input);
  assert(result.label === "WAIT");
});
