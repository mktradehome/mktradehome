# Mktradehome Intelligence Improvements — Evidence-Led Research

Status: research-only. No production signal, risk, approval, execution, or Real-account behavior is changed.

## Why this work matters

Recent investigations exposed three recurring intelligence problems that can be improved without loosening entry rules:

1. **Repeated alerts are not necessarily new opportunities.** BTCUSD SELL candidates #799, #800 and #801 arrived ten minutes apart with the same direction, same GOOD_AND_CLEAR label and same 85 rule score. Their entries moved from 59,214.35 to 59,331.73 to 59,307.33 while the broader bearish structure remained aligned. This is one continuing setup being refreshed, not three independent trades. Counting each alert as a separate win/loss would distort performance and overstate opportunity frequency.
2. **A rule score is not a probability.** The score 85 describes agreement with the current rule set. It does not mean an 85% chance of winning. Mktradehome needs outcome-calibrated statistics before showing win probabilities or confidence percentages.
3. **A snapshot is not trustworthy just because it contains an array.** The current MT5 bridge marks a position list complete whenever the positions field is an array. It does not compare the number serialized with the broker-reported open_positions count. An EA that silently skips one position could therefore create a false complete snapshot. The Home page previously dispatched position data before validating that the snapshot belonged to the selected account.

## Intelligence improvements to build in layers

### 1. Setup-episode intelligence (first research priority)

- Maintain a setup episode per symbol and direction, separate from individual refreshed candidate IDs.
- Link a candidate to an existing episode only when the evidence supports continuity: same symbol/direction, compatible multi-timeframe structure, no invalidation, no material regime shift, and price/entry movement remains within tested bounds.
- Preserve every candidate ID, timestamp, quote, entry, stop, target, score and evidence snapshot.
- Label alerts as NEW SETUP or REFRESHED SETUP; never silently count a refresh as another independent opportunity.
- Start a new episode after direction change, invalidation, material regime change, or a separately confirmed setup after the prior episode has ended.
- Do not merge separate positions or increase volume. Episode consolidation is one analytical proposal, not an execution instruction.

### 2. Consolidated proposal research

For each episode, compare latest valid entry against a volume-independent reference such as the median of eligible entries. Derive a common stop only from defensible technical invalidation evidence. Recompute TP1=2R and TP2=3R from the selected reference. Reject the proposal if it fails freshness, extension, stop geometry, reward/risk or any existing hard gate. If a common stop cannot be justified, return CANNOT CONSOLIDATE.

Measure duplicate alert reduction, entry drift, stop distance, invalidations, target reach, adverse excursion, missed fresh setups and costs where data exists. Compare on identical historical windows and then out-of-sample. Do not promote from a small sample.

### 3. Outcome-calibrated intelligence

- Keep the existing rule score explicitly separate from probability.
- Record each episode's eventual outcome using consistent exit assumptions and broker costs when available.
- Report sample size, coverage period, market, signal category, expectancy in R, win rate, profit factor, maximum drawdown, and uncertainty.
- Calibrate probabilities only after enough independent closed episodes; use walk-forward/out-of-sample evaluation and calibration checks.
- Show INSUFFICIENT EVIDENCE instead of inventing a confidence percentage.
- Avoid survivorship bias: include rejected setups in diagnostics and include all accepted episodes in outcome accounting.

### 4. Context-aware abstention

Build on the existing rejection diagnostics to explain why the engine waits: missing directional bias, strong higher-timeframe conflict, setup pending, entry conflict, invalid ATR, overextension, invalid risk geometry, stale quote, or closed market. Rank the dominant reasons by market and session. This helps identify whether the system is too restrictive or correctly avoiding poor conditions. Do not loosen gates simply to increase alert count.

### 5. Broker-truth position intelligence

- Use only broker-reported MT5 positions for open-trade state and floating P/L.
- A snapshot is complete only if every open position was enumerated, validated and serialized, and the serialized count equals the broker's open-position count.
- Keep account number/server, currency, capture time, age, completeness and stale/offline state attached to each snapshot.
- Sum floating P/L only for a complete, fresh snapshot. Show whether swap is included and whether commission is excluded/unavailable.
- Distinguish NO OPEN POSITIONS, INCOMPLETE SNAPSHOT, STALE, and OFFLINE.
- Use position ID as stable identity; do not assume order ticket is stable through netting/partial-close.
- Keep Home display view-only. No close/modify/approve/execute controls in this workstream.

## Safe improvement implemented on the research branch

Commit 56e829d changes the Home account refresh flow so it validates the selected account identity and required account values before dispatching position data. It marks the position list complete only when:
- the bridge explicitly marks it complete;
- the list is an array with no more than 100 entries; and
- the list length equals the broker-reported open-position count.

This is a fail-closed dashboard safeguard. It does not fix the bridge's server-side completeness declaration, does not create a position table, and has not been deployed. The bridge must still be hardened and tested independently before the feed can be trusted.

## Next engineering sequence

1. Add shared, deterministic tests for snapshot completeness and malformed/duplicate position records.
2. Harden the bridge to require an explicit broker-reported enumeration count and completion flag; reject inconsistent payloads instead of persisting them as complete.
3. Correct the EA position serializer so it never silently skips a position while claiming completion. Keep v2.21 as the unchanged recovery baseline; do not install v2.22 until exact MetaEditor diagnostics are resolved and a clean compile is verified.
4. Build a read-only Home positions view with account currency, broker P/L, swap disclosure, update age, and distinct incomplete/stale/offline states.
5. Build setup-episode tracking and consolidation as an isolated replay/shadow analysis. Compare against the current engine on identical data.
6. Require tests, out-of-sample results and Demo forward evidence before any production promotion.

## Safety invariants

- Demo-first and manual approval remain in force.
- Real account remains read-only and locked from execution.
- Existing entry gates, classification, risk limits and expiry are not weakened.
- No averaging, pyramiding, added volume or automatic order placement.
- No win-rate or profitability promises; all results must include sample size and data/cost limitations.
