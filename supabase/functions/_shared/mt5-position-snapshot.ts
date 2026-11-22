export type PositionSnapshotInspection = {
  valid: boolean;
  complete: boolean;
  positions: Record<string, unknown>[];
  error?: string;
};

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isPositionId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

/**
 * Fail-closed inspection of broker position snapshots.
 * Missing arrays remain backward-compatible but are never called complete.
 * A count mismatch keeps account totals savable while disabling position totals.
 */
export function inspectPositionSnapshot(
  rawPositions: unknown,
  openPositions: number,
): PositionSnapshotInspection {
  if (!Number.isSafeInteger(openPositions) || openPositions < 0 || openPositions > 100) {
    return { valid: false, complete: false, positions: [], error: "Invalid broker position count." };
  }

  const hasArray = Array.isArray(rawPositions);
  const positions: unknown[] = hasArray ? rawPositions : [];
  if (positions.length > 100) {
    return { valid: false, complete: false, positions: [], error: "Too many open positions." };
  }

  const seen = new Set<number>();
  for (const raw of positions) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      return { valid: false, complete: false, positions: [], error: "Invalid open position record." };
    }
    const p = raw as Record<string, unknown>;
    if (
      !isPositionId(p.position_id) ||
      !isPositionId(p.ticket) ||
      typeof p.symbol !== "string" || p.symbol.length < 3 || p.symbol.length > 32 ||
      !["BUY", "SELL"].includes(String(p.side)) ||
      !isFiniteNumber(p.volume) || p.volume <= 0 || p.volume > 100 ||
      !isFiniteNumber(p.entry_price) || p.entry_price <= 0 ||
      !isFiniteNumber(p.stop_loss) || p.stop_loss < 0 ||
      !isFiniteNumber(p.take_profit) || p.take_profit < 0 ||
      !isFiniteNumber(p.current_price) || p.current_price <= 0 ||
      !isFiniteNumber(p.profit) ||
      !isFiniteNumber(p.swap) ||
      !isFiniteNumber(p.opened_at_unix) || p.opened_at_unix <= 0 ||
      !Number.isSafeInteger(p.opened_at_unix)
    ) {
      return { valid: false, complete: false, positions: [], error: "Invalid open position details." };
    }
    if (seen.has(p.position_id)) {
      return { valid: false, complete: false, positions: [], error: "Duplicate MT5 position ID." };
    }
    seen.add(p.position_id);
  }

  const cleanPositions = positions as Record<string, unknown>[];
  return {
    valid: true,
    complete: hasArray && cleanPositions.length === openPositions,
    positions: cleanPositions,
  };
}
