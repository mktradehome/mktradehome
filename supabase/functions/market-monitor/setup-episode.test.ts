import { classifySetupEpisode, type SetupCandidate } from "../_shared/setup-episode.ts";

const base: SetupCandidate = {
  candidateId: "799", symbol: "BTCUSD", side: "SELL",
  createdAt: 1795320000000, entry: 59214, atr: 500,
  structureKey: "4H:SELL|1H:SELL|15M:SELL",
};

Deno.test("same setup refresh links when structure and price zone agree", () => {
  const next = { ...base, candidateId: "800", createdAt: base.createdAt + 10 * 60_000, entry: 59331 };
  const result = classifySetupEpisode(base, next);
  if (result.relation !== "REFRESHED_EPISODE") throw new Error(result.reason);
});

Deno.test("time proximity alone never links different structure", () => {
  const next = { ...base, candidateId: "800", createdAt: base.createdAt + 60_000, structureKey: "4H:BUY|1H:SELL|15M:SELL" };
  if (classifySetupEpisode(base, next).reason !== "STRUCTURE_FINGERPRINT_CHANGED") throw new Error("Expected structure break.");
});

Deno.test("direction changes start a new episode", () => {
  const next = { ...base, candidateId: "801", side: "BUY" as const, createdAt: base.createdAt + 60_000 };
  if (classifySetupEpisode(base, next).reason !== "DIRECTION_CHANGED") throw new Error("Expected direction break.");
});

Deno.test("large normalized entry drift starts a new episode", () => {
  const next = { ...base, candidateId: "802", createdAt: base.createdAt + 60_000, entry: base.entry + 400 };
  if (classifySetupEpisode(base, next).reason !== "ENTRY_DRIFT_TOO_LARGE") throw new Error("Expected entry drift break.");
});

Deno.test("invalidated setup cannot be refreshed", () => {
  const next = { ...base, candidateId: "803", createdAt: base.createdAt + 60_000, invalidated: true };
  if (classifySetupEpisode(base, next).reason !== "SETUP_INVALIDATED") throw new Error("Expected invalidation.");
});

Deno.test("material regime change starts a new episode", () => {
  const next = { ...base, candidateId: "804", createdAt: base.createdAt + 60_000, materialRegimeChange: true };
  if (classifySetupEpisode(base, next).reason !== "MATERIAL_REGIME_CHANGE") throw new Error("Expected regime break.");
});

Deno.test("stale or non-monotonic candidate starts a new episode", () => {
  const next = { ...base, candidateId: "805", createdAt: base.createdAt + 31 * 60_000 };
  if (classifySetupEpisode(base, next).reason !== "OUTSIDE_CONTINUITY_WINDOW") throw new Error("Expected continuity expiry.");
});
