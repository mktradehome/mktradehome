export type SetupCandidate = {
  candidateId: string;
  symbol: string;
  side: "BUY" | "SELL";
  createdAt: number;
  entry: number;
  atr: number;
  /** Stable fingerprint of completed 4H/1H/15M directional and structure evidence. */
  structureKey: string;
  invalidated?: boolean;
  materialRegimeChange?: boolean;
};

export type EpisodeDecision = {
  relation: "NEW_EPISODE" | "REFRESHED_EPISODE";
  reason: string;
};

/**
 * Links a refreshed candidate only when market, direction, completed-timeframe
 * structure, freshness and normalized entry drift all support continuity.
 * Time proximity alone can never link candidates.
 */
export function classifySetupEpisode(
  previous: SetupCandidate | null,
  next: SetupCandidate,
  maxGapMs = 30 * 60_000,
  maxEntryDriftAtr = 0.75,
): EpisodeDecision {
  const valid = (c: SetupCandidate) =>
    !!c.candidateId && !!c.symbol && (c.side === "BUY" || c.side === "SELL") &&
    Number.isFinite(c.createdAt) && c.createdAt > 0 &&
    Number.isFinite(c.entry) && c.entry > 0 &&
    Number.isFinite(c.atr) && c.atr > 0 &&
    typeof c.structureKey === "string" && c.structureKey.length > 0;

  if (!valid(next)) return { relation: "NEW_EPISODE", reason: "INVALID_CANDIDATE_EVIDENCE" };
  if (!previous) return { relation: "NEW_EPISODE", reason: "NO_PREVIOUS_CANDIDATE" };
  if (!valid(previous)) return { relation: "NEW_EPISODE", reason: "INVALID_PREVIOUS_EVIDENCE" };
  if (next.symbol !== previous.symbol) return { relation: "NEW_EPISODE", reason: "DIFFERENT_MARKET" };
  if (next.side !== previous.side) return { relation: "NEW_EPISODE", reason: "DIRECTION_CHANGED" };
  if (next.invalidated || previous.invalidated) return { relation: "NEW_EPISODE", reason: "SETUP_INVALIDATED" };
  if (next.materialRegimeChange) return { relation: "NEW_EPISODE", reason: "MATERIAL_REGIME_CHANGE" };
  if (next.structureKey !== previous.structureKey) return { relation: "NEW_EPISODE", reason: "STRUCTURE_FINGERPRINT_CHANGED" };
  const elapsed = next.createdAt - previous.createdAt;
  if (elapsed <= 0 || elapsed > maxGapMs) return { relation: "NEW_EPISODE", reason: "OUTSIDE_CONTINUITY_WINDOW" };
  const normalizedDrift = Math.abs(next.entry - previous.entry) / Math.max(next.atr, previous.atr);
  if (!Number.isFinite(normalizedDrift) || normalizedDrift > maxEntryDriftAtr) {
    return { relation: "NEW_EPISODE", reason: "ENTRY_DRIFT_TOO_LARGE" };
  }
  return { relation: "REFRESHED_EPISODE", reason: "SAME_MARKET_DIRECTION_STRUCTURE_AND_PRICE_ZONE" };
}
