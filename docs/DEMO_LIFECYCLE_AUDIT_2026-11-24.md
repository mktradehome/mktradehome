# Mktradehome Demo lifecycle audit — 2026-11-24

## Scope and safety
Read-only inspection of the connected Supabase project and GitHub test runs. No trades were approved, opened, closed, modified or executed. No Supabase rows, production functions, risk controls, account settings or deployment were changed.

## Automated verification
For branch `experiment/classifier-contract-2026-11-24`, commit `1de64dfe9565e8d595dd9d57012a199540ab9487`:
- GitHub Actions run `45493047858`, **Mktradehome classifier contract tests**: completed successfully. Deno type-check and classifier contract tests both passed.
- GitHub Actions run `45493047854`, **Mktradehome engine and approval tests**: completed successfully. Production/shadow type-checks, dashboard syntax checks, candidate geometry, shadow candidate, foresight, approval proof, executable-side price/risk and legacy fixture tests all passed.
- PR #9 remains isolated from production; no merge or deployment was performed.

## Current Demo snapshot
- Account server: `Exness-MT5Trial10`.
- Latest snapshot: 2026-11-24 21:45:10 UTC.
- Balance/equity: $513.70; margin: $0; free margin: $513.70.
- Open positions: 0; `positions_complete=true`.
- This is a timestamped snapshot, not a guarantee of account state after capture.

## Recorded Demo trade results
All 23 rows in `public.trades` belong to `Exness-MT5Trial10` and are closed:
- 12 wins, 11 losses.
- Recorded P/L total: +$11.74.
- BTCUSD: 11 trades, 5 wins / 6 losses, +$1.69.
- EURUSD: 9 trades, 5 wins / 4 losses, +$2.47.
- XAUUSD: 2 trades, 2 wins / 0 losses, +$8.71.
- USDJPY: 1 trade, 0 wins / 1 loss, -$1.13.

These are small-sample recorded Demo outcomes. The schema does not separately store commission and swap on `trades`, so this scorecard must not be described as independently verified net-of-all-costs performance. XAUUSD and USDJPY samples are far too small for market-level conclusions.

## Critical lifecycle reconciliation finding
Joined all 23 closed `trades` rows to `mt5_trade_queue` by broker position ID and extracted the broker fill from the queue's execution confirmation message.

- All 23 journal `entry_price` values equal the approved/requested queue `entry_price`, not the broker fill recorded in `execution_message`.
- All 23 broker-confirmed fills differ from the approved price.
- Average and maximum absolute price differences by market:
  - BTCUSD: average 11.17727273; maximum 30.36.
  - EURUSD: average 0.00007111; maximum 0.00021.
  - USDJPY: 0.0275 (one trade).
  - XAUUSD: average 0.3645; maximum 0.489 (two trades).
- The broker fill currently exists only inside free-text `execution_message`; there is no dedicated structured `fill_price` field in `mt5_trade_queue`.
- Neither `mt5_trade_queue` nor `trades` has a `signal_id` column. That prevents a direct database-level link from each signal to its approval/execution/closed outcome.
- `mt5_close_queue` currently has zero rows. The `trades` table stores exit_price and profit_loss, but the inspected schema has no dedicated close-deal ticket, close reason, commission or swap fields.

This is a material measurement defect: the recorded P/L rows may reflect broker-reported results, but entry-based R-multiples and signal-level performance cannot be trusted if the canonical entry is the requested price rather than the actual fill. Do not silently rewrite historical rows.

## Signal and queue activity
- `trade_signals`: 1,141 saved signal rows; latest at 2026-11-24 21:30:05 UTC.
- `mt5_trade_queue`: 45 rows: 23 executed, 8 expired, 14 failed.
- `trades`: 23 closed records, matching the 23 executed queue rows in the inspected dataset.
- The recent signal feed shows repeated same-direction candidates across scheduled scans. Raw signal-row count must not be treated as independent setups or opportunities.
- Current schema has no direct signal-to-queue foreign key, so exact deduplication and per-signal outcome attribution need an explicit immutable identifier in a future, separately tested design.

## Recommended next work — isolated only
1. Trace the MT5 bridge's execution report and journal-sync code to establish exactly where the broker fill is parsed, stored and later replaced by the approved price.
2. Design a backward-compatible, structured lifecycle record that preserves approved/requested entry, broker fill, broker close fill, costs, close reason, signal ID and position/ticket IDs separately. Do not alter historical rows.
3. Add deterministic tests using representative broker execution messages and position IDs, including malformed/missing fill values and duplicate reports.
4. Run a read-only reconciliation against all existing records and quantify what is known versus missing; do not infer missing costs or prices.
5. Add signal deduplication/churn analysis using immutable setup identity and time windows only after reviewing the existing candidate creation semantics. Do not suppress legitimate new opportunities or weaken signal rules.
6. Keep collecting manual-approval Demo outcomes. Do not increase lot size, enable automatic execution, change strategy thresholds, or unlock Real-account actions based on this sample.

## Verification boundary
The two GitHub workflows passed and the database reads above succeeded. This audit does not prove strategy profitability, calibrated signal quality, complete cost accounting, or future execution quality. Production and trading state were left untouched.
