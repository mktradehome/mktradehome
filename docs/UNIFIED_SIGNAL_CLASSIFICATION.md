# Mktradehome Unified Signal Classification

## Product requirement
Mktradehome has one signal-search and validation process. Every candidate that passes the full existing safety and independent verification rules is labelled in one of two ways:

- **GOOD AND CLEAR SIGNAL** — a particularly clear, high-confluence setup with stronger agreement across the relevant timeframes and market structure.
- **NORMAL SIGNAL** — a valid, worthwhile setup that passes the same mandatory safety and entry checks but has less exceptional confluence or a more modest opportunity profile.

These are classifications within one engine, not two separate engines, accounts, dashboards, or approval workflows.

## Non-negotiable meaning of NORMAL
NORMAL does not mean lower accuracy, weak confirmation, speculative entry, or relaxed risk. It must pass the same hard gates as GOOD AND CLEAR:

- Valid BUY/SELL direction and setup structure.
- Fresh quote and confirmed open market.
- Completed, fresh candle evidence across the required timeframes.
- Valid entry location; no chasing an extended price.
- Correct stop-loss side and valid risk distance.
- Existing minimum TP1 2R / TP2 3R geometry unless a separately tested and explicitly approved policy changes it.
- Independent proof validation, duplicate suppression, expiry and manual approval.
- Demo-first; no automatic execution enabled by this classification work.

If a candidate fails any hard gate, it remains WAIT and receives no signal label.

## Classification principles
1. Classify only after the candidate has passed the common hard validation path.
2. GOOD AND CLEAR requires stronger, explicitly defined multi-timeframe confluence and clearer structure.
3. NORMAL is the remaining subset of candidates that pass every mandatory rule but do not meet the higher confluence threshold.
4. Do not use the current qualityScore as a win probability or accuracy percentage. It is a rule-quality heuristic only. Do not set classification boundaries from arbitrary score cutoffs without validating them.
5. Both labels appear in the same dashboard signal list and the same manual approval process. Each signal retains its own entry, SL, TP1, TP2, expiry and proof.
6. Do not force a minimum signal count. If neither class has a valid setup, WAIT is correct.

## Validation before production
- Implement the classifier as a pure, deterministic helper with unit tests; it must not alter candidate generation or safety validation.
- Replay both classes separately on completed candles with next-bar entry assumptions and realistic spread, commission, swap and slippage sensitivity.
- Use walk-forward / out-of-sample periods and report sample count, expectancy in R, win/loss distribution, drawdown, consecutive losses, and setup frequency for each class.
- Check that NORMAL is genuinely worthwhile and not merely more frequent. Check GOOD AND CLEAR retains its stronger confluence profile.
- If data coverage or realistic cost evidence is insufficient, keep the classifier in shadow mode and state the limitation.
- Only after successful tests, integrate the two labels into the existing signal display and approval flow. Do not add an independent execution route.

## Current protection boundary
Production market-monitor v67 remains unchanged during research. Manual approval remains required. Demo execution remains OFF. Real execution remains hard locked. No threshold, lot size, stop/target geometry, freshness/session rule, database schema, queue or MT5 behavior may be weakened to generate more signals.
