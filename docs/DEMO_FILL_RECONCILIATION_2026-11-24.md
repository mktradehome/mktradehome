# Demo broker-fill reconciliation improvement — 2026-11-24

## Purpose
Preserve the requested/approved entry separately from the actual broker-confirmed fill so future Demo performance calculations use the correct execution basis. Existing legacy `trades.entry_price` is deliberately retained unchanged.

## Implemented on isolated branch
- Added `supabase/functions/_shared/execution-fill.ts`, a strict parser that accepts only the known MT5 market-order confirmation prefix, a positive finite `price=` value, and success retcode 10009.
- Added deterministic tests for EURUSD and BTCUSD fills, missing price, failed retcode, malformed/non-positive/non-finite values, untrusted messages and oversized messages.
- Updated the isolated `mt5-bridge` source copy so the close-report path reads the matched executed queue row's `execution_message` and persists:
  - `entry_price`: legacy approved/requested price, unchanged for compatibility.
  - `requested_entry_price`: explicit requested/approved price.
  - `broker_entry_price`: parsed broker-confirmed fill, or NULL if a valid confirmation cannot be parsed.
  - `mt5_opening_deal_ticket`: opening MT5 ticket from the matched queue row.
- Added an additive SQL migration to add those three nullable columns and backfill existing journal rows from successful queue confirmation messages. The migration does not rewrite `entry_price`, P/L, trade dates, stops, targets or account fields.
- Added a dedicated GitHub Actions workflow to type-check and test the parser.

## Read-only preflight against existing Demo records
- All 23 executed Demo queue rows matched the strict SQL confirmation format (retcode 10009 and positive decimal price).
- The read-only parser preflight found 23/23 parseable fills.
- No schema migration was applied and no Edge Function was deployed as part of this isolated code preparation.
- No trades, queue items, account settings, risk limits, signals or historical journal values were modified.

## Safety / rollout gate
This branch is not production. Before rollout:
1. Wait for dedicated CI to pass.
2. Review the exact migration and bridge diff.
3. Apply the additive migration first, then deploy the updated bridge source.
4. Verify the bridge health/read-only dashboard paths and test a future manually approved Demo trade's close report.
5. Confirm the new fields are populated correctly while legacy `entry_price` and P/L remain intact.
6. Keep the 0.01 lot cap, manual approval, Demo-only execution and Real-account read-only lock.

This change improves entry-fill measurement only. It does not change signal generation, approval proof, risk sizing, order placement, exit logic or strategy thresholds. It does not yet create a direct signal-to-trade foreign-key link; that remains a separate follow-up.
