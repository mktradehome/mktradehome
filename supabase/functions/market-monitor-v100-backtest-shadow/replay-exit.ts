export type ReplaySide = "BUY" | "SELL";
export interface ReplayBar { open: number; high: number; low: number; close: number; }
export interface ReplayExitInput {
  bars: ReplayBar[];
  entryIndex: number;
  entryPrice: number;
  side: ReplaySide;
  stopLoss: number;
  takeProfit: number;
  riskDistance: number;
  maxHoldBars: number;
}
export interface ReplayExitResult {
  index: number;
  exit: "SL" | "TP1" | "TIME";
  r: number;
  tp1: boolean;
}

/**
 * Resolves a historical position from its actual fill candle onward.
 * The entry candle is included because entry occurs at its OPEN.
 * When one OHLC candle touches both SL and TP, SL wins conservatively.
 * Returns null when the available history ends before the maximum holding
 * period and neither exit level was reached.
 */
export function resolveReplayExit(input: ReplayExitInput): ReplayExitResult | null {
  const { bars, entryIndex, entryPrice, side, stopLoss, takeProfit, riskDistance, maxHoldBars } = input;
  if (!Array.isArray(bars) || !Number.isInteger(entryIndex) || entryIndex < 0 ||
      entryIndex >= bars.length || !Number.isFinite(entryPrice) || entryPrice <= 0 || !Number.isFinite(stopLoss) || !Number.isFinite(takeProfit) ||
      !Number.isFinite(riskDistance) || riskDistance <= 0 ||
      !Number.isInteger(maxHoldBars) || maxHoldBars < 1 ||
      (side !== "BUY" && side !== "SELL")) {
    throw new Error("Invalid replay exit inputs.");
  }
  const plannedExitIndex = entryIndex + maxHoldBars;
  const lastAvailableIndex = Math.min(plannedExitIndex, bars.length - 1);
  for (let index = entryIndex; index <= lastAvailableIndex; index++) {
    const bar = bars[index];
    if (![bar.open, bar.high, bar.low, bar.close].every(Number.isFinite) ||
        bar.high < bar.low || bar.high < Math.max(bar.open, bar.close) ||
        bar.low > Math.min(bar.open, bar.close)) {
      throw new Error("Invalid OHLC bar in replay exit.");
    }
    const stopTouched = side === "BUY" ? bar.low <= stopLoss : bar.high >= stopLoss;
    const targetTouched = side === "BUY" ? bar.high >= takeProfit : bar.low <= takeProfit;
    if (stopTouched) return { index, exit: "SL", r: -1, tp1: false };
    if (targetTouched) return { index, exit: "TP1", r: 2, tp1: true };
    if (index === plannedExitIndex) {
      const signedMove = side === "BUY" ? bar.close - entryPrice : entryPrice - bar.close;
      return { index, exit: "TIME", r: signedMove / riskDistance, tp1: false };
    }
  }
  return null;
}
