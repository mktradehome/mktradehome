# Mktradehome — Current Project Status

Last verified: 2026-11-19 04:02 UTC

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
- `market-foresight` v3 — ACTIVE, authenticated baseline forecasting and historical candle archiving; no trade approvals, queue writes or execution.
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


## Chart overlay integrity correction (2026-11-19 03:35 UTC)
- Reviewed the live chart overlay against the actual `mt5-bridge` v30 API and database schema. The bridge currently exposes the execution queue, not a broker-confirmed open-position snapshot.
- Corrected `index.html` so the chart overlay now displays only `approved` and `executing` queue entries as pending setup references. It no longer treats `executed` queue history as proof that a position is currently open.
- Updated the card title and status labels to make clear that an approved setup is not yet open, and execution-in-progress is not confirmed open. Market-price movement is explicitly not represented as broker floating P/L.
- The actual live position feed remains unimplemented until the MT5 EA can send authenticated complete position snapshots and the bridge/database/dashboard path is deployed and tested.
- Frontend change commit: `3b9e0384046e47dc8999ee1a6f34d8ee6801fd9f`.


## Market Foresight Engine direction (2026-11-19)
- Captured the user's ambition to make Mktradehome deeply analyse markets and estimate future price paths/outcomes.
- Created `docs/MARKET_FORESIGHT_ENGINE.md` as the governing research/build contract: timestamped observation, market-regime context, calibrated probabilistic scenarios, cost-aware decisioning, walk-forward evaluation and Demo-first governance.
- Explicitly distinguishes forecasting from certainty: Mktradehome cannot control/manipulate external markets or guarantee future prices/profits. It must abstain when evidence/data quality is inadequate.
- V100 remains a read-only V62-strategy shadow, not a validated predictive AI model. No production strategy, risk gate, approval or execution path was changed in this work.
- Current rolling candle history is inadequate for robust long-horizon training; a verified historical archive and forecast/outcome dataset are prerequisites.
- Saved specification commit: `2f4041d8cbdace5dcfcf8859179e170e5c8c6ba4`.


## Market Foresight implementation (2026-11-19 03:51 UTC)
- Deployed Supabase Edge Function `market-foresight` v6 ACTIVE. It authenticates the signed-in dashboard user through Supabase Auth (or accepts the existing monitor secret server-to-server); the service credential stays server-side.
- Created four RLS-protected tables: `market_candle_archive`, `market_quote_archive`, `market_foresight_forecasts` and `market_foresight_outcomes`. Direct `anon` and `authenticated` table privileges are revoked; the Edge Function's service role is the only intended writer/reader.
- The function retrieves completed BiQuote OHLC for BTCUSD, EURUSD, XAUUSD and USDJPY on 5M/15M/1H/4H, validates timestamp freshness, OHLC geometry and cadence, then deduplicates archive rows by symbol/timeframe/candle timestamp. It also archives provider bid/ask, spread, quote age, market state and timestamp provenance for cost-aware research.
- Baseline v0.1 produces explicit 15M/1H/4H expected-price scenarios and approximately 90% normal-assumption price intervals using recent 5M log-return drift and volatility. Directional bias is qualitative. Numeric UP/DOWN/SIDEWAYS probabilities are null and marked NOT CALIBRATED; this is not an ML model or proven predictive edge.
- Each scan saves forecast records. Later scans evaluate matured forecasts against archived completed 5M candles and save realized return, high/low, absolute expected-price error and interval coverage. No outcome is invented if the required candle evidence is missing.
- Added a Market Foresight dashboard card. It runs on sign-in and refreshes every five minutes while the dashboard is open, with a manual Run Foresight Scan button. It displays reference price, directional scenario, expected price and range for each horizon.
- The feature is shadow-only. It does not modify V63 signal logic, approval rules, MT5 queue, risk controls or execution. No automatic orders were enabled.
- Security advisor reports the new RLS-protected tables have no user policies; this is intentional because direct user access is revoked and only server-side service access is intended. Other pre-existing project advisories remain.
- Live runtime invocation has not yet been confirmed from this tool session; the first dashboard scan is the next end-to-end acceptance check. Do not call the archive populated or forecasts live until the function has successfully run and database rows are verified.
- Supabase deployed function v5; GitHub source synced. Latest function source commit: `2fbb4a129630c78ac685e1fe9abe6b62a527834e`; applied quote archive schema documented in `docs/sql/market_foresight_foundation.sql`. Frontend commit: `2bca68c457ddacc765d816d1c8bac15545722e17`; function source commit: `cbb60c6d8230be912ed3ae6ca4f6f5bb7ba6fc8b`; CI workflow commit: `a6b9b87399a05f7690f813a50fbd04e21b6ec0e5`.

- Added `market_quote_archive` as a separate migration and deployed function v5; the quote archive is designed to preserve bid/ask and spread evidence rather than assuming zero spread in future evaluation.


## Market Foresight CORS repair (2026-11-19 04:02 UTC)
- User reported dashboard error: "Failed to send a request to the Edge Function."
- Supabase function logs showed successful OPTIONS preflight requests but no corresponding POST requests. This isolates the failure to browser preflight negotiation before the function handler runs.
- Root cause: `Access-Control-Allow-Headers` omitted Supabase client's `x-client-info` and `x-supabase-api-version` request headers.
- Added the full Supabase client header allowlist: authorization, x-client-info, apikey, content-type, x-monitor-secret and x-supabase-api-version.
- Deployed `market-foresight` v6 ACTIVE and synced source to GitHub. Commit: `cd5aef32417338996c84ea8af0c344be41ab567e`.
- This repairs the identified preflight blocker. A subsequent authenticated POST and first successful data archive still need to be confirmed from runtime logs and database row counts.


## Market Foresight first successful live scan (2026-11-19 03:57 UTC)
- The user confirmed the dashboard now reports LIVE with 12 forecasts saved and 3,120 candle observations archived. This confirms the browser CORS repair allowed the authenticated scan to complete.
- Independently queried Supabase: `market_candle_archive` contains 3,120 rows (latest capture 03:55:56 UTC); `market_quote_archive` contains 8 rows (latest observation 03:57:34 UTC); `market_foresight_forecasts` contains 24 rows (latest generated 03:57:35 UTC); `market_foresight_outcomes` contains 0 rows.
- All 24 forecast rows are PENDING: 8 each for 15M, 1H and 4H, generated across two scans between 03:55:54 and 03:57:34 UTC. Therefore zero matured outcomes is expected at this early stage; the first 15M forecasts need at least 15 minutes and later scans before evaluation can occur. 1H and 4H require their full horizons.
- Dashboard's “12 forecasts saved” represents the latest scan's 4 markets × 3 horizons; the database's 24 rows include both successful scans. No discrepancy in the pipeline.
- Current forecast directions and ranges are uncalibrated statistical scenarios only. Do not treat them as win probabilities, trade instructions or evidence of predictive edge. Keep the foresight engine isolated from approvals, queue and execution.
- The CORS blocker is resolved and the first live archive/forecast write is verified. Next acceptance test: allow forecasts to mature, run another scan, and verify outcome rows are written only where completed 5M candle evidence exists. Latest observed database totals are a point-in-time snapshot, not a permanent count.


## Read-only cross-engine integration (2026-11-19 04:08 UTC)
- Added a Unified Market Context panel to the dashboard. It combines the latest successful Market Foresight scan response with the existing saved `market_analysis_snapshots` produced by the V63 technical intelligence pipeline.
- For BTCUSD, EURUSD, XAUUSD and USDJPY, the panel displays technical intelligence bias/regime and 4H/1H/15M/5M context beside the 15M/1H/4H foresight directions. It labels horizon relationships as aligned, diverging, mixed or without clear agreement.
- This is deliberately a display-only comparison. It does not calculate a new BUY/SELL signal, alter V63 scoring, modify signal proofs, change approval eligibility, update risk limits, write to trade tables, or interact with the MT5 queue.
- Foresight remains an uncalibrated recent-drift/volatility baseline. Alignment is not a probability, confirmation of predictive edge, or trade instruction. Missing or abstained engine data is shown as unavailable rather than inferred.
- The panel retains the latest successful foresight response in dashboard memory and refreshes its comparison when either engine refreshes. No new database tables, policies, secrets or Edge Function deployments were required.
- Frontend commit: `6c7d74665e1b554f46fc4a9da91832b57d6e053a`.
- GitHub Actions run `44456169281` (engine/approval tests) and Pages deployment run `44456168803` were triggered by this commit; both were queued/in progress at the time of this status update. Do not call the change deployed or tests passed until both runs complete successfully.
- Next safe step: verify CI and Pages deployment, then visually inspect the Unified Market Context panel on the live dashboard. Keep production engine V63 unchanged while collecting forecast outcomes.


## Opportunity Intelligence implementation (2026-11-19)
- Added a read-only Opportunity Intelligence dashboard panel. It lists a market as a current opportunity only when the existing V63 analysis already contains a BUY/SELL candidate with engine verification PASSED, a candidate ID, fresh quote flag, valid entry/SL/TP values and passing 2R/3R geometry.
- The panel never generates a signal, changes V63 rules, upgrades a WAIT, changes approval eligibility, or writes to approvals, queue or trade tables. Manual approval remains separate.
- Market Foresight is used only as supporting context. The panel compares fresh 15M and 1H directional scenarios with the already-verified V63 direction and labels alignment, divergence, mixed/sideways, or unavailable/stale context. Forecasts remain uncalibrated and cannot create or invalidate a technical candidate.
- If no current candidate passes the existing checks, the panel explicitly displays WAIT rather than manufacturing an opportunity.
- Frontend commit: `34896e93267d966197cd51c1fea3f1890deb4318`.
- Previous GitHub Pages deployment run `44456204007` completed successfully, including Jekyll build, artifact upload and deploy. This confirms the preceding Unified Market Context commit was deployed through GitHub Pages; it does not independently verify Cloudflare Pages at `mktradehome.pages.dev`.
- The Opportunity Intelligence commit has just been saved. Its engine/approval CI and Pages deployment runs must be checked before calling this new panel tested or live.


## Forecast outcome integrity and performance scorecard (2026-11-19)
- Database inspection before this correction showed 48 forecasts pending and 0 saved outcomes. The old evaluator used the latest live quote as the realized price after a forecast matured. That was not a valid horizon-specific measurement and could distort forecast evaluation.
- Replaced that method with a read-only-tested resolver that uses the first completed archived 5M candle whose close reaches or passes the forecast's expiry. It derives realized horizon return, high/low over the forecast window, absolute price error and interval coverage from archived candle evidence. It never substitutes a later live quote.
- If the horizon-end candle is missing, malformed or not yet mature, the forecast remains PENDING; the engine abstains instead of inventing an outcome. The horizon endpoint is rounded to the first completed 5M candle close at/after expiry.
- Outcome inserts now map only to columns confirmed in the existing `market_foresight_outcomes` schema; no database schema, RLS policy or grants were changed.
- Added a server-side, service-key-only summary using the latest 2,000 saved outcomes joined to their forecast records. Dashboard scorecard reports overall and 15M/1H/4H: evaluated sample count, directional accuracy where both expected and realized return are non-zero, mean absolute return error in percentage points, and point-horizon interval coverage. It explicitly labels small samples as early/descriptive and never represents these metrics as calibrated probabilities.
- Added deterministic tests for exact horizon-close selection, early/missing/invalid evidence abstention, floating-point-safe outcome calculations, performance metrics, orphan rows and empty samples.
- CI run `44456923751` passed: production/shadow Edge Function type-check, dashboard inline JavaScript syntax, new forecast performance tests, new horizon resolver tests, independent approval proof tests and legacy fixtures.
- Deployed `market-foresight` version **7 ACTIVE**. Deployment hash: `76533e09cc7e7e456043e7ee63ce490167103fd31e6163046beee704748e684c`. Deployed imports were verified in the active function source.
- GitHub source commits: resolver `1bd2336e155d3978693f419b2f3251842cb4cb94`, outcome schema mapping `aeb6d292f208853a9f4a9ba23eaa8d35b363c99c`, performance summary `e94bf835db83637f03607e1b8e7e3b2728dcdb51`, dashboard scorecard `490c42bf8593174a69757b6b8c1a6964f2638d04`, final duplicate-import correction `d220545664d093dee22fe609666f8eb345c33966`.
- Latest GitHub Pages deployment for the dashboard scorecard (run `44456923712`) was still building when this status note was written. Cloudflare Pages at `mktradehome.pages.dev` has not been independently verified.
- Next validation: run the deployed foresight scan and confirm it writes outcomes only when horizon-close candles exist; then verify the scorecard reads the persisted outcomes. Do not claim forecast accuracy or a profitable trading edge until a meaningful sample has accumulated and been independently reviewed.


### Final validation and deployment update
- Added bounded batching for historical forecast-to-outcome joins (250 forecast IDs per PostgREST request) so the scorecard does not build an oversized URL as its sample grows.
- Clarified in the dashboard that repeated rolling forecasts overlap and are correlated; their outcomes are not independent samples.
- Deployed `market-foresight` **version 8 ACTIVE** with the batching improvement. Deployment hash: `40e779027cee89c607dabf3e95c52edb6e8c690e8ec135607ef1d687a0f2093c`.
- Latest engine/approval CI run `44457074308` passed all checks, including the two new foresight test suites, approval proof tests and existing fixtures.
- Latest GitHub Pages build/deployment run `44457074075` was still building when this update was written. The site at Cloudflare Pages `mktradehome.pages.dev` remains unverified from this environment.
- Runtime validation is still pending: no post-deployment `market-foresight` invocation appeared in the checked Edge Function log window. The first dashboard scan after opening the updated dashboard should exercise version 8 and populate the scorecard when completed horizon-close candles are available.


## Market-specific measured forecast context (2026-11-19)
- Extended the existing read-only forecast performance summary with per-market, per-horizon metrics in addition to the existing overall and horizon summaries. Metrics are matched through persisted forecast IDs and retain the existing 2,000-outcome sample cap.
- Opportunity Intelligence now displays measured 15M and 1H forecast history for the same market beside an already verified V63 candidate. It reports no measurement when no outcomes exist; below 30 outcomes it explicitly labels the evidence EARLY SAMPLE and does not use it to rank, approve or validate the setup. At 30 or more outcomes it shows descriptive directional accuracy, mean absolute return error and interval coverage, with an explicit warning that these are not win probabilities.
- This is supporting historical context only. V63 remains the sole source of trade eligibility; Market Foresight cannot create, remove, rank or approve a candidate. No production signal rules, approval logic, queue, execution, database schema, RLS or grants were changed.
- Added deterministic assertions for per-market/per-horizon grouping. Dashboard refreshes the Opportunity Intelligence panel after each successful foresight scan so it cannot silently show stale scorecard context as current.
- Supabase breaking-change review: the November 2026 changelog entries reviewed do not affect this change; no Supabase SDK, Data API, auth, schema or deployment configuration was modified.
- CI run `44457697371` completed successfully: production/shadow Edge Function type-check, dashboard inline JavaScript syntax, forecast performance tests (including per-market grouping), horizon outcome tests, independent approval proof tests and legacy fixtures all passed.
- Deployed `market-foresight` **version 9 ACTIVE** with the per-market/per-horizon performance payload. Deployment hash: `f4603fccbc11e2b624c376d8d8f01a2c4e8b8ab64add1a15b02410d18497522e`. Active function source was re-read and confirms the shared performance helper is included. No database schema, RLS or grants changed.
- GitHub Pages build/deployment run `44457697432` was still in progress at the time of this status update. Cloudflare Pages deployment and post-v9 runtime scorecard population remain unverified; do not claim the live Cloudflare dashboard has this update until independently checked.


## Vision 2.0 research plan (2026-11-21)
- Created `docs/MKTRADEHOME_VISION_2.0_PLAN.md` on isolated branch `vision-2.0-research-plan`.
- Reviewed Pocket Option's public descriptions of its charting/signals, trade history and session-based AI Trader. Adapted product ideas only: bounded scan sessions, transparent ranking of already-eligible candidates, richer market context, event/session awareness, explainable summaries and verified trade journaling.
- Explicitly excluded fixed-expiry trading, social-copy instructions, unverified AI accuracy claims, unofficial account APIs, and any bypass of manual approval.
- Phase 0 is broker-truth first: obtain and back up the exact EA source; implement complete Demo position snapshots and idempotent close-report recovery; verify one full Demo lifecycle.
- No production code, database schema, V63 rules, approval logic, risk controls, MT5 execution behavior, or deployed services were changed. This is a documentation-only research plan on an isolated branch; it is not deployed.
- Reference review: Pocket Option official platform materials and ESMA's AI-investing caution. Vendor feature descriptions are not independent proof of profitability.

- Dashboard information architecture expanded per user request: separate Overview, My Account, Watch Charts, Market Scanner, Approval Centre, Open Trades, Trade History, Performance, Alerts & Activity, and Settings. Desktop left sidebar; mobile bottom navigation plus More menu. Keep this design isolated until implementation and route tests pass.


## Vision 2.0 dashboard shell implementation (2026-11-21)
- Added `vision2-dashboard.js` and linked it from `index.html` on the isolated `vision-2.0-research-plan` branch.
- Reorganizes existing dashboard cards into separate Overview, My Account, Watch Charts, Market Scanner, Approval Centre, Open Trades, Trade History, Performance, Alerts & Activity, Settings and My Journey sections.
- Desktop uses a persistent left navigation rail; mobile uses a compact bottom navigation with a More panel. Existing cards and DOM elements are moved intact so their existing event handlers and IDs remain available.
- Added an explicit Open Trades status explaining that individual live positions are not yet available until a complete authenticated MT5 EA snapshot feed is implemented. No simulated positions or floating P/L are shown.
- This is a presentation/navigation change only. No production signal engine, V63 eligibility rules, V100 shadow, approval flow, risk limits, Supabase schema/functions, MT5 execution or account permissions were changed.
- Static JavaScript parse check for the new navigation file passed in the authoring environment. Full browser interaction, mobile layout, chart resize, auth/PIN, approval actions, and Cloudflare Pages preview still require end-to-end testing. No deployment or merge to main has been performed.
- Implementation commits: `63f3d06633ed694d4de1720ecb1dc2774c42aabb` (navigation module), `24bd5bfb186122c1ed6e1382dd8436b6662b38ae` (HTML integration).

- Follow-up layout review corrected the legacy collapsible-tools container: account monitoring now routes to My Account, historical replay to Performance, and secondary analysis cards to Market Scanner rather than being stranded under Settings. Navigation module syntax rechecked successfully. Follow-up commit: `60ecdd88611728eb97066e14f35ca5bc49929f91`.
- CI workflow now includes `node --check vision2-dashboard.js` (commit `631a5bafe0ada4879b740382f3228914445a333f`); this workflow has not yet executed for the isolated branch.
