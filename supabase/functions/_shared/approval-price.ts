export interface ApprovalPriceInput {
  side: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  bid: number;
  ask: number;
  timeframe15m: { close: number; atr14: number };
  originalQuote: { bid: number; ask: number };
}
export interface ApprovalPriceResult {
  valid: boolean;
  reason: string;
  executionEntry?: number;
  spread?: number;
  risk?: number;
  reward1?: number;
  reward2?: number;
  rr1?: number;
  rr2?: number;
  driftFromSignalAtr?: number;
}
const finite = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);
export function validateApprovalExecutionPrice(input: ApprovalPriceInput): ApprovalPriceResult {
  const { side, entry, stopLoss, takeProfit1, takeProfit2, bid, ask, timeframe15m, originalQuote } = input;
  if (side !== "BUY" && side !== "SELL") return { valid: false, reason: "Unsupported trade direction." };
  if (![entry, stopLoss, takeProfit1, takeProfit2, bid, ask, timeframe15m?.close, timeframe15m?.atr14, originalQuote?.bid, originalQuote?.ask].every(finite) ||
      entry <= 0 || stopLoss <= 0 || takeProfit1 <= 0 || takeProfit2 <= 0 ||
      bid <= 0 || ask < bid || timeframe15m.close <= 0 || timeframe15m.atr14 <= 0 ||
      originalQuote.bid <= 0 || originalQuote.ask < originalQuote.bid) {
    return { valid: false, reason: "Invalid execution-price or strategy evidence." };
  }
  const spread = ask - bid;
  const originalSpread = originalQuote.ask - originalQuote.bid;
  const maxSpread = Math.max(originalSpread * 3, timeframe15m.atr14 * 0.25);
  if (spread > maxSpread) return { valid: false, reason: "Live spread widened beyond the strategy's ATR-based safety limit." };

  // Compare like-for-like executable prices. The original strategy builds
  // its 1:2/1:3 geometry from midpoint; therefore the saved Ask/Bid baseline
  // already includes the normal half-spread effect. Require the live quote to
  // preserve that baseline within a small 2% relative RR tolerance.
  const originalExecutionEntry = side === "BUY" ? originalQuote.ask : originalQuote.bid;
  const executionEntry = side === "BUY" ? ask : bid;
  const driftFromSignalAtr = Math.abs(executionEntry - originalExecutionEntry) / timeframe15m.atr14;
  const originalRisk = side === "BUY" ? originalExecutionEntry - stopLoss : stopLoss - originalExecutionEntry;
  const originalReward1 = side === "BUY" ? takeProfit1 - originalExecutionEntry : originalExecutionEntry - takeProfit1;
  const originalReward2 = side === "BUY" ? takeProfit2 - originalExecutionEntry : originalExecutionEntry - takeProfit2;
  if (!(originalRisk > 0 && originalReward1 > 0 && originalReward2 > 0)) {
    return { valid: false, reason: "Original executable-side price does not preserve the candidate's stop/target structure." };
  }
  const originalRr1 = originalReward1 / originalRisk;
  const originalRr2 = originalReward2 / originalRisk;
  const distanceFromStructureAtr = Math.abs(executionEntry - timeframe15m.close) / timeframe15m.atr14;
  if (distanceFromStructureAtr > 0.75) {
    return { valid: false, reason: "Current executable price is beyond the original 15M ATR entry zone." };
  }

  // Keep the original SL/TP levels. Never move protection to make a trade pass.
  const risk = side === "BUY" ? executionEntry - stopLoss : stopLoss - executionEntry;
  const reward1 = side === "BUY" ? takeProfit1 - executionEntry : executionEntry - takeProfit1;
  const reward2 = side === "BUY" ? takeProfit2 - executionEntry : executionEntry - takeProfit2;
  if (!(risk > 0 && reward1 > 0 && reward2 > 0)) {
    return { valid: false, reason: "Current executable price has crossed the original stop or target structure." };
  }
  const rr1 = reward1 / risk;
  const rr2 = reward2 / risk;
  const minimumPreservedRr1 = originalRr1 * 0.98;
  const minimumPreservedRr2 = originalRr2 * 0.98;
  if (rr1 < minimumPreservedRr1 || rr2 < minimumPreservedRr2) {
    return { valid: false, reason: "Live executable price has materially weakened the candidate's original spread-adjusted risk/reward." };
  }
  return { valid: true, reason: "Executable-side quote, spread, 15M entry zone and spread-adjusted risk geometry passed.", executionEntry, spread, risk, reward1, reward2, rr1, rr2, driftFromSignalAtr };
}
