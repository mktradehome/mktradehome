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
## Deployment and post-deploy verification — 2026-11-24 22:12 UTC
- PR #10 was merged after the classifier, fill-parser and main engine/approval workflows passed. Merge commit: `e2e721dae5f9a56a5f986fa8cade313f73957c7a`.
- Applied the additive migration to the connected Supabase project. All 23 existing Demo journal rows now have requested entry, broker-confirmed entry and opening ticket populated (23/23); all 23 legacy `entry_price` values remain equal to the original requested/approved prices. The historical recorded P/L remains +$11.74.
- Deployed `mt5-bridge` version 33 (ACTIVE). The updated source is saved at `supabase/functions/mt5-bridge/index.ts` in main. The bridge retains the same account binding, secret check, execution gate, claim/report behavior and Real-account read-only dashboard behavior; only the close-report journal fields were extended.
- Post-deploy logs show the MT5 EA health, peek and POST bridge requests returning HTTP 200 on version 33. Dashboard snapshot and queue reads also returned HTTP 200.
- Latest Demo snapshot at 22:11:40 UTC: balance/equity $513.70, zero open positions, complete positions snapshot, zero live approved queue items.
- No trade was opened, closed, approved or executed by this work. No strategy thresholds, candidate logic, lot limits or account locks were changed.
- The first future Demo close report is still the live integration check for newly generated rows. Existing historical backfill and post-deploy health checks passed; do not claim a new closed-trade round-trip until a new manually approved Demo trade is completed.
- Supabase security/performance advisors returned several existing project-wide notices (RLS tables without policies, public extension, auth password protection, existing policy/performance warnings). None was caused by the three nullable journal columns; unrelated findings were not modified.
