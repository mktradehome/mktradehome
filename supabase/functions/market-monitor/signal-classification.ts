export type SignalSide = "BUY" | "SELL";
export type SignalLabel = "GOOD_AND_CLEAR" | "NORMAL" | "WAIT";

export interface TimeframeQuality {
  emaAligned: boolean;
  directionalScore: number;
}

export interface SignalClassificationInput {
  side: SignalSide | "WAIT";
  /** Must be true only after the existing independent hard-validation path passes. */
  hardGatesPassed: boolean;
  frames: {
    "4H": TimeframeQuality;
    "1H": TimeframeQuality;
    "15M": TimeframeQuality;
    "5M": TimeframeQuality;
  };
}

export interface SignalClassification {
  label: SignalLabel;
  displayLabel: "GOOD AND CLEAR SIGNAL" | "NORMAL SIGNAL" | "WAIT";
  reason: string;
}

/**
 * Classifies an already-validated candidate. It never creates a candidate and
 * cannot override quote freshness, session, entry, SL/TP, risk, proof, expiry,
 * duplicate or manual-approval checks.
 *
 * NORMAL is not a weaker safety tier: it is the default label for any candidate
 * that passed every common hard gate but does not meet the higher confluence bar.
 */
export function classifyValidatedSignal(input: SignalClassificationInput): SignalClassification {
  if (input.side !== "BUY" && input.side !== "SELL") {
    return { label: "WAIT", displayLabel: "WAIT", reason: "No valid BUY/SELL candidate." };
  }
  if (input.hardGatesPassed !== true) {
    return { label: "WAIT", displayLabel: "WAIT", reason: "Candidate has not passed every mandatory validation gate." };
  }

  const direction = input.side === "BUY" ? 1 : -1;
  const alignedAndStrong = (frame: TimeframeQuality, minimum: number) =>
    frame.emaAligned === true &&
    Number.isFinite(frame.directionalScore) &&
    frame.directionalScore * direction >= minimum;

  const highConfluence =
    alignedAndStrong(input.frames["4H"], 12) &&
    alignedAndStrong(input.frames["1H"], 12) &&
    alignedAndStrong(input.frames["15M"], 12) &&
    alignedAndStrong(input.frames["5M"], 0);

  if (highConfluence) {
    return {
      label: "GOOD_AND_CLEAR",
      displayLabel: "GOOD AND CLEAR SIGNAL",
      reason: "All four timeframes show directional EMA alignment; 4H, 1H and 15M have strong directional scores and 5M confirms rather than opposes.",
    };
  }

  return {
    label: "NORMAL",
    displayLabel: "NORMAL SIGNAL",
    reason: "The candidate passed the same mandatory validation gates, but does not meet the higher all-timeframe confluence standard for Good and Clear.",
  };
}
