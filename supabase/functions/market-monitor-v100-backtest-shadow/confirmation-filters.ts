export type TradeSide = "BUY" | "SELL";
export type TimeframeSignal = TradeSide | "WAIT";

/** Returns a rejection reason unless the completed 4H signal agrees with the candidate. */
export function fourHourConfirmationBlock(side: TradeSide, fourHourSignal: TimeframeSignal): string | null {
  return fourHourSignal === side ? null : "4H_SIGNAL_NOT_CONFIRMED";
}
