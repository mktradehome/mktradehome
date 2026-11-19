# Mktradehome — Current Project Status

Last verified: 2026-11-19 03:31 UTC

## Project and safety
- Private personal Exness trading assistant; dashboard: https://mktradehome.pages.dev/
- Markets: BTCUSD, EURUSD, XAUUSD, USDJPY.
- Demo-first. User manually approves trades; approval does not itself place an order.
- Automatic trade execution is not enabled by this project work.
- Real account remains read-only and locked from approvals.
- Preserve 0.01-lot starting size, live-price checks, required SL/TP, duplicate prevention and expiry. Never weaken safeguards just to increase signal count.

## Verified deployed services
- `market-monitor` v63 — ACTIVE production signal engine. Scheduled requests in recent logs returned HTTP 200; recent executions were approximately 2.4–3.3 seconds.
- `market-monitor-v100-shadow` v5 — ACTIVE, isolated read-only strategy shadow. No production writes, alerts, approvals, queue items or trade execution.
- `market-monitor-v100-backtest-shadow` v11 — ACTIVE, authenticated historical replay; isolated from production trading state.
- `create-mt5-approval` v22 — ACTIVE. Its isolated proof validator also checks that the saved quote price is exactly the bid/ask midpoint. Server-side validation now uses the exact independent engine scoring and multi-timeframe rules, including valid 15M pullback reversals and 5M veto logic.
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
- The separate shadow backtest uses completed candles, waits until the 15M signal candle closes, and enters at the next 15M candle open to reduce look-ahead bias. It warms up all four timeframes before scoring and reports the actual common coverage, not just the requested date range.
- It uses the same V100 candidate builder and validation helpers. The single full-position exit is TP1 at 2R, matching the current MT5 queue's single take-profit field; TP2 is reference-only.
- Backtest results are gross simulations. BiQuote documents OHLC as rolling windows (up to 288 M5, 192 M15, 168 H1 and 180 H4 bars), not an unlimited archive. The common test window is therefore far shorter than 14 days; the dashboard reports actual overlapping coverage, warns when it is short, and excludes setups that have not closed by the end of the history window from win-rate/profit-factor metrics. Historical bid/ask spread is unavailable, so replay uses bid=ask and omits the live spread component from stop sizing. Commission, swap, slippage, market closures and broker fills are also not modelled. Do not treat gross results as expected live performance.
- Do not promote V100 to production until code tests, runtime tests, fair out-of-sample backtests and explicit approval are complete.

## Approval verification repair
- The earlier server validator incorrectly required all timeframe categorical labels to agree. That contradicted the live engine, which uses score-based rules and allows a defined 15M pullback reversal and 5M WAIT.
- v22 now recomputes the exact score from saved indicator evidence and validates 1H direction, 4H conflict limit, 15M structure/pullback, 5M veto, entry extension, ATR/spread risk geometry and heuristic quality score.
- Pure validation logic is isolated in `supabase/functions/_shared/approval-proof.ts` with deterministic tests for BUY and SELL setups, pullback reversals, 5M conflict rejection, tampered targets, stale candles and mismatched quote midpoints in `approval-proof.test.ts`.
- Added regression fixtures copied from two real persisted production candidates (XAUUSD SELL #437 and EURUSD SELL #438). These verify that the stored proof shape, midpoint quote, indicator evidence and exact ATR/2R/3R geometry pass the same server-side validator; both tests pass in CI.
- Approval still rechecks a fresh independent live quote and entry deviation server-side. No automatic order execution was added.

## Latest live scan and approval state (2026-11-19 03:25–03:26 UTC)
- Production `market-monitor` v63 completed a scan and saved EURUSD SELL candidate #438 at 03:25:03 UTC, with a 10-minute expiry (03:35:03 UTC). The dashboard successfully fetched saved `trade_signals` rows with HTTP 200 at 03:26:02 UTC.
- The same scan correctly returned WAIT for BTCUSD and XAUUSD because the current quote was more than 0.75 of 15M ATR from the reference close, and WAIT for USDJPY because the 15M entry rule was not met. These are deliberate rule outcomes, not a broken signal engine.
- The MT5 approval queue had zero rows in `approved` or `executing` state at the last database check. A signal being saved does not create an approval; the user must manually approve it while it is still fresh. No order is placed by the approval function.

## MT5 connection status
- The latest Demo account snapshot is `2026-11-18 01:06:45 UTC`; it is stale and must not be treated as a live account heartbeat.
- The dashboard's authenticated queue/snapshot polling works (HTTP 200), but polling the dashboard is not evidence that the MT5 EA is connected.
- The EA source is not present in this GitHub repository. True live individual-position tracking still requires the MT5 EA to report open positions to the authenticated bridge. Do not fake live prices or position status.
- Latest known queue counts: 10 executed, 7 expired, 12 failed; 10 closed trade journal records. These are historical records, not current open positions.

## Repository and CI
- `supabase/functions/market-monitor/index.ts` is synchronized with the deployed V62 production source; do not accidentally deploy the older pre-V62 helper implementation.
- GitHub Actions now runs type-checks for production and shadow Edge Functions, dashboard inline JavaScript syntax checks, deterministic approval-proof tests and legacy fixtures on pushes and pull requests to main. Latest run `44451470572` for commit `3ad950668fd2407f5aa810d0d89859f3ceb50f7b` completed successfully (2026-11-19).
- Legacy shared-engine tests are retained and explicitly labelled legacy; they are not proof of production V62 parity.

## Remaining work
1. Confirm CI passes for the synced production and approval sources.
2. Run the authenticated V100 shadow backtest from the dashboard and inspect all four markets.
3. Obtain a fresh Demo MT5 EA heartbeat; then test one manual Demo approval and the complete execution/reporting cycle.
4. Locate or add the MT5 EA's individual open-position reporting path before claiming MT5-like live trade overlays are fully live.
5. Compare V62 and V100 on identical completed-candle data and out-of-sample periods before any production promotion.


## MT5 live-position integration work (2026-11-19)
- Re-inspected the deployed `mt5-bridge` v30 source and current public-schema columns. The bridge supports authenticated dashboard queue reads, account-level snapshots, execution reports and verified close reports, but it does not yet accept or persist a list of currently open positions.
- Re-inspected the complete GitHub repository tree. No MQL5 EA source file (`.mq4` or `.mq5`) is present, so the client-side reporting code cannot safely be updated from this repository.
- Saved the proposed EA-to-bridge payload, validation rules, dashboard behavior and acceptance tests in `docs/MT5_POSITION_REPORTING.md`. This is a design contract only; it is not a deployed endpoint and must not be represented as a working live feed.
- Next implementation step: obtain the exact MktradehomeBridge EA source, then implement the authenticated Demo-only position snapshot endpoint, private persistence, dashboard read action and EA polling together. Keep Real mode read-only. Reject incomplete snapshots and never infer closures from partial data.
- No database schema, execution gate, approval rule or live trading behavior was changed in this session.
