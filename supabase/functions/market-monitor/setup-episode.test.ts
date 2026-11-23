import { classifySetupEpisode, type SetupCandidate } from "../_shared/setup-episode.ts";

const base: SetupCandidate = {
  candidateId: "799", symbol: "BTCUSD", side: "SELL",
  createdAt: 1795320000000, entry: 59214, atr: 500,
  structureKey: "4H:SELL|1H:SELL|15M:SELL",
};

const nextCandidate = (overrides: Partial<SetupCandidate> = {}): SetupCandidate => ({
  ...base,
  candidateId: "800",
  createdAt: base.createdAt + 10 * 60_000,
  ...overrides,
});

Deno.test("same setup refresh links when structure and price zone agree", () => {
  const result = classifySetupEpisode(base, nextCandidate({ entry: 59331 }));
  if (result.relation !== "REFRESHED_EPISODE") throw new Error(result.reason);
});

Deno.test("time proximity alone never links different structure", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt + 60_000,
    structureKey: "4H:BUY|1H:SELL|15M:SELL",
  }));
  if (result.reason !== "STRUCTURE_FINGERPRINT_CHANGED") throw new Error("Expected structure break.");
});

Deno.test("direction changes start a new episode", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    side: "BUY", createdAt: base.createdAt + 60_000,
  }));
  if (result.reason !== "DIRECTION_CHANGED") throw new Error("Expected direction break.");
});

Deno.test("large normalized entry drift starts a new episode", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt + 60_000, entry: base.entry + 400,
  }));
  if (result.reason !== "ENTRY_DRIFT_TOO_LARGE") throw new Error("Expected entry drift break.");
});

Deno.test("invalidated setup cannot be refreshed", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt + 60_000, invalidated: true,
  }));
  if (result.reason !== "SETUP_INVALIDATED") throw new Error("Expected invalidation.");
});

Deno.test("material regime change on either candidate starts a new episode", () => {
  const next = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt + 60_000, materialRegimeChange: true,
  }));
  const previous = classifySetupEpisode(
    { ...base, materialRegimeChange: true },
    nextCandidate({ createdAt: base.createdAt + 60_000 }),
  );
  if (next.reason !== "MATERIAL_REGIME_CHANGE" || previous.reason !== "MATERIAL_REGIME_CHANGE") {
    throw new Error("Expected regime break on either side.");
  }
});

Deno.test("stale candidate starts a new episode", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt + 31 * 60_000,
  }));
  if (result.reason !== "OUTSIDE_CONTINUITY_WINDOW") throw new Error("Expected continuity expiry.");
});

Deno.test("non-monotonic timestamps start a new episode", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    createdAt: base.createdAt,
  }));
  if (result.reason !== "OUTSIDE_CONTINUITY_WINDOW") throw new Error("Expected timestamp rejection.");
});

Deno.test("same candidate ID cannot be counted as a refresh", () => {
  const result = classifySetupEpisode(base, nextCandidate({
    candidateId: base.candidateId,
  }));
  if (result.reason !== "DUPLICATE_CANDIDATE_ID") throw new Error("Expected duplicate ID rejection.");
});

Deno.test("invalid candidate evidence starts a new episode", () => {
  const result = classifySetupEpisode(base, nextCandidate({ atr: 0 }));
  if (result.reason !== "INVALID_CANDIDATE_EVIDENCE") throw new Error("Expected invalid evidence rejection.");
});

Deno.test("invalid classifier thresholds fail closed", () => {
  const badGap = classifySetupEpisode(base, nextCandidate(), 0, 0.75);
  const badDrift = classifySetupEpisode(base, nextCandidate(), 30 * 60_000, -0.1);
  if (badGap.reason !== "INVALID_CLASSIFIER_CONFIG" || badDrift.reason !== "INVALID_CLASSIFIER_CONFIG") {
    throw new Error("Expected invalid configuration rejection.");
  }
});

Deno.test("exact continuity and entry-drift boundaries remain eligible", () => {
  const result = classifySetupEpisode(
    base,
    nextCandidate({
      createdAt: base.createdAt + 30 * 60_000,
      entry: base.entry + 375,
    }),
  );
  if (result.relation !== "REFRESHED_EPISODE") throw new Error(result.reason);
});
