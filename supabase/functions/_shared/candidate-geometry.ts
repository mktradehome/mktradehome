export interface CandidateGeometry {
  signal: "BUY" | "SELL";
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskDistance: number;
}

export function candidateValidationReason(c: CandidateGeometry): string | null {
  const nums = [c.entry, c.stopLoss, c.takeProfit1, c.takeProfit2, c.riskDistance];
  if (!nums.every(Number.isFinite) || nums.some(n => n <= 0)) return "NON_FINITE_OR_NON_POSITIVE_PRICE";

  const isBuy = c.signal === "BUY";
  const risk = isBuy ? c.entry - c.stopLoss : c.stopLoss - c.entry;
  const reward1 = isBuy ? c.takeProfit1 - c.entry : c.entry - c.takeProfit1;
  const reward2 = isBuy ? c.takeProfit2 - c.entry : c.entry - c.takeProfit2;
  // Floating-point tolerance only absorbs machine rounding; it is not a price tick or risk allowance.
  const tolerance = Math.max(1, Math.abs(c.entry)) * 1e-10;

  if (!(risk > 0)) return "STOP_LOSS_ON_WRONG_SIDE";
  if (Math.abs(risk - c.riskDistance) > tolerance * 10) return "RISK_DISTANCE_MISMATCH";
  if (reward1 + tolerance < 2 * risk) return "TP1_BELOW_2R";
  if (reward2 + tolerance < 3 * risk) return "TP2_BELOW_3R";
  if (isBuy
    ? !(c.stopLoss < c.entry && c.takeProfit1 > c.entry && c.takeProfit2 > c.entry)
    : !(c.stopLoss > c.entry && c.takeProfit1 < c.entry && c.takeProfit2 < c.entry)) {
    return "TARGET_OR_STOP_SIDE_INVALID";
  }
  return null;
}
