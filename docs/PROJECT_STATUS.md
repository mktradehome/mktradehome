# Mktradehome — Current Project Status

Last verified: 2026-11-19 03:15 UTC

## Project and safety
- Private personal Exness trading assistant; dashboard: https://mktradehome.pages.dev/
- Markets: BTCUSD, EURUSD, XAUUSD, USDJPY.
- Demo-first. User manually approves trades; approval does not itself place an order.
- Automatic trade execution is not enabled by this project work.
- Real account remains read-only and locked from approvals.
- Preserve 0.01-lot starting size, live-price checks, required SL/TP, duplicate prevention and expiry. Never weaken safeguards just to increase signal count.

## Verified deployed services
- `market-monitor` v62 — ACTIVE production signal engine. Scheduled requests in recent logs returned HTTP 200; recent executions were approximately 2.4–3.3 seconds.
- `market-monitor-v100-shadow` v4 — ACTIVE, isolated read-only strategy shadow. No production writes, alerts, approvals, queue items or trade execution.
- `market-monitor-v100-backtest-shadow` v5 — ACTIVE, authenticated historical replay; isolated from production trading state.
- `create-mt5-approval` v21 — ACTIVE. Server-side validation now uses the exact independent engine scoring and multi-timeframe rules, including valid 15M pullback reversals and 5M veto logic.
- `mt5-bridge` v30 — ACTIVE. Dashboard queue and account-snapshot reads return HTTP 200 in recent logs.

## Signal rules
- 1H sets direction and must score at least +12 for BUY or -12 for SELL.
- 4H must not strongly oppose the 1H direction (opposition score no worse than -30).
- 15M structure must align, or a qualifying pullback reversal must reclaim the trend-side EMA50 with 5M momentum back in the 1H direction.
- 5M is an entry veto only when strongly opposed (opposition score below -40).
- Entry must remain within 0.75 of 15M ATR from the reference close.
- Risk distance is max(1.5 × 15M ATR, 2 × 5M ATR, 2.5 × spread); TP1 = 2R and TP2 = 3R.
- Quotes must be fresh (30 seconds or less) and the market must be open.
- Quality score is a rule-quality heuristic, not win probability.

## V100 validation
- V100 is currently a shadow copy/baseline of the V62 strategy, not yet a proven improved strategy.
- The separate shadow backtest uses completed candles, waits until the 15M signal candle closes, and enters at the next 15M candle open to reduce look-ahead bias.
- It uses the same V100 candidate builder and validation helpers. The single full-position exit is TP1 at 2R, matching the current MT5 queue's single take-profit field; TP2 is reference-only.
- Backtest results are gross simulations. Historical spread, commission, swap, slippage, market closures and broker fills are not fully modelled. Do not treat gross results as expected live performance.
- Do not promote V100 to production until code tests, runtime tests, fair out-of-sample backtests and explicit approval are complete.

## Approval verification repair
- The earlier server validator incorrectly required all timeframe categorical labels to agree. That contradicted the live engine, which uses score-based rules and allows a defined 15M pullback reversal and 5M WAIT.
- v21 now recomputes the exact score from saved indicator evidence and validates 1H direction, 4H conflict limit, 15M structure/pullback, 5M veto, entry extension, ATR/spread risk geometry and heuristic quality score.
- Pure validation logic is isolated in `supabase/functions/_shared/approval-proof.ts` with deterministic tests in `approval-proof.test.ts`.
- Approval still rechecks a fresh independent live quote and entry deviation server-side. No automatic order execution was added.

## MT5 connection status
- The latest Demo account snapshot is `2026-11-18 01:06:45 UTC`; it is stale and must not be treated as a live account heartbeat.
- The dashboard's authenticated queue/snapshot polling works (HTTP 200), but polling the dashboard is not evidence that the MT5 EA is connected.
- The EA source is not present in this GitHub repository. True live individual-position tracking still requires the MT5 EA to report open positions to the authenticated bridge. Do not fake live prices or position status.
- Latest known queue counts: 10 executed, 7 expired, 12 failed; 10 closed trade journal records. These are historical records, not current open positions.

## Repository and CI
- `supabase/functions/market-monitor/index.ts` is synchronized with the deployed V62 production source; do not accidentally deploy the older pre-V62 helper implementation.
- GitHub Actions now runs type-checks for production and shadow Edge Functions plus deterministic approval-proof tests on pushes and pull requests to main.
- Legacy shared-engine tests are retained and explicitly labelled legacy; they are not proof of production V62 parity.

## Remaining work
1. Confirm CI passes for the synced production and approval sources.
2. Run the authenticated V100 shadow backtest from the dashboard and inspect all four markets.
3. Obtain a fresh Demo MT5 EA heartbeat; then test one manual Demo approval and the complete execution/reporting cycle.
4. Locate or add the MT5 EA's individual open-position reporting path before claiming MT5-like live trade overlays are fully live.
5. Compare V62 and V100 on identical completed-candle data and out-of-sample periods before any production promotion.
