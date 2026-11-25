import { resolveReplayExit } from "./replay-exit.ts";

function assertEquals<T>(actual: T, expected: T, message: string) {
  if (actual !== expected) throw new Error(message + `: expected ${expected}, got ${actual}`);
}

Deno.test("checks the fill candle and catches an immediate stop", () => {
  const result = resolveReplayExit({
    bars: [{ open: 100, high: 101, low: 98, close: 99 }],
    entryIndex: 0, side: "BUY", stopLoss: 99, takeProfit: 102,
    riskDistance: 1, maxHoldBars: 3,
  });
  assertEquals(result?.exit, "SL", "fill-candle stop must be counted");
  assertEquals(result?.r, -1, "stop result must be -1R");
  assertEquals(result?.index, 0, "exit must be on the fill candle");
});

Deno.test("checks the fill candle and catches an immediate target", () => {
  const result = resolveReplayExit({
    bars: [{ open: 100, high: 103, low: 100, close: 102 }],
    entryIndex: 0, side: "BUY", stopLoss: 99, takeProfit: 102,
    riskDistance: 1, maxHoldBars: 3,
  });
  assertEquals(result?.exit, "TP1", "fill-candle target must be counted");
  assertEquals(result?.r, 2, "target result must be +2R");
});

Deno.test("uses the conservative stop when SL and TP are both touched", () => {
  const result = resolveReplayExit({
    bars: [{ open: 100, high: 103, low: 98, close: 101 }],
    entryIndex: 0, side: "BUY", stopLoss: 99, takeProfit: 102,
    riskDistance: 1, maxHoldBars: 3,
  });
  assertEquals(result?.exit, "SL", "ambiguous same-bar event must resolve to SL");
});

Deno.test("does not force-close an unfinished setup when history ends early", () => {
  const result = resolveReplayExit({
    bars: [
      { open: 100, high: 101, low: 100, close: 100.5 },
      { open: 100.5, high: 101, low: 100, close: 100.75 },
    ],
    entryIndex: 0, side: "BUY", stopLoss: 99, takeProfit: 102,
    riskDistance: 1, maxHoldBars: 3,
  });
  assertEquals(result, null, "insufficient future bars must remain unclosed");
});

Deno.test("resolves the time exit at the planned holding limit", () => {
  const result = resolveReplayExit({
    bars: [
      { open: 100, high: 101, low: 100, close: 100.5 },
      { open: 100.5, high: 102, low: 100.25, close: 101.5 },
    ],
    entryIndex: 0, side: "BUY", stopLoss: 99, takeProfit: 103,
    riskDistance: 1, maxHoldBars: 1,
  });
  assertEquals(result?.exit, "TIME", "time exit should occur at holding limit");
  assertEquals(result?.r, 1.5, "time exit R must use entry-to-close movement");
});
