import { inspectPositionSnapshot } from "../_shared/mt5-position-snapshot.ts";

const validPosition = (overrides: Record<string, unknown> = {}) => ({
  position_id: 90001,
  ticket: 90002,
  symbol: "BTCUSD",
  side: "BUY",
  volume: 0.01,
  entry_price: 60000,
  stop_loss: 59000,
  take_profit: 62000,
  current_price: 60100,
  profit: 1,
  swap: -0.02,
  opened_at_unix: 1795300000,
  ...overrides,
});

Deno.test("complete when every broker position is present", () => {
  const result = inspectPositionSnapshot([validPosition()], 1);
  if (!result.valid || !result.complete || result.positions.length !== 1) throw new Error("Expected complete snapshot.");
});

Deno.test("empty enumerated list is complete only for zero broker positions", () => {
  const zero = inspectPositionSnapshot([], 0);
  const mismatch = inspectPositionSnapshot([], 1);
  if (!zero.valid || !zero.complete) throw new Error("Expected complete zero-position snapshot.");
  if (!mismatch.valid || mismatch.complete) throw new Error("Expected incomplete count mismatch.");
});

Deno.test("missing positions array is never considered complete", () => {
  const result = inspectPositionSnapshot(undefined, 0);
  if (!result.valid || result.complete || result.positions.length !== 0) throw new Error("Missing list must remain incomplete.");
});

Deno.test("rejects duplicate position identifiers", () => {
  const result = inspectPositionSnapshot([validPosition(), validPosition({ ticket: 90003 })], 2);
  if (result.valid || result.complete) throw new Error("Duplicate IDs must be rejected.");
});

Deno.test("rejects malformed position records", () => {
  const result = inspectPositionSnapshot([validPosition({ profit: "1.00" })], 1);
  if (result.valid || result.complete) throw new Error("Malformed position must be rejected.");
});

Deno.test("rejects invalid broker position counts", () => {
  const result = inspectPositionSnapshot([], 1.5);
  if (result.valid || result.complete) throw new Error("Invalid broker count must be rejected.");
});
