# Mktradehome — Current Project Status

Last verified: 2026-11-21 16:24 UTC

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


## Vision 2.0 validation and review sessions (2026-11-21)
- Opened draft PR #3 against main for isolated validation: https://github.com/mktradehome/mktradehome/pull/3. It remains draft and unmerged; no deployment was triggered.
- GitHub Actions run `44906479529` completed successfully for the first navigation-shell revision: production/shadow Edge Function type-checks, existing inline dashboard JS syntax, new navigation JS syntax, Foresight metrics/outcome tests, independent approval-proof tests and legacy shared-engine fixtures all passed.
- Added a Focused Market Review panel to the Market Scanner workspace: four-market focus checklist, 15/30/60/120-minute local timer, resume-after-refresh and end-session controls. This is deliberately a personal review timer only; it does not alter the existing all-market background scan cadence, production V63 eligibility, approval flow or execution.
- Added CI syntax checking for both Vision 2.0 JavaScript modules. A new PR check is expected for the latest commit; it has not yet completed.
- Latest UI work commits: `f9b02ab2b39481953504a49903562112b2288cd3` (review-session module), `d48a9227555ba67cf4bbcd6d59eade57ff9ac8c6` (HTML integration). The first PR CI run tested the earlier navigation-only revision, not these newest additions.
- Full browser/mobile interaction testing remains outstanding. No merge, deployment, database migration, production strategy change, risk-rule change or MT5 execution change was performed.

- GitHub Actions run `44906595619` completed successfully for the revision containing both navigation and focused review-session modules; all 11 workflow steps passed, including both new JavaScript syntax checks and all existing strategy/approval tests.
- A subsequent code review caught that the legacy `advancedTools` wrapper also has class `card`, so its generic card branch could intercept it before its children were routed. Fixed the branch order to unwrap and route its child cards first, then remove the empty wrapper. Fix commit: `8f9cdfb47f621c7b92a7b7b0b73b3997e5bc6c1a`. This correction is newer than the successful CI run and needs its own CI result.

- GitHub Actions run `44906641766` completed successfully on navigation-routing fix commit `8f9cdfb47f621c7b92a7b7b0b73b3997e5bc6c1a`. All 11 workflow steps passed, including production/shadow Edge Function type-checks, both Vision 2.0 module syntax checks, Foresight tests, approval-proof tests and legacy engine fixtures.
- Draft PR #3 remains open, mergeable and unmerged. It contains the segmented dashboard shell and focused review-session UI. No production deployment has been triggered.
- Full browser-based testing is still outstanding; CI validates syntax and existing backend tests but does not simulate authenticated browser interactions or mobile layout.


## Vision 2.0 broker-truth hardening (2026-11-21)
- Strengthened `docs/MT5_POSITION_REPORTING.md` with complete-snapshot semantics, per-terminal monotonic sequence numbers, idempotent snapshot IDs, server-side Demo account binding, out-of-order rejection, and safe empty-snapshot reconciliation.
- Added a durable EA close-report outbox contract: persist until acknowledged, deterministic broker-deal idempotency, acknowledgement only after durable commit, restart-safe retries, and conflict surfacing.
- Expanded acceptance tests for replay, stale/out-of-order snapshots, duplicate close delivery, restart recovery and acknowledgement durability.
- This remains a design contract only. The exact MQL5 EA source is still absent from the repository, and the Supabase connector did not grant read access during this session. No Edge Function, database schema, RLS, V63 rule, approval gate, account permission or execution behavior was changed.
- Verified the Vision 2.0 draft PR #3 is still open, draft, unmerged and mergeable. GitHub Actions run `44906719666` for branch head `e37db174afd44149cc1bee6ff2d1ba7dc8144075` completed successfully.
- Cloudflare's PR bot reported a successful isolated branch-preview deployment for commit `e37db17`, with preview `https://vision-2-0-research-plan.mktradehome.pages.dev`. This is a branch preview, not a merge to `main`; do not treat it as production deployment or proof of browser acceptance.
- Next required input is the exact `MktradehomeBridge.mq5` source from the Lenovo laptop. Back it up unchanged before editing; then implement and test the EA/bridge contract together on this isolated branch.


## Vision 2.0 dashboard release (2026-11-21 13:29 UTC)
- Draft PR #3 was merged into main at merge commit 90900b3c0df43ab239c3aca5812e99b2f3cade32. The merge contains the segmented dashboard navigation and Focused Market Review UI.
- GitHub Actions run 44909068947 (engine and approval tests) completed successfully for the merge commit.
- GitHub Pages build/deployment run 44909068596 completed successfully for the merge commit. Cloudflare Pages production deployment at mktradehome.pages.dev has not been independently verified from the available deployment evidence; do not equate GitHub Pages success or the earlier Cloudflare preview success with Cloudflare production confirmation.
- User manually confirmed on the Cloudflare preview that mobile navigation sections and Watch Charts work. The user also inspected Market Scanner; displayed content includes a personal review timer, four markets, stale weekend FX/gold quotes, BTC fresh quote, WAIT decisions, and uncalibrated foresight scorecard. Market closure is expected for weekend FX/gold; stale quotes must remain blocked from approvals.
- Remaining production acceptance checks: sign-in/PIN, chart resize, approval actions, history/records, logout/session handling, and explicit confirmation that Cloudflare production serves this merge. Do not claim these are tested.
- No V63 rules, approvals, risk limits, Supabase schema/functions, MT5 execution, or account permissions were changed by this dashboard release.
- Highest-value next engineering milestone remains broker-truth: obtain the exact MktradehomeBridge.mq5 source from the user's Lenovo laptop, make an unchanged backup, then implement complete authenticated Demo position snapshots and durable idempotent close reporting across EA, bridge, storage and dashboard. Do not fabricate open positions or P/L; do not edit the EA without its exact source.


## Broker position reporting — progress update (2026-11-21)

- User supplied both Demo and Real EA source files. Demo source was backed up unchanged; Real source was inspected but not edited.
- Prepared candidate Demo EA v2.22 to send the full open-position list alongside the existing account snapshot. Candidate file is not yet compiled or installed.
- Added `positions` JSONB and `positions_complete` to `public.mt5_account_snapshots`.
- Deployed `mt5-bridge` Edge Function v32. The authenticated dashboard snapshot now returns the position payload and completeness flag; old/Real bridge snapshots without the array remain explicitly incomplete.
- Updated `index.html` and `vision2-dashboard.js` so Open Trades can render actual broker-reported position details and stale/incomplete states. GitHub commits: `425f69889d74cde40b6e9e09281c790bdd30706c` and `b920322f8a836fba5f6f1daac70cf8a61d96738a`.
- Pending: compile candidate in MetaEditor, install on Demo only, verify a complete snapshot reaches Supabase and renders in the dashboard, then separately harden/retest durable close-report retry. No Real EA, V63 rules, approvals, risk limits or order-execution settings were changed.


## Market monitor diagnostic and notification logging repair (2026-11-21 15:06 UTC)
- Corrected `diagnoseCandidate` so its 1H diagnostic matches the existing production candidate gate: BUY requires 1H score >= +12; SELL requires 1H score <= -12. Previously the diagnostic checked only the absolute score, so contradictory EMA direction/momentum could be misreported as a 15M setup issue. This was an explanation/diagnostic defect; the candidate eligibility rules were not changed.
- Extended the structured `MKTRADEHOME_SCAN` log to include candidate ID, quality score, in-app alert save result, Telegram delivery result and notification-related errors when an eligible candidate is saved. No notification destination, credentials, or delivery conditions were changed.
- Deployed Supabase `market-monitor` v64 ACTIVE. Deployment SHA: `e4281b202a2222e73a58be97b9ff6df1cda96f6218e02f25b9fd9f56f42dfbdd`.
- Four focused direction/score diagnostic checks passed: mismatched SELL/+score and BUY/-score are reported as 1H bias conflicts; aligned SELL/negative score and BUY/positive score do not trigger that mismatch diagnostic.
- Triggered one manual scan through the existing monitor-secret route. HTTP 200 confirmed the v64 response. BTCUSD correctly returned WAIT with `WEAK_1H_BIAS`: EMA structure points SELL while its directional score was +30. EURUSD, XAUUSD and USDJPY remained WAIT because their quotes were stale/markets closed. No candidate, alert, approval or order was created by this run.
- The scheduled five-minute monitor remains enabled. A future eligible candidate is still required to test the new Telegram/in-app delivery fields end-to-end; delivery has not yet been verified because the latest scan did not produce a candidate.
- Synced the deployed v64 source to `supabase/functions/market-monitor/index.ts` in GitHub. The focused checks are not a substitute for the repository CI run; CI should be checked after this commit.
- The Approval Centre, `create-mt5-approval` contract, V63 entry thresholds, 4H/15M/5M gates, ATR risk sizing, TP1/TP2, approval expiry, Demo account binding, and MT5 execution safeguards were not changed. MT5 EA execution remains disabled during this signal test.


## Signal drought investigation — confirmed scan behaviour (2026-11-21)
- Reviewed production `market-monitor` v64 logs from 11:25 UTC through 15:55 UTC: 56 scheduled scans were recorded; one independently verified BTCUSD SELL candidate was saved at 11:25:03 UTC. Its stored expiry was 11:35:03 UTC (10 minutes). One corresponding unread `trade_alerts` row exists. No later qualifying candidate was saved in that window.
- Rejection diagnostics across those scans: 29 `15M_SETUP_PENDING` occurrences and 23 `WEAK_1H_BIAS` occurrences; two `5M_ENTRY_CONFLICT` occurrences. EURUSD, XAUUSD and USDJPY were rejected because quotes were stale/markets closed (Saturday). The scheduled scanner was therefore operating; it was not silently stopped.
- The Approval Centre intentionally renders only fresh, independently verified BUY/SELL candidates. The 11:25 candidate expired after 10 minutes and was no longer eligible for approval after 11:35. This explains why it disappeared; it does not prove Telegram delivery.
- Important correction for future strategy work: the existing `market-monitor-v100-shadow` v5 `buildCandidate` logic is effectively the same balanced multi-timeframe candidate pathway as production, not a genuinely different second strategy. Do not present it as an alternative strategy. Its backtest also replays that same V100 candidate logic.
- Next: develop a genuinely distinct second setup class in an isolated shadow/backtest only (no production approvals, alerts, queue writes or execution). Compare it against the existing baseline using completed candles, next-bar fills, conservative same-bar SL-first assumptions, spread/fees sensitivity and adequate sample size. Integrate only if it adds worthwhile net expectancy without unacceptable drawdown; otherwise retain the current strategy and improve the dashboard's visibility of scan/rejection status. No production thresholds, approval rules, risk limits or execution settings were changed during this investigation. MT5 EA execution remains OFF.


## Shadow-strategy research — history coverage and isolation audit (2026-11-21)
- Re-inspected deployed `market-monitor-v100-shadow` v5 and `market-monitor-v100-backtest-shadow`. The shadow monitor explicitly reports `productionWrites:false`, `createsApprovals:false`, `createsQueueItems:false`, `telegramAlerts:false` and `executesTrades:false`. The backtest uses the same V100 `buildCandidate`, `scoreTimeframe` and validation helpers as the current baseline; it is not a distinct strategy.
- Audited `public.market_candle_archive` coverage by symbol/timeframe. 5M history currently spans only about 2.4–3.2 days; 15M about 3.5–4.6 days; 1H about 9.5–11.5 days; 4H about 32–40 days. This is insufficient for a robust cross-market strategy comparison, particularly at the intended 5M entry timeframe. The archive is not a substitute for the rolling BiQuote historical download used by the V100 backtest.
- Reviewed V100 backtest mechanics: it uses completed candles, evaluates after a completed 15M candle, enters at the next 15M open, assumes SL-first if SL and TP1 touch in the same candle, and exits the full position at TP1 (2R). However, historical spread, commission, swap and slippage are unavailable; reported results are gross and cannot establish net profitability. Market-open periods are also assumed rather than independently modelled.
- Research decision: do not loosen production filters or create a second strategy by merely changing thresholds. A distinct candidate class must have a genuinely different entry mechanism (to be tested as an isolated range-breakout/volatility-expansion hypothesis), use point-in-time completed candles and next-bar fills, and report costs/coverage limitations. No alternative strategy has been coded, backtested, deployed or approved in this session. No production function, approval, alert, queue, database schema or MT5 setting was changed.
- Next gate: run an isolated comparative replay with enough common history across 4H/1H/15M/5M, including spread/fee sensitivity and out-of-sample segmentation. If data coverage is inadequate or the alternative does not improve net expectancy with controlled drawdown, retain the validated baseline. MT5 EA execution remains OFF.



## Scanner observability — read-only dashboard visibility (2026-11-21)
- Confirmed the production cron job `mktradehome-market-monitor` is active on `*/5 * * * *` (every five minutes). At 16:20 UTC, the latest run succeeded. The 24-hour run history contained 288 scheduled runs: 288 succeeded, 0 failed (first 16:25 UTC on 2026-11-20; latest 16:20 UTC on 2026-11-21).
- The 16:20 UTC v64 scan rejected BTCUSD with `WEAK_1H_BIAS` because 1H EMA structure and directional momentum did not agree strongly enough for SELL. EURUSD, XAUUSD and USDJPY were rejected because quotes were stale/invalid or markets were not confirmed open. No new candidate or trade was created by this scan.
- Corrected an important dashboard wording/architecture gap: the browser's five-minute `refreshAll` refresh is local quote/timeframe analysis and is not the server-side production monitor. The new panel reads the independent cron heartbeat so those two processes are not confused.
- Added `vision2-scan-status.js` and loaded it after the Vision2 dashboard/session scripts. The new read-only panel shows the scheduled scanner's last run and 24-hour run counts, the most recent independently verified candidate with its expiry and quality-score disclaimer, each market's current dashboard quote state and saved-analysis freshness, Telegram linkage, browser push registrations, and latest saved in-app alert time. Stale analysis is explicitly labelled stale and its old rejection reason is not shown as current. Status refreshes every 60 seconds.
- Added owner-scoped `public.mktradehome_scan_status()` RPC through migration `replace_scan_status_view_with_owner_scoped_rpc`. It reads only operational metadata and this dashboard owner's scanner/candidate/notification rows; it performs no writes and has no signal, approval, queue, alert or trade side effects. `anon` execution is revoked; the function returns `NULL` for a non-owner authenticated subject. Tested the owner claim path successfully and the non-owner path returned `NULL`.
- Security note: Supabase's generic advisor reports `authenticated_security_definer_function_executable` for this RPC because it must read the protected `cron` schema. This is intentional and narrowly constrained: no parameters, fixed dashboard-owner UUID check via `auth.uid()`, empty `search_path`, `anon` revoked, and no mutating SQL. The earlier broad view approach was removed after the advisor flagged its SECURITY DEFINER view; no such view remains. The generic authenticated SECURITY DEFINER warning is retained and documented rather than weakening the owner-only data path.
- GitHub commits: `573a1f434096dbb390d90bc38047193f6e6b4aaa` (new status module), `b65f1286f78e6e9c987ac246d5fb80196879b8f8` (load module from `index.html`), and `ca87823a8e61eea920f9c5266280ba211eb1a0a4` (save final SQL migration). Node.js v22.16.0 `node --check` passed for the new module. The database RPC was exercised with owner and non-owner JWT subject claims.
- Telegram: one account is linked, but delivery of a real trading alert remains unverified; no test message was sent automatically. Browser push has zero registered devices. The latest saved in-app alert is still the 11:25 UTC candidate; that candidate expired at 11:35 UTC and must not be approved.
- No production `market-monitor` logic, entry thresholds, signal quality gates, candidate expiry, Approval Centre eligibility, MT5 queues, account binding, risk limits or EA execution settings were changed. MT5 execution remains OFF. The dashboard's production deployment and browser rendering still need a live smoke check after the hosting provider finishes the commit deployment.
- Saved the final database definition in `supabase/migrations/20261121162200_mktradehome_scan_status.sql` (GitHub commit `ca87823a8e61eea920f9c5266280ba211eb1a0a4`). The migration is repeatable and explicitly removes the temporary status view before defining the owner-scoped RPC.


## Safety hardening and overlap-aware forecast evaluation (2026-11-21)
- Deployed mt5-real-bridge v10 ACTIVE. The Real execution gate now returns false unconditionally; the peek endpoint exposes no Real trade/close queue item while the lock is active, and claim continues to return HTTP 423. Read-only account snapshots and journal reporting remain available. This removes dependence on the MT5_REAL_EXECUTION_ENABLED environment value. create-mt5-real-approval v3 remains an unconditional HTTP 403. The Real EA and secrets were not edited.
- Added the exact deployed Real bridge source to supabase/functions/mt5-real-bridge/index.ts in GitHub; this function previously had no source file in the repository. GitHub commit: c42733e9e8a4983c8c99bda1dee1e397e458e475.
- Deployed market-monitor v65 ACTIVE. Candidate alerts delivered to the in-app inbox/Telegram now explicitly state UNAPPROVED CANDIDATE — MANUAL REVIEW REQUIRED and say the alert does not approve or place a trade. The scanner still provides immediate candidate notifications. Candidate rules, 10-minute expiry, duplicate suppression, Demo approval validation, execution settings and risk limits were not changed. GitHub commit: 65984dbb14e1e86f7d52f6e68460cc69915e7aad.
- Reconciled one historical Demo queue row: USDJPY SELL queue 54f96f3f-8864-4c73-aaf1-270edf9c4b01 had status approved despite expiring on 2026-11-20 17:11:13 UTC and having no execution timestamp. A conditional update changed only that expired, unexecuted row to expired. No order was created or modified.
- Deployed market-foresight v10 ACTIVE. Performance reporting preserves rolling-window metrics and adds a per-symbol/per-horizon sample that excludes forecasts whose time windows overlap. It also compares model mean absolute return error with a zero-return/no-change baseline. The dashboard labels sign agreement precisely, displays rolling and non-overlapping sample sizes, and uses non-overlapping historical context for opportunity commentary. This is an evaluation/reporting change only; forecast generation and all production trading logic remain unchanged. Probabilities remain uncalibrated. GitHub commits: c0a2d67055171e64b74380b83904784b8606612b (metrics), f77a8a0272e87853a25fb7c975f25667b190839c (tests), f57350510f0db39b8003d410f657fa9d70c60a77 (API metadata), c2af87ad7b720802a1a36556f933b31f9cf93f63 (dashboard).
- Forecast helper tests now cover rolling metrics, overlapping-window exclusion, comparison with the zero-return baseline, empty samples and invalid/orphaned outcomes. GitHub combined commit status returned no status entries in this check; CI/test completion is therefore NOT YET VERIFIED and must not be described as passed.
- Verified market-monitor v65, market-foresight v10, and mt5-real-bridge v10 are ACTIVE in Supabase. The mktradehome-market-monitor cron remains active on */5 * * * *. The latest saved candidate at this check remained BTCUSD SELL #797 from 2026-11-21 11:25:03 UTC, already expired at 11:35:03 UTC; it is not actionable. No later fresh candidate was present in trade_signals at the time of the database check.
- Updated both existing daily Mktradehome monitoring automations to check current function versions, candidate freshness/expiry, explicit unapproved-alert wording, overlap-aware forecast metrics, and the Real bridge hard lock. Their existing daily schedules were preserved. These reports are supplemental; real-time scanning and immediate candidate notifications remain the five-minute server cron and configured Telegram/in-app routes.
- No new strategy was integrated, no production entry thresholds were relaxed, no order was approved, and no trade was executed. MT5 Demo execution remains OFF.


## Post-deployment verification (2026-11-21 16:46 UTC)
- Rechecked the scheduled scanner after deploying v65: cron job mktradehome-market-monitor remains active on */5 * * * *. Its latest scheduled invocation at 16:45:00 UTC succeeded.
- The v65 function log at 16:45:02 UTC confirms a fresh BTCUSD quote and a deliberate WAIT: 1H EMA structure pointed SELL but the directional score was +22, so the existing SELL momentum requirement (score <= -12) was not met. EURUSD, XAUUSD and USDJPY remained WAIT because their quotes were stale or the market was not confirmed open. No fresh candidate was created by this scan.
- The newest saved candidate remains BTCUSD SELL #797 from 11:25:03 UTC, expired at 11:35:03 UTC. It must not be approved or treated as actionable.
- Supabase function log aggregation for the last 24 hours returned only info and log levels; no error/fatal-level entries were present in that function_logs stream. This does not substitute for a full end-to-end notification test.
- Local verification of the new forecast metric helper passed TypeScript strict compilation, four deterministic runtime scenarios (including non-overlap filtering and zero-return baseline comparison), and Node syntax checking of the edited dashboard rendering snippet.
- GitHub combined status still returned no status entries for the dashboard commit; full GitHub Actions/Deno CI completion remains unverified. Do not claim CI passed until a run is independently confirmed.
- The daily Mktradehome signal-engine and health-monitor automations were successfully updated; both retain their existing schedules. They report health and latest candidate status but are not a substitute for the five-minute scanner or immediate notification delivery.


## Foresight reliability guard (2026-11-21)
- Reviewed the realized forecast outcomes directly from Supabase. The existing rolling, overlapping observations showed: 15M = 107 outcomes, 68.2% expected-return sign hit rate, model MAE 0.3189% versus 0.3424% for a zero-return forecast (+6.9% relative MAE improvement); 1H = 87 outcomes, 64.4% sign hit rate, model MAE 0.8572% versus 0.7902% zero-return baseline (-8.5%); 4H = 46 outcomes, 37.0% sign hit rate, model MAE 2.6163% versus 2.2173% zero-return baseline (-18.0%). These are overlapping rolling observations and are correlated; they are descriptive, not independent samples or future win probabilities.
- Added a dashboard-only reliability guard: 4H Foresight is labelled experimental and excluded from unified context alignment. 15M/1H Foresight can contribute an alignment label only after each relevant market/horizon has at least 30 non-overlapping matured outcomes and positive MAE improvement over the zero-return baseline. Otherwise the dashboard says Foresight is not validated. This does not alter technical signals, Approval Centre eligibility, risk limits or MT5 execution.
- GitHub commit for the dashboard guard: 218a5cb1d11a348fb61ce6d656d88fb2cd7b0fc6; follow-up clarity commit: 64ff9089dfd3f7a5da0d2cd8b795ce15e8ea1f20.
- Local Node syntax check passed for the updated unified-context and opportunity-evidence snippets. Full GitHub Actions/Deno CI remains unverified because the GitHub commit status endpoint returned no status entries.



## Candidate target precision repair (2026-11-21)
- Investigation of 24-hour scanner logs found 111 WAIT records using the generic `OTHER_VALIDATION` diagnostic: BTCUSD 59, XAUUSD 23, USDJPY 16 and EURUSD 13. These records indicate the candidate builder's directional gates were reached, but do not by themselves prove the exact rejection cause.
- Reproduced a deterministic binary floating-point edge case: constructing mathematically exact 2R/3R targets and then subtracting the entry/stop values can yield a reward a few machine-precision units below the exact comparison. The production v65 builder and final validator both used strict comparisons, while the isolated shadow had already introduced a tiny relative tolerance.
- Added `supabase/functions/market-monitor/candidate-geometry.ts` and deterministic tests beside the production engine. The helper allows only a tiny relative machine-precision tolerance (`max(1, |entry|) × 1e-10`); it does not round to broker ticks, widen stops, reduce reward targets, or alter any strategy threshold. It also checks risk-distance consistency, stop/target direction and positive finite prices.
- Updated production `market-monitor` so both candidate construction and final validation use the same tolerance. The generic diagnostic now reports a specific final validation reason where possible. No 1H/4H/15M/5M direction rules, entry extension limit, quote freshness/market-open gate, duplicate suppression, 10-minute expiry, manual approval, Demo-only queue or execution settings were relaxed.
- Deployed `market-monitor` v67 ACTIVE. GitHub commits: `e7b3000cb785b381deeaf492e876ee46b0e12271` (shared helper), `8c434e54e9a8ba9c4b4ef36d46e248cdf577f3e0` (initial tests), `e80e07d97ccd21099048f57d058da1293ad6c0ca` (precision regression fixtures), `0012ac61089cf72edcb250d8c2d9939558401882` (CI workflow), `65984dbb14e1e86f7d52f6e68460cc69915e7aad` (earlier v65 candidate notification wording), `f4e788445591a37b74d2c86ea60325f11c5a1de4` (first production source/import path), `496f69802007d66c784287e9d5490076ac1296d9` (helper relocation), `9f66545eb005eb24014b5a563101eed3f42fa3e5` (test relocation), `7ca0449e9be79a940020a28cd37026dfd9089d07` (production import), `e909908dcc10bfa8a43bb0d567f133c7ef7b2095` (CI test path), `df57a48eef31c0f103912de71423b2e9498bcb54` and `23dc77cb8e6a1c90bb5de7951893689d9e3d80ac` (remove old shared paths). The v67 deployment completed ACTIVE. The first v66 bundle attempt failed because its shared-helper import path did not match the Edge Function bundle layout; the helper was moved into the market-monitor function directory, the repository import and CI path were corrected, and v67 then deployed ACTIVE.
- Regression tests cover BUY/SELL machine-rounding tolerance, a genuinely undersized TP1, wrong-side stop and risk-distance mismatch. GitHub Actions must be checked after the latest commit; do not claim tests passed until the run completes.
- Next acceptance check: confirm the new CI run passes, then inspect post-v66 scan logs for the new specific validation diagnostics and confirm the next valid candidate alert remains unapproved/manual-review only. No order was approved or executed; Demo execution remains OFF and the Real bridge remains hard locked.


### Follow-up verification (2026-11-21 17:04 UTC)
- Corrected the SELL-side negative-test fixture: a lower SELL take-profit price increases reward rather than reducing it, so the fixture now moves TP1 upward to test a genuinely undersized reward. The production validation logic was not changed by this test-only correction.
- GitHub Actions run `44928008631` for commit `3aa0e2784f57dce22a8696e25a30703497cc7d0c` completed successfully. All steps passed: production/shadow Deno type-check, dashboard JavaScript checks, three candidate-geometry regression tests, foresight tests, approval-proof tests and legacy-engine tests.
- Confirmed Supabase `market-monitor` v67 is ACTIVE and contains `index.ts` plus `candidate-geometry.ts`. No post-v67 scheduled scan result was yet visible at the exact time of this check; verify the next five-minute scan before claiming the runtime fix has reduced rejection counts.
- Latest persisted candidate remains BTCUSD SELL #797 from 11:25:03 UTC and is expired. No candidate was approved and no trade was executed. Demo execution remains OFF; Real remains hard locked.


### First post-v67 scheduled scan (2026-11-21 17:05 UTC)
- Cron job `mktradehome-market-monitor` ran successfully at 17:05:00 UTC. The invocation used production deployment v67 and completed the four BTCUSD timeframe candle audits with correct 5M/15M/1H/4H cadence.
- BTCUSD returned WAIT for a genuine directional conflict: the 1H EMA20 remained below EMA50 (SELL structure), but the composite 1H momentum score was +26, above the SELL threshold of -12; 5M momentum was BUY. EURUSD, XAUUSD and USDJPY returned WAIT because their quotes were stale or the markets were not confirmed open (Saturday session).
- This confirms v67 is running and its diagnostics are visible. It does not yet prove the precision repair has reduced missed-candidate counts because this scan was rejected earlier at the 1H bias gate and did not reach target geometry validation. Continue monitoring subsequent scans for specific `FINAL_VALIDATION` reasons and compare candidate/rejection counts over a longer sample.


### Dashboard stale-snapshot protection (2026-11-21)
- Read-only inspection found the dashboard continued displaying the last saved DEVELOPING BUY/SELL watch text even when its market snapshot was many hours old. Example: EURUSD, XAUUSD and USDJPY still showed developing SELL context from 2026-11-20 21:55 UTC during the 2026-11-21 Saturday session, although their quotes were no longer fresh/open.
- Updated `index.html` so a technical snapshot is considered fresh only when its timestamp is within the last 15 minutes and not in the future. Stale rows now show `STALE SNAPSHOT`, suppress old developing-setup text, and the unified context verdict becomes `STALE TECHNICAL DATA · WAIT FOR FRESH SCAN`. Existing frame values remain visible as historical context with a stale label.
- This is dashboard presentation only: no scanner, candidate filters, alerting, approval, queue, risk or MT5 execution logic was changed. Commit: `d72ac089275ef801cf436df811c685b82dd62eeb`.
- GitHub Actions run `44928623241` (engine/approval checks) and Pages deployment run `44928622313` were triggered for this commit. At documentation time, both were still in progress; do not claim deployment or full CI success until their final results are checked.


### Final dashboard deployment verification (2026-11-21)
- Latest engine/approval workflow run `44928657406` for commit `c999ca7fca8666577e4463631301253cf69b8ecf` completed SUCCESS.
- Latest Pages build/deployment workflow run `44928657100` for the same commit completed SUCCESS. The earlier deployment attempt for dashboard commit `d72ac089275ef801cf436df811c685b82dd62eeb` was cancelled by a newer commit; the final commit is the one successfully deployed.
- Supabase production `market-monitor` remains v67 ACTIVE. Dashboard freshness guard is deployed to Pages. No trading engine, signal thresholds, approval workflow or execution setting was changed by the dashboard fix.
- Remaining verification: inspect a fresh live dashboard view and collect further post-v67 scan samples to measure whether precision-only target-validation rejections have decreased. No improvement in trade frequency or profitability is claimed yet.


## Opportunity-quality investigation and shadow-test gate (2026-11-21 17:23 UTC)
- Re-read the active production Edge Function: `market-monitor` v67 is ACTIVE. Supabase function logs show successful scheduled invocations at 17:05, 17:10, 17:15 and 17:20 UTC; the latest 17:20 run completed HTTP 200 in about 3.6 seconds. The scanner is running, not stalled.
- Latest BTCUSD WAIT is explained by a real transition conflict, not a broken scanner: 1H EMA20 58,991 is below EMA50 60,003 (bearish structure), but the 1H close 59,950 is above EMA20, RSI is 56.16 and MACD histogram is +436.93; the composite 1H score is +26. The current SELL rule requires a score <= -12, so it correctly refuses a short while 1H momentum is bullish. 5M is BUY, 15M indicators are mixed, and 4H is SELL. Do not override this conflict by relaxing the production gate.
- EURUSD, XAUUSD and USDJPY were WAIT because their quotes were stale or their markets were not confirmed open during the Saturday session. This is a data/session availability block, not a directional rejection.
- Investigated the apparent proof inconsistency on saved BTCUSD candidates #794–#797. All four historical candidates were SELL, had `verificationStatus=PASSED`, and have expired (last expiry 11:35 UTC); none is actionable now. The categorical per-timeframe `signal` is deliberately stricter than the engine's composite-score rule: it requires a fixed RSI band and MACD histogram sign as well as EMA conditions. Candidate generation and independent approval proof recompute the composite score and other exact strategy/risk rules. Existing `approval-proof.test.ts` explicitly tests acceptance of a valid candidate whose 5M categorical signal is WAIT and a persisted EURUSD SELL proof whose categorical timeframe signals are WAIT. Therefore the old #797 proof display is not, by itself, evidence of a verification bypass. Keep the independent proof validator and manual approval gate intact.
- Reviewed the existing V100 shadow backtest. It is a historical replay of the same baseline strategy, not an alternative detector. It evaluates only completed candles, enters at the next 15M open, and reports true common coverage after warm-up. However, it assumes zero historical spread, excludes commission/swap/slippage, assumes market-open periods, and is therefore gross-only evidence. It cannot establish net profitability or whether a distinct reversal/pullback/momentum strategy is better.
- Current persisted archive coverage is not sufficient for a robust four-market 5M comparison: 5M starts around 2026-11-18 (roughly three days), 15M around 2026-11-17 (roughly four days), 1H around 2026-11-09/10 (roughly 11–12 days), and 4H around 2026-10-09/20 (roughly one month). The existing backtest fetches a rolling BiQuote history window (7–30 requested days), but its common test window is limited by the shortest timeframe and warm-up. A separate strategy should not be promoted on this small/short sample.
- Research decision: do not modify or redeploy production v67. Do not treat the 1H transition as a valid short or force an entry. The next valid research step is an isolated, distinct setup-class replay (reversal / trend-pullback / short-term momentum) on longer common OHLC history, with next-bar fills, spread/commission/slippage sensitivity, walk-forward out-of-sample splits, expectancy in R, drawdown and consecutive-loss reporting. If sufficient history or realistic costs cannot be obtained, report the limitation and abstain from ranking the alternative.
- Safety state unchanged: manual approval remains required; Demo execution remains OFF; Real execution remains hard locked. No order, approval, queue item, alert, production threshold, database schema or MT5 setting was changed during this investigation.


## No-notification / no-current-setup diagnosis (2026-11-21 17:42 UTC)
- The scanner is not stopped: production v67 has successful HTTP 200 runs every five minutes through 17:40 UTC. Latest scan has fresh BTCUSD candles (5M last open 17:35 UTC; 15M 17:15; 1H 16:00; 4H 12:00).
- Important correction to the earlier summary: the database contains 78 BTCUSD SELL alert records in the last 24 hours, from 2026-11-20 17:45 through 2026-11-21 11:25 UTC. The latest signal/alert is #797 at 11:25 UTC and expired at 11:35 UTC. There have been no new candidate/alert rows since then. Thus the user experienced no *current* setup/notification after 11:25, not a stopped scanner.
- The latest 17:40 scan is explicit: BTCUSD WAIT because the 1H EMA structure is bearish but the composite directional score is +26 (bullish), failing the SELL gate (SELL requires score <= -12). 5M, 15M are mixed; 4H is SELL. EURUSD, XAUUSD and USDJPY are blocked by stale/invalid/market-not-confirmed-open quotes on Saturday. This is a strategy gate/session availability outcome, not a scheduling failure.
- Earlier 11:35–11:55 scans show BTCUSD SELL bias but reject the entry because 15M score was +42 against the SELL setup (15M_SETUP_PENDING); at 11:35/11:40 the 5M BUY score opposed SELL strongly (5M_ENTRY_CONFLICT). The engine therefore did not simply overlook a valid confirmed setup in those scans.
- Notification-channel evidence: 1 Telegram user connection exists; 0 browser push subscriptions exist. In-app trade_alerts rows were inserted for the 78 candidates. The latest stored alert is #797 at 11:25. Current logs do not expose a conclusive Telegram API delivery success/failure for that last alert, so Telegram receipt is unverified. Browser push cannot be delivered with zero subscriptions.
- The 78 repeated SELL candidates are historical records, not 78 trades; each alert was unapproved, short-lived (10 minutes), and no order was placed. Do not revive or approve them.
- Next engineering work: (1) add explicit structured per-market/per-timeframe gate diagnostics and explicit Telegram send success/failure logging; (2) separately build and test a shadow-only short-term opportunity detector so a valid 5M/15M reversal or pullback can be evaluated without weakening the production 1H-based candidate path; (3) add a clear dashboard state distinguishing scanner healthy / no candidate / stale market / notification delivery status. Keep all new signal logic shadow-only until historical and Demo validation. No production thresholds or execution settings changed in this diagnosis.


## Unified signal labels: Good and Clear / Normal (2026-11-21)
- User clarified the desired behavior: Mktradehome must use one opportunity-search system to find both stronger and regular worthwhile setups, then classify each valid candidate as either GOOD AND CLEAR SIGNAL or NORMAL SIGNAL. These are labels/quality tiers, not separate trading engines or separate approval systems.
- A NORMAL SIGNAL must still be a valid, properly confirmed trade with fresh/open-market data, a defensible BUY/SELL direction, valid entry and stop, required reward geometry, independent verification, expiry and manual approval. “Normal” must never mean inaccurate, weak, unverified or risky. It may represent a more modest opportunity than a high-confluence Good and Clear signal, but must not receive weaker safety or confirmation rules.
- GOOD AND CLEAR is reserved for stronger multi-timeframe confluence / clearer market structure. The exact classification boundary must be specified and tested against historical outcomes; the existing heuristic quality score is explicitly not win probability and must not be presented as accuracy.
- Keep the current production market-monitor v67 unchanged while developing and evaluating the classification and any additional setup recognition in isolated shadow mode. Do not create a second user-facing engine, bypass the 1H/4H/15M/5M safety gates, reduce the existing 2R/3R geometry, loosen freshness/session checks, change lot size, or alter approval/MT5 execution behavior merely to increase signal frequency.
- Next work: define deterministic classification rules using the current candidate proof data; evaluate the two labels separately with completed-candle, cost-aware, out-of-sample evidence; show both labels in the same dashboard and same manual approval flow only after validation. Preserve Demo-first testing; Demo execution remains OFF and Real remains hard locked.
- This entry records the product requirement and safe implementation plan only. No production source, thresholds, database schema, alert, approval, queue, execution or deployment was changed by this documentation update.


## Unified Good and Clear / Normal classifier — isolated implementation (2026-11-21)
- Added `supabase/functions/market-monitor/signal-classification.ts` as a pure classifier for an already validated candidate. It returns GOOD AND CLEAR SIGNAL only when 4H, 1H, 15M and 5M EMA structure are directionally aligned, with directional score at least 12 on 4H/1H/15M and non-opposing 5M. Any candidate that has already passed all common hard gates but does not meet that higher confluence bar is labelled NORMAL SIGNAL.
- The helper returns WAIT for WAIT direction or unless the caller explicitly confirms that all mandatory hard gates passed. It does not build candidates, relax any validation, or create approvals/alerts/queue items. NORMAL therefore has the same required quote/session, entry, stop/target, reward geometry, independent proof, expiry, duplicate and manual approval requirements as GOOD AND CLEAR.
- Added deterministic Deno tests for BUY/SELL high-confluence classification, verified lower-confluence NORMAL classification, hard-gate failure, WAIT direction and non-finite score handling in `signal-classification.test.ts`.
- This is intentionally isolated research code and is not imported by production `index.ts`, not deployed, and not wired to the dashboard yet. It does not increase signal frequency by itself. The next phase is a separately tested setup-recognition/shadow replay to determine whether additional valid candidates can be found without weakening hard safety rules; then integrate labels into the existing candidate display and approval flow only after evidence.
- Production `market-monitor` v67, thresholds, database schema, queues, alerts, manual approval, Demo execution OFF and Real hard lock remain unchanged. No trading action occurred.

- Verification update: the six classifier regression cases were executed locally with Node's TypeScript type-stripping runner and all six passed. This is a focused runtime check, not a Deno/Supabase deployment or a GitHub Actions result. The non-finite timeframe evidence case was tightened to return WAIT rather than NORMAL.

## Unified signal-class replay measurement (2026-11-21)
- Updated only the isolated `market-monitor-v100-backtest-shadow` source to apply the shared `signal-classification.ts` classifier to candidates that have already passed the existing shadow candidate builder and validation.
- Historical replay now reports closed-trade metrics separately for `GOOD_AND_CLEAR` and `NORMAL`, including trade count, win rate, net/average R, profit factor and maximum drawdown, plus unclosed-at-window-end counts by class.
- This is measurement, not a new candidate generator: no entry gate, 1H/4H/15M/5M threshold, entry-extension rule, ATR stop, 2R/3R target, or replay fill assumption was loosened. Both classes inherit the exact same candidate validation and simulation rules.
- Deployed isolated `market-monitor-v100-backtest-shadow` v12 ACTIVE with JWT verification enabled. The function is read-only historical replay; it creates no database rows, alerts, approvals, queue items or trades. Deployment verified through Supabase function metadata.
- The change does not alter production `market-monitor`, live alerts, dashboard labels, approvals, queue records, Demo execution, or Real-account protections. A backtest result has not yet been generated; the function requires an authenticated dashboard session.
- GitHub source commits: `c9e6a7c3fdb44f48889d67eae7d61c33be359888` (class metrics), `88b08dd12e1e577fbf7411dc880f3ac6fe2959b1` (local dependency import), `a90c457fa235b71a3911ccb1240282078bfc80bc` (bundled classifier). Deployment version: v12. The classifier's six focused regression cases passed in the prior work session; the new deployed replay still needs an authenticated runtime run before any performance conclusion.
- Data caveat remains: BiQuote history is rolling/limited; historical bid/ask spread, commission, swap, slippage and broker fills are not fully represented. Gross shadow results must not be treated as expected live performance.
- Updated the dashboard's existing V100 Shadow Backtest result renderer to display the Good and Clear versus Normal metrics for each market. GitHub commit: `3c2eb6d7a87421347f85145a60cd62383863c17d`. Cloudflare Pages automatic deployment is configured, but the updated page has not yet been independently verified live.


## V100 shadow replay — archive-backed history (2026-11-21)
- Investigated the first class-breakdown replay. Its actual common coverage was only about 0.7 days because BiQuote's OHLC endpoint is a rolling window (the 5M history is the limiting timeframe); requesting a longer window from that endpoint alone cannot create older candles.
- Queried the existing private market_candle_archive table. At inspection it contained BTCUSD 5M 939 bars (2026-11-18 07:55 UTC through 2026-11-21 18:10 UTC), and 636 5M bars each for EURUSD, XAUUSD and USDJPY, with each market's actual start/end recorded in the database. The archive has been accumulating through the existing Market Foresight collector. Some forex/gold gaps reflect market-session closures; they must not be blindly filled or treated as tradable candles.
- Updated only market-monitor-v100-backtest-shadow to load archived candles server-side using the function's private Supabase service credential, merge them with the rolling BiQuote window, deduplicate/sort/validate OHLC, and report archive/provider bar counts per timeframe. The service credential remains server-side; the function still requires a valid signed-in JWT.
- Replay now skips evaluation points whenever any timeframe's latest completed candle is older than 1.5 periods, preventing stale weekend/session data from being treated as a fresh setup. It reports staleDataBlocks separately.
- Deployed isolated function v13 ACTIVE with JWT verification enabled. GitHub source commit: 62d1cbd16faf8dcd8faec8a877a89bd964f00353.
- Production market-monitor v67, approval functions, dashboard signal/approval behavior, database schema, MT5 bridge, Demo execution OFF and Real hard lock were not changed. The backtest remains read-only and creates no trades, approvals, queue items or alerts.
- Remaining limitations: archive history is still short and only grows while the existing collector runs; the historical replay still lacks a full historical bid/ask series, commissions, swaps, slippage, broker fills and exact historical market-open state. It must remain gross research evidence, not proof of profitability. The next verification is an authenticated dashboard replay using the new v13 function, then inspect per-market history-source counts and true common coverage before interpreting any performance metrics.


- Dashboard follow-up: the V100 result card now shows archived/provider candle counts for each timeframe and the number of replay points skipped for stale timeframe evidence. It also describes the coverage warning as a limit of all available common history, not only the provider window. Frontend commit: 74bd1f5aeb00ad4409aa12696c3459f3136c8ef2. Automatic Pages deployment is configured, but the updated dashboard has not yet been independently verified live.


## Live signal-classification connection (2026-11-21)
- Connected the tested Good and Clear / Normal classifier to the live `market-monitor` candidate path only after the existing `buildCandidate` and `validateCandidate` checks pass. It uses the same 4H/1H/15M/5M evidence and does not alter candidate generation, directional thresholds, quote/session freshness, entry distance, ATR stop, 2R/3R targets, expiry, duplicate suppression, independent proof, manual approval, or execution settings.
- Persisted `signalClass`, `displayLabel` and classification reason inside the existing `analysis` proof JSON, and added the label to in-app/Telegram alert text and scan diagnostics. No database schema change was required.
- Updated dashboard saved-candidate restoration and Trade Approval Centre to show the saved label. Older records remain explicitly `LEGACY SIGNAL · NOT CLASSIFIED` rather than being retroactively guessed.
- This connects labels for candidates already generated by the existing 1H-led engine. It does **not** add short-term candidate generation; that remains a separate shadow-only research task and must pass out-of-sample/cost-aware testing before production use.
- Safety unchanged: manual review/approval remains required, Demo execution remains OFF, and Real remains hard locked. Deployment and CI verification are pending; do not treat this note as proof of deployment until verified.


### Deployment and CI verification — live label connection (2026-11-21 18:29 UTC)
- Supabase production `market-monitor` v68 is ACTIVE; retrieved deployed files confirm the live entrypoint imports and calls the signal classifier. Its prior custom-secret authentication mode is preserved (`verify_jwt=false`), as is the five-minute cron job.
- Isolated archive-backed `market-monitor-v100-backtest-shadow` v15 is ACTIVE with JWT verification enabled. A TypeScript inference error in the open-at-window-end class breakdown was found by CI and corrected; the open-trade record type now explicitly includes the classifier's full label union.
- GitHub Actions engine/approval test run for commit `1d95ff9d1c1a896bd0fe396059e1f97a5c74a52e` completed SUCCESS. This includes production/shadow Edge Function type-checks, dashboard JavaScript syntax checks, and existing regression tests.
- The Pages deployment workflow for the same commit was still pending at the time of this note. Do not claim the new dashboard UI is live until that workflow completes and the deployed page is checked.
- First scheduled v68 monitor response observed at 18:25 UTC returned HTTP 200. BTCUSD remained WAIT because the 1H EMA direction and directional score conflicted (score +27 against the SELL structure); 5M was BUY, but that does not override the existing 1H-led production rule. This confirms the scanner is running, not that short-term entries have been added.
- No candidate was created by that scan; no order, approval or execution occurred. Demo execution remains OFF and Real remains hard locked.


### Isolated short-term strategy research added (2026-11-21)
- Added `short-term-shadow.ts` as a separate candidate builder for research only. Direction comes from completed 15M EMA structure and a directional score of at least 18; a completed 5M candle must independently confirm with EMA trend/slope, RSI band and MACD histogram. 1H and 4H are conflict vetoes (opposition below -25 and -35 respectively), not direction setters. The 5M close must be within 0.75 x 5M ATR of EMA20. Risk distance is max(1.5 x 5M ATR, 0.75 x 15M ATR); TP1 2R, TP2 3R reference.
- Added a separate 5M replay in `market-monitor-v100-backtest-shadow`: evaluate only after a completed 5M candle, enter at the next 5M open, stop-first if SL and TP1 touch in the same bar, max hold 36 bars (3 hours), and report accepted setups, closed results, class breakdown, stale skips, open positions and recent trades. It cannot create live candidates, alerts, approvals, queue items, or orders.
- Added seven Deno regression tests for aligned BUY/SELL, neutral higher-timeframe context, higher-timeframe conflict veto, non-finite evidence, weak 5M confirmation and directional scoring. The full GitHub Actions engine/approval workflow passed for commit `990cd3a9f371856da0af5e4f48d317f9576cfb07`; the subsequent dashboard commit `345a4294f0b7125f2735663691737a53b638e965` also passed type-check and regression workflow.
- Deployed isolated `market-monitor-v100-backtest-shadow` v16 ACTIVE with JWT verification enabled. Retrieved deployed files confirm the new short-term builder and replay are present.
- Dashboard now includes a separate SHORT-TERM SHADOW result breakdown alongside the unchanged V100 baseline. Pages deployment for the dashboard update was still in progress at documentation time; verify the live page before saying the UI is published.
- No changes to production `market-monitor` v68, its 1H-led strategy thresholds, candidate gates, approvals, Demo execution, or Real lock. The new 5M/15M strategy remains research-only. Historical bid/ask/spread, market-open state, commission, swap, slippage and broker execution are unavailable in archive OHLC; gross replay alone cannot justify live integration.
- Next required validation: run the new shadow backtest across all four markets, record true common history coverage, inspect per-trade results and open positions, then collect substantially longer history and perform cost-aware/out-of-sample and Demo validation before any production connection.


## Live health verification — 2026-11-21 22:40 UTC
- Rechecked production Supabase logs: scheduled `market-monitor` v68 continues to run every five minutes and returned HTTP 200 on scans through 22:35 UTC. The scanner is operational; an empty Approval Centre is not evidence of a dashboard outage.
- Latest BTCUSD scan returned WAIT because the 1H EMA structure and directional score conflicted (SELL structure with positive directional score +33). The 5M/15M evidence was mixed; the scanner correctly did not promote a lower-timeframe move over the 1H direction. EURUSD, XAUUSD and USDJPY returned WAIT because their quotes/market state were stale or not confirmed open during the Saturday check.
- The latest live candidate remains historical BTCUSD SELL #797 from 11:25 UTC, expired at 11:35 UTC. It must not be restored or approved. The queue currently contains historical statuses only (12 executed, 8 expired, 12 failed); no pending/approved/executing item was reported in the latest review.
- Clarification after re-reading the current project specification and v68 source: the production 5M rule is an entry veto only when strongly opposed (score below -40); it is not documented as a mandatory 5M score >=0 gate. The previous investigation's proposed V100 >=0 comparison was not supported by the current governing status document and should not trigger a production rule change. Do not change this gate based on that mistaken comparison.
- The unified GOOD AND CLEAR / NORMAL classifier is connected to the v68 candidate path after the common candidate validation passes. NORMAL does not relax the hard gates. The 15M/5M short-term detector remains isolated research in the shadow replay; it is not a production alert source.
- No strategy thresholds, code, risk settings, approval rules, database rows, execution settings or deployments were changed during this verification. Demo execution remains OFF and Real remains hard locked. Telegram delivery for the latest historical candidate is still unverified; do not claim delivery.
- Next work: run the authenticated archive-backed shadow replay from the signed-in dashboard when available, inspect per-market class metrics and coverage, and improve explicit per-market diagnostic/notification observability in a separately tested change. Do not integrate short-term shadow signals into production until longer, cost-aware, out-of-sample and Demo validation supports it.


## BTC no-signal root-cause investigation — 2026-11-21 22:44 UTC
- Inspected actual production v68 scan logs and persisted market-intelligence snapshots, not just the scanner heartbeat. BTC scans continued every five minutes through 22:40 UTC; quote was open, fresh (0 seconds age in latest snapshot), and valid. Therefore the repeated BTC WAIT is not caused by a dead scanner or stale BTC quote.
- The latest 22:40 UTC BTC snapshot records: 1H EMA20 59,467 below EMA50 60,040 (bearish structure), but 1H close 60,346 above EMA20, RSI 59.1 and MACD histogram +307; directional score +33 (bullish). The engine therefore derives SELL from EMA structure but rejects it because the 1H score is bullish (+33, not <= -12). The exact production log reason is WEAK_1H_BIAS.
- The opposite BUY is also not valid under the existing gates: 4H score is -46 (strongly against BUY), while 1H EMA structure remains bearish. For SELL, the 15M EMA20 (60,167) is above EMA50 (59,673), so 15M structure is bullish and fails the SELL alignment/pullback-reversal rule. 5M score -53 supports SELL, but cannot override the 1H momentum conflict or 15M structure. This is a genuine multi-timeframe transition/conflict, not simply a missing alert.
- This explains the repeated WAIT: the 1H EMA trend is lagging a bullish recovery, while the 4H still reflects the broader bearish regime and the 15M has not aligned with SELL. The rules intentionally refuse to choose either side while those conditions conflict. Do not loosen the 1H score or 4H veto blindly.
- Latest logs show EURUSD, XAUUSD and USDJPY all WAIT because their quotes/market state were stale or not confirmed open on Saturday 2026-11-21. Their archived candles end on Friday 2026-11-20 16:45–16:55 UTC. This is expected weekend closure, not evidence those feeds are permanently broken.
- Archive coverage check: BTC has 988 M5, 458 M15, 235 H1 and 197 H4 rows; the other three markets have roughly 636 M5, 341 M15, 205–206 H1 and 190 H4 rows each, with market-specific history ending Friday. Data exists for a multi-day replay, but it is not a continuous 14-day high-frequency archive; the replay must report actual overlapping coverage and avoid claiming more history than available.
- The authenticated backtest-shadow endpoint is deployed v16 with JWT verification enabled. A backend invocation route is not available through the connected project tools, so an authenticated replay could not be run from this session. Do not represent it as completed. It must be launched from the signed-in dashboard or through a valid authenticated session.
- No production source, thresholds, signal classifier, risk settings, approval rules, queue, execution mode, database rows or deployments were changed. Demo-first/manual approval and Real hard-lock remain untouched.
- Next engineering task: instrument the scan result with explicit per-market gate-stage diagnostics and archive coverage counters, then build a fair historical replay comparison of the current 1H-led baseline against a separately isolated transition/reversal candidate. Compare same candles, actual spread/cost assumptions where available, and out-of-sample windows. Only consider a production change if it proves worthwhile NORMAL opportunities are missed without increasing false entries or risk.


## Isolated baseline rejection diagnostics — research branch
- Created branch `research/baseline-rejection-diagnostics` to improve the existing authenticated shadow replay without changing production.
- Added a pure diagnostic helper and five deterministic tests to classify why each otherwise evaluable 15M baseline replay bar is rejected: NO_1H_DIRECTION, WEAK_1H_BIAS, 4H_CONFLICT, 15M_SETUP_PENDING, 5M_ENTRY_CONFLICT, ATR_INVALID, ENTRY_TOO_EXTENDED, RISK_INVALID, or builder/final-validation fallback.
- The shadow replay now counts evaluated bars and aggregates baseline rejection reasons per market, alongside the existing baseline trade results and isolated 5M/15M shadow results. This should expose whether the 1H bias gate, 4H conflict, 15M structure, 5M veto or entry extension is the dominant cause of no signals.
- This is diagnostic instrumentation only. It does not change candidate acceptance, classification, risk, alerts, approvals, queue writes or execution. It has not been deployed. The authenticated replay still needs to be run from a signed-in dashboard session to produce measured results.
- Validation status: source changes were inspected on the feature branch; Deno tests have not yet been executed in this environment. Run the repository CI on the PR before deployment.

- Updated the dashboard's V100 replay results renderer on this branch to display bars evaluated and the ranked per-market rejection reason counts, so the results are visible on the phone rather than hidden in raw JSON. This dashboard change is not published; it is part of the draft PR only.


## Baseline rejection diagnostics — validation hardening (2026-11-22)
- Reviewed the branch diagnostic helper against the actual shadow baseline `buildCandidate` and `diagnoseCandidate` gate order. Direction, 1H score threshold, 4H opposition threshold, 15M alignment/pullback-reversal conditions, 5M opposition veto, ATR validity, entry-extension limit and ATR/spread risk geometry were checked for parity.
- Found that the existing repository engine/approval CI run for the PR completed successfully, but its job log showed that it did **not** invoke the newly added `baseline-diagnostics.test.ts`. The earlier statement that the PR had five tests therefore did not mean those tests had actually run.
- Expanded the diagnostic regression suite to ten cases, including no 1H direction, weak BUY and SELL bias, 4H conflict, 15M pending, an allowed SELL pullback reversal, 5M conflict, invalid ATR, overextended entry and invalid risk geometry.
- Added a dedicated GitHub Actions workflow at `.github/workflows/baseline-diagnostics.yml` to type-check and execute the diagnostic helper tests on relevant PR/push changes. The workflow has been committed to the research branch; its run result must be checked before treating these tests as passed.
- No production signal engine, thresholds, candidate rules, classifier, risk limits, alert/approval/queue behavior, Demo execution or Real-account hard lock changed. No function was deployed and no trade was placed.
- PR #4 remains a research-only change. Authenticated archive-backed replay has not yet been run; no conclusion about missed opportunities or strategy profitability is justified until that replay is completed and reviewed.


- First execution of the newly wired ten-case diagnostics suite exposed one failing pullback-reversal fixture: its test quote was above the 15M EMA50, so it did not actually satisfy the builder's SELL reversal condition. Corrected the fixture to place the quote below EMA50 while keeping it within the 0.75 ATR extension limit. The failed run was useful: 9/10 cases passed and the single mismatch was in the test setup, not a production rule change. The corrected test commit is `933aaa91f421a90842b2978bd3718b72edd412f8`; a fresh CI result has not yet appeared in the workflow-run lookup.

- The corrected fixture exposed a second test-data issue: for a SELL, the helper's `opposite(score)` transform means a pullback-against-trend must have a positive 15M score, not a negative one. The test fixture was corrected to use +30 on 15M while retaining the below-EMA50 quote and bearish 5M reversal confirmation. Latest test fix commit: `82b4a45cc63bf5032e8f08452870d5c3c6c0d6eb`. Await a fresh CI run for this commit before merge/deployment.

- Validation result: dedicated GitHub Actions run `44984916180` completed SUCCESS on the corrected diagnostic test commit. Deno type-check passed and all 10 baseline diagnostic regression tests passed. The broader engine/approval CI run `44984916132` had passed its type-check, dashboard syntax, geometry, short-term shadow, and foresight tests at the time of this update; approval-proof and legacy fixture tests were still running. Do not treat the overall PR CI as complete until that run reaches a final successful conclusion.

- Final validation: engine and approval GitHub Actions run `44984916132` completed SUCCESS, including the production/shadow Edge Function type-check, dashboard JavaScript syntax checks, and all existing regression suites. Dedicated diagnostics run `44984916180` also completed SUCCESS with all ten new diagnostic tests passing.
- Pull request #4 is open, mergeable and still marked Draft. It remains intentionally unmerged and undeployed because the authenticated archive-backed replay has not yet been run; this keeps the new dashboard renderer and shadow function instrumentation together until we are ready to publish the research-only diagnostics.


## BTC repeated-alert continuity check — 2026-11-22 04:20 UTC
- Read-only database review confirmed the three notifications received in sequence are candidate IDs 799, 800 and 801, created at 04:00:02, 04:10:03 and 04:20:04 UTC. Each has the same BTCUSD SELL direction, GOOD_AND_CLEAR class, 85/100 rule score and a ten-minute expiry.
- Their entry prices were 59,214.35, 59,331.73 and 59,307.33. The 1H and 4H EMA structure was unchanged across all three; 15M structure changed only slightly. This is best described as one continuing bearish setup being refreshed with a new quote/entry after each ten-minute candidate expiry—not three independent opportunities.
- Production source confirms same-direction duplicate suppression lasts 600,000 ms, exactly matching the ten-minute candidate expiry. A still-valid candidate is suppressed during that window; once the prior window expires, the continuing setup can generate a refreshed candidate. This explains the near-exact ten-minute notification cadence.
- Recomputed the latest candidate's directional scores from its saved indicator proof using the deployed v68 formula: 4H -61, 1H -64, 15M -69, 5M -26. For a SELL, negative scores are directionally aligned; all four EMA structures also aligned SELL. The GOOD AND CLEAR label and 85 score are therefore consistent with the saved evidence (85 is a rule score, not win probability).
- The Demo MT5 queue currently has no pending/approved/executing BTCUSD item; only historical executed/expired/failed rows were returned. These alerts did not create approvals or trades.
- No production behavior was changed. Keep the ten-minute refresh behavior for now because it supplies a fresh expiring candidate rather than silently extending an old entry. Follow-up research should distinguish a refreshed candidate from a new signal episode in performance reporting and alert wording, without suppressing genuinely new opportunities or changing risk gates.


## Baseline rejection diagnostics — merged and deployed (2026-11-22 04:35 UTC)
- PR #4 was validated and squash-merged to main as `bbe3f755e26405013fca49580cc896489129f422`. Dedicated GitHub Actions run `44985059713` passed Deno type-check and all 10 baseline diagnostic tests; engine/approval workflow run `44985059705` also completed successfully, including production/shadow type-checks, dashboard JavaScript syntax checks and existing regression suites.
- Deployed only the isolated `market-monitor-v100-backtest-shadow` Edge Function, now ACTIVE version 17 with JWT verification still enabled. Its only new behavior is counting historical baseline replay rejections and returning per-market reason totals; the dashboard renderer displays those diagnostics.
- No production `market-monitor`, live alert, approval, queue, execution, risk, or Real-account lock behavior was changed. No trade was placed.
- The dashboard source is now on main. Cloudflare Pages publication has not yet been independently verified from this session.
- The authenticated archive-backed replay has **not** been run yet. Next required validation is to open the signed-in dashboard, run the V100 Shadow Backtest for the requested period, and inspect actual overlap/coverage plus per-market rejection counts. Gross-only historical results remain research evidence, not proof of profitability.


## Isolated approval-dashboard delivery fix — 2026-11-23
- Confirmed root cause on the deployed-source baseline (main): the dashboard restored saved verified candidates only during a full market refresh, scheduled every five minutes. There was no dedicated approval-feed polling timer on main; this matches the reported case where a Telegram alert could arrive while the approval card remained absent until a manual refresh.
- Created isolated branch fix/approval-dashboard-live-sync from main. The only code file changed is index.html (one commit: 5b8b7913f0a0712625b1dfb0276555f12c2f2a8b).
- Ported the research-verified candidate restoration and approval-centre freshness gates; starts a dedicated saved-candidate sync immediately after the dashboard PIN is unlocked and polls every 2.5 seconds while the dashboard is visible/unlocked. Quote refresh remains separate at 8 seconds. The card displays the server-issued candidate expiry countdown; expired candidates and stale feed states are hidden, and approval clicks are blocked when the last successful feed sync is at least 10 seconds old.
- Existing server-side candidate proof, expiry, live quote, price-deviation, risk geometry, Demo account and manual approval checks remain authoritative. The change does not create an approval or place an order automatically.
- Realtime is not enabled for trade_signals in the project's supabase_realtime publication (catalog check returned no publication membership), so this isolated fix uses REST polling rather than pretending a Realtime subscription is active. Do not change production publication/schema in this pass.
- No market-monitor, approval Edge Function, Telegram function, database schema/publication, MT5 EA, execution switch, risk limit, or Real-account lock was changed. No deployment or merge has occurred. CI and browser-level Demo delivery validation are pending; do not call the live issue fixed until the isolated PR passes CI and is deliberately deployed and tested.

- CI verification for isolated PR #6: GitHub Actions run 45092830644 completed successfully on commit 797660c6dd82157e558955cbb3532cf4e4193d25. Production/shadow Edge Function type-check, dashboard inline JavaScript syntax, Vision navigation/review syntax, candidate geometry/risk tests, short-term shadow rules, Market Foresight metrics/horizon resolution, independent approval proof and legacy fixtures all passed. This verifies code syntax and existing regression coverage; it does not replace a live browser-to-Demo candidate-delivery test.


## Approval execution-price validation — isolated fix under review (2026-11-23)

- Created isolated branch `fix/approval-executable-price-validation` from main commit `67105b3bba6353c0b7f0e156cbf8cadbd255f9de`.
- Root cause confirmed in both the repository and deployed `create-mt5-approval` v22: the server compared the candidate entry to the live quote midpoint using one fixed 0.05% absolute-difference rule. That comparison was direction-blind and did not check whether the actual executable-side price still preserved the original stop/target geometry.
- Added shared pure helper `supabase/functions/_shared/approval-price.ts` and six deterministic regression tests. BUY uses Ask; SELL uses Bid. The helper preserves the original SL/TP (never moves protection to force a pass), checks the current price remains within the strategy's existing 0.75 x 15M ATR entry zone, rejects excessive spread widening, and requires the actual executable-side geometry to retain at least 1:2 and 1:3 reward/risk.
- Updated `create-mt5-approval` source on the branch to use the helper and save the validated executable-side quote as the queue's approved entry. Added structured non-secret diagnostics and CI execution of the new tests. The candidate proof, ten-minute age, fresh-quote, account, duplicate, manual-approval, and queue protections remain in place.
- This is source work only. It has **not** been merged or deployed; GitHub Actions must pass before review. It is not yet proven that the live EA execution-price guard accepts the same approved-entry semantics.
- Critical external dependency discovered: the deployed Demo `mt5-bridge` is v32 and its server execution gate is controlled by `MT5_EXECUTION_ENABLED`; the Demo MT5 EA source is not present in the repository tree. Existing Demo orders show that execution has worked previously, but the latest database failure on 2026-11-23 06:01 UTC reports `Market price moved beyond the approved entry limit.` The EA-side price guard must be inspected and tested against a fresh Demo quote before this change can be deployed.
- Latest Demo account snapshot available during this review: 2026-11-23 06:15:33 UTC, balance/equity 519.87, zero open positions, complete positions snapshot. This heartbeat is not current enough to certify the terminal is online now. Latest Real snapshot remains old and Real must remain read-only/hard-locked.
- No database schema, production monitor, execution switch, MT5 bridge deployment, EA binary, risk limits, or Real-account settings were changed. No trade was placed.
- Next gates: wait for CI on the PR; inspect the actual EA source/price guard; test a fresh candidate through dashboard approval and Demo execution; confirm broker ticket, position ID, SL/TP and close journal; verify live Cloudflare dashboard delivery. A live-money release is not authorized or ready on this evidence.


### Follow-up review — spread-aware baseline and MT5 EA guard (2026-11-23)

- Recovered the user's saved MT5 EA source from the Library. Stable `MktradehomeBridge_Demo_v2.21` and experimental `v2.22_open_positions` both contain the same 0.05% execution-time deviation guard. The v2.22 source also defaults to a 15-second polling interval. The EA source is not stored in the GitHub repository, and the active terminal version has not been confirmed in this session.
- Important correction to the first draft of the new server helper: comparing live Ask/Bid against an absolute 1:2/1:3 threshold would reject ordinary spread cost even when the quote had not moved. The helper now compares the live executable-side risk/reward with the original saved executable-side Ask/Bid baseline, which already includes normal spread. It permits favourable movement and only tolerates up to 2% relative deterioration from that baseline; the original engine's independent midpoint-based 1:2/1:3 proof check remains unchanged. It also keeps the 0.75 x 15M ATR structure boundary, spread-widening check, and original SL/TP levels.
- The Demo EA's 0.05% guard is retained as a second, post-approval broker-quote safety check. Because the server now stores the current executable-side Ask/Bid as the approved entry, the EA guard measures only movement between approval and the EA's actual order attempt. Do not remove this guard or change the EA polling interval until the active EA version and its behavior are verified.
- Expanded executable-price tests to eight cases, including unchanged spread-adjusted quote, favourable BUY/SELL movement, adverse BUY/SELL movement, entry-zone extension, spread widening and stop crossing. CI must be re-run on the latest branch commit before the source can be considered validated.
- No EA file was modified or installed; no MetaEditor compilation was possible in this environment. The Demo EA source version active in the user's MT5 terminal remains to be confirmed. No production Edge Function was deployed and no live or Demo order was placed by this code work.


### Approval-price fix — merged and deployed to Demo approval endpoint (2026-11-23 09:38 UTC)

- PR #7 was merged to `main` after CI passed. Merge commit: `f37d8bdc604ee3076bc0d61b217d427ee9729c94`.
- GitHub Actions run `45148510052` completed SUCCESS. The new executable-price suite ran all 8 tests: 8 passed, 0 failed. Production/shadow Edge Function type-checks and all existing regression suites also passed.
- Deployed only `create-mt5-approval` to Supabase as ACTIVE v23. Retrieved deployed source confirms the new executable-side validation helper is present and the old fixed 0.05% midpoint rule is absent. The function retains its existing custom dashboard-user authentication (`verify_jwt=false)); no auth mode change was made.
- The server now uses Ask for BUY and Bid for SELL, checks the current quote against the saved executable-side quote baseline, preserves original SL/TP, maintains the 0.75 x 15M ATR structure boundary, rejects excessive spread widening, and blocks materially weakened spread-adjusted risk/reward. It saves the validated executable-side quote as the queue entry so the EA's existing 0.05% broker-side guard is a second check from approval to actual execution.
- No changes were made to `market-monitor` v68, `mt5-bridge` v32, `mt5-real-bridge`, Real approval v3, the Demo execution environment switch, EA source/binary, database schema, or Real-account hard lock. No order was placed by deployment.
- Cloudflare's branch preview check succeeded for the PR. Since the merged changes are backend function/helper and documentation files (not dashboard HTML), this does not itself certify a new production dashboard UI deployment.
- Remaining verification: the saved EA v2.21 stable / v2.22 experimental sources both retain the 0.05% final execution-time guard. Confirm which version is actually active, confirm a fresh Demo MT5 heartbeat, and run one fresh manual approval through the EA. Latest recorded Demo heartbeat remains 2026-11-23 06:15:33 UTC (balance/equity 519.87; zero positions; complete snapshot), so terminal connectivity is not currently certified fresh. Real account remains read-only/locked.
- Live-money readiness is still NOT approved. The v23 deployment is ready for controlled Demo verification only.


## Four-market coverage and signal-frequency investigation — 2026-11-23

**Outcome: no production fix justified by the evidence reviewed.** This was a read-only diagnostic; no signal thresholds, risk controls, scheduler settings, Supabase functions, approvals, or trade execution paths were changed.

- All four configured markets remain active: BTCUSD, EURUSD, XAUUSD, USDJPY.
- The production `market-monitor` Edge Function was ACTIVE at version 68. The `mktradehome-market-monitor` pg_cron job was active on `*/5 * * * *`; the latest observed run at 09:55 UTC succeeded. The database reported 288 successful runs in the preceding 24 hours and zero failures.
- The 09:55 UTC scan logged all four symbols and fetched the four required timeframes (5M, 15M, 1H, 4H) for each. Latest market-intelligence snapshots for all four symbols were saved at approximately 09:55 UTC with fresh quotes (about 1–2 seconds old).
- At that scan, BTCUSD was blocked by strong 5M opposition to its 1H BUY bias (5M score -49); EURUSD had a 1H BUY bias but a strong 15M pullback (score -41); XAUUSD lacked a valid 1H SELL bias because the directional score conflicted (+22); USDJPY likewise lacked a valid 1H SELL bias because its directional score conflicted (+35). These were WAIT outcomes, not missing-market scans.
- The latest recorded BUY/SELL candidates before that scan were BTCUSD #899 at 09:50 UTC and EURUSD #894 at 08:45 UTC. XAUUSD and USDJPY have older candidate history, but were still being scanned and their market context was refreshed.
- Dashboard source confirms all four symbols are present in the market list and market-intelligence view. It intentionally displays WAIT when no current verified BUY/SELL candidate exists; the scanner status view also distinguishes scheduler health from signal count.
- The unified GOOD AND CLEAR / NORMAL classification is applied only after the common candidate validation path passes. No evidence from this investigation supports relaxing that classifier or the entry gates.

**Decision:** Do not force signals or loosen filters. The observed two-market signal mix is currently explained by the strategy's multi-timeframe entry rules, not by a demonstrated market-exclusion or scheduler failure. Continue monitoring fresh scans; reopen the investigation if any market stops receiving fresh snapshots, the 5-minute scheduler heartbeat goes stale, or logs show provider/data errors.

**Verification boundary:** This confirms scanner execution, market data retrieval, analysis snapshot writes, and the recorded rejection reasons at the reviewed time. It does not establish future market opportunities, profitability, or end-to-end broker execution readiness. Demo-first and manual approval remain mandatory.


## Manual Trade Approval Centre refresh control (2026-11-23)
- Added a visible circular refresh-arrow control beside the Trade Approval Centre heading.
- Manual refresh reloads the saved verified candidate feed and live quotes, then rerenders the approval cards and status timestamp. It does not create, approve, reject or execute a trade.
- Existing automatic candidate polling remains in place. Server-side live executable-price validation, expiry, account binding, manual confirmation and independent safety switches are unchanged.
- Refresh failures are reported in the approval status area; the control disables and spins while refreshing.
- Dashboard change committed separately from all trading-engine and approval safety logic.


## Private in-app notification and activity centre — 2026-11-23
- Added a signed-in dashboard Alerts control with unread count and a dedicated activity panel; it is available without opening Telegram.
- The feed reads the signed-in user's existing `trade_alerts`, `trade_signals`, and `trades` records, merges them chronologically, and provides All, Unread, Signals, and Trade Alerts filters.
- Unread state is sourced from `trade_alerts.is_read`; the user can mark an alert read. Signal and trade history are read-only. The feature does not create, approve, reject, modify, or execute trades.
- No database schema, RLS policy, Edge Function, Telegram integration, signal engine, risk control, MT5 bridge, or Real-account lock was changed.
- Verification in this commit is source-level only. A live signed-in browser check is still required to confirm the current user's RLS policies permit all three read queries and alert read-state updates. If a table query is denied, do not weaken RLS; diagnose and add a narrowly scoped policy only after inspecting existing policies.


## Exness-style live position display — 2026-11-23
- Updated the Live Market Chart to read the authenticated `mt5-bridge?action=dashboard_snapshot` response in addition to the separate pending execution queue.
- The chart now renders broker-reported open positions separately from pending setups, including side, volume/lot size, entry, current MT5 price, broker-reported floating P/L, SL, TP, distance to TP, swap, ticket and opened time. It draws entry/SL/TP/current-price reference lines for open positions matching the selected chart symbol.
- Position symbols are normalized for common broker suffixes (for example `BTCUSDm` maps to `BTCUSD`) for chart matching only; the original broker symbol remains the source record.
- Position display requires a matching account/server and `positions_complete=true`. Incomplete snapshots are not treated as proof of no open positions. Stale snapshots are labelled as last-reported, not live. Real account mode remains read-only; no approval or execution behavior was changed.
- Refresh polls the snapshot alongside the existing pending queue. Floating P/L is taken from the broker snapshot `profit` field, not estimated from chart candle prices.
- Verification in this session: confirmed the current Demo snapshot table contains a complete snapshot with two BTCUSDm BUY positions (0.01 lot each), broker P/L +0.43 and +0.53 USD at capture time. This is a historical database snapshot, not a claim that those positions remain open now. Source edits were reviewed for required guards; automated browser/MT5 end-to-end tests have not yet been run.

- Final dashboard polish saved in `index.html` commit `bf22bad41543b55a4209f67a4bbd8b4147200d8f`; open-position cards now explicitly show `OPEN`, and a pending-queue read failure no longer suppresses a successfully retrieved broker position snapshot.

- Final isolation hardening saved in `index.html` commit `633985a7150783c71b9bbe07e8dcf29264241d6c`: a pending-queue request failure (including a rejected network request) cannot prevent a successful broker position snapshot from rendering.


## Live position card sizing refinement — 2026-11-23
- Reduced the open-position card padding, gaps and metric label/value sizes. Floating profit/loss display reduced from 20px to 16px while retaining bold green/red contrast and all position details.
- No data, account, chart, strategy, risk, or execution behavior changed.


## Integrated Trading Intelligence Hub — 2026-11-23

- Developed on `feature/integrated-trading-intelligence-hub` and merged to `main` through PR #8. Squash merge commit: `6f3a2114e213be5af30ab6a9f252b592711e9b93`. Cloudflare production deployment has not yet been independently verified.
- Added a single dashboard overview card connecting four existing capabilities: MT5 open-position monitoring, per-market closed-trade performance, unread in-app alert count, and a compact recent closed-trade journal.
- Reads are authenticated and explicitly scoped to the current user's `user_id`. Trade history is additionally scoped to the selected MT5 account server and, for Demo, the configured Demo account number. Real-account history is server-scoped and remains view-only.
- Market performance uses only recorded closed trade rows; the card shows closed-trade count, net recorded P/L, and signal count over the preceding seven days for BTCUSD, EURUSD, XAUUSD, and USDJPY. It does not treat signal counts as quality or profitability.
- Floating P/L and open-position count are displayed only when the existing MT5 position feed reports a complete, fresh snapshot for the currently selected account. Otherwise the hub withholds the figure and states that MT5 verification is pending.
- The recent journal is read-only. Unread alert count is read-only; existing notification-centre controls remain the only place to mark an alert read.
- Refreshes on dashboard entry and every 60 seconds. No database schema, RLS policy, Edge Function, signal engine, strategy threshold, lot size, stop/target, approval rule, MT5 bridge, execution switch, or account lock was changed.
- Source checks performed: verified insertion points, authenticated user scoping, selected-account filters, four-market mapping, complete/fresh snapshot gate, and no write operations in the new hub. Supabase schema was inspected read-only; `trades` currently has recorded CLOSED rows.
- **Verification:** all three inline JavaScript blocks passed syntax parsing; GitHub Actions run `45167543246` completed successfully, including the dashboard inline-JavaScript syntax check and existing engine/approval tests. Authenticated live dashboard verification, fresh MT5 snapshot verification, and Cloudflare deployment confirmation remain outstanding.
- The dashboard card is a first integrated overview, not a replacement for the existing detailed chart, market analysis, approval centre, or notification panel. Further work should connect lifecycle events (approval, execution, TP/SL and close outcomes) to a safe user-scoped event feed without exposing MT5 queue tables or weakening RLS.

- Follow-up refinement: the hub also calculates account-scoped closed-trade win rate and profit factor, and orders journal records by opened time so null close timestamps cannot crowd out completed history. These are descriptive historical metrics only.


## Live EUR/USD approval-to-broker verification — 2026-11-23 12:00–12:03 UTC

- Read-only verification of the user's manually approved EUR/USD GOOD AND CLEAR SELL candidate. Signal #909 was generated at 12:00:05 UTC with rule quality score 85/100 (not a win probability); the stored analysis records all-four-timeframe EMA alignment, strong 4H/1H/15M directional scores, and 5M confirmation.
- Manual approval was recorded at 12:00:20 UTC. The Demo MT5 queue changed to `executed` at 12:00:31 UTC. Broker confirmation returned retcode 10009, symbol EURUSDm, SELL 0.01 lot, fill 1.09610, and position ID 595355103.
- The latest complete Demo account snapshot at 12:03:18 UTC independently showed the same EURUSDm SELL position ID 595355103 open at 0.01 lot, entry 1.09610, SL 1.09693, TP 1.09426, current price 1.09616, and broker-reported floating P/L -$0.06 at capture time. This is a timestamped observation, not a guarantee of the position's status after that snapshot.
- Supabase logs from 11:58–12:05 UTC show the live dashboard origin `https://mktradehome.pages.dev/` successfully requesting authenticated trade signals, account/position snapshot, trade queue, trade records, alerts and scan status. The sampled requests returned HTTP 200; the deployed `mt5-bridge` was ACTIVE v32 and the approval endpoint ACTIVE v23.
- The dashboard source on main contains the Trading Intelligence Hub, in-app activity centre, manual approval refresh control and broker-position display. The Hub and activity-centre reads are account/user-scoped and read-only. This session's successful API logs support backend integration, but no direct browser visual inspection was available.
- Reconciliation note: no `trades` journal row was present yet for position ID 595355103 at the time of this check. The Hub's closed-trade performance/journal is based on recorded `trades` rows; verify that this position is recorded correctly after it closes. Do not insert or fabricate a journal row, expose the MT5 queue to the browser, or weaken RLS to work around this.
- No source, database, strategy, risk, account mode, execution switch, approval rule, or open trade was changed during this investigation. The current position was left untouched. Demo-first and manual approval remain mandatory.


## Research review: reliability improvements, not an accuracy promise — 2026-11-23

- Reviewed current research on cost-aware ML trading, intraday strategy evaluation, LLM strategy-search leakage/overfitting, and official MetaTrader 5 forward-testing guidance.
- Key conclusion: do not target or advertise 99% win accuracy. A high directional hit rate is neither guaranteed nor sufficient for profitability; spread, commission, slippage, payoff asymmetry, drawdown, regime shifts and overfitting matter.
- Candidate future work, to be tested separately before any production integration:
  1. Add a cost-aware expected-move gate using current executable-side spread and realistic slippage assumptions. Reject setups whose expected net reward does not clear costs and minimum net R:R. Do not relax current approval executable-price deterioration guard.
  2. Build chronological walk-forward evaluation per symbol and combined portfolio, with untouched out-of-sample periods. Track all experiment trials and avoid selecting only the best historical parameter set.
  3. Report expectancy, profit factor, max drawdown, recovery factor, Sharpe/Sortino where statistically meaningful, win/loss size, exposure, costs and confidence intervals alongside win rate.
  4. Segment results by market regime, session, volatility and symbol; verify whether any edge survives different conditions rather than assuming one model fits all.
  5. Reconcile each MT5 execution and closure to one immutable trade-journal lifecycle record, including broker ticket/position ID, fill, costs, SL/TP changes, close reason and realized P/L. Preserve server-side user scoping and RLS; never expose service-role or queue tables to the browser.
  6. Keep the current unified signal engine, GOOD AND CLEAR / NORMAL labels, WAIT behavior, manual approval, Demo-first process, fixed risk controls and real-account read-only lock. No new model, indicator, threshold, market, or execution behavior is authorized by this research note.
- Sources reviewed: MetaTrader 5 official Strategy Optimization and Forward Testing documentation; 2026 studies on transaction-cost-aware walk-forward ML trading, intraday ML evaluation with trading frictions, and leakage-aware LLM strategy discovery. Research findings are hypotheses and evaluation guidance, not proof of an edge in Mktradehome.
- No code, database, deployed function, strategy parameter, risk setting, account mode or open trade was changed as part of this review.


## Market reliability and AI-platform review — 2026-11-24 (isolated audit branch)

- Created docs/MKTRADEHOME_RELIABILITY_AUDIT_2026-11-24.md on audit/2026-11-24-market-reliability.
- Read-only production review found all four configured markets were scanned with fresh quotes and correctly spaced candles at the reviewed 21:20–21:25 UTC runs. At 21:25, EURUSD BUY, XAUUSD SELL and USDJPY BUY candidates passed; BTCUSD correctly returned WAIT because 5M momentum strongly opposed the SELL bias. The preceding 21:20 scan logged candidates for all four.
- Recent 24-hour signal rows existed for all four symbols. Counts are not unique opportunities or proof of performance; repeated-signal churn and dashboard filtering need separate analysis.
- Confirmed the engine's timeframe BUY/SELL/WAIT state is stricter than its EMA/directional-score candidate logic. The classifier uses EMA alignment and scores rather than the timeframe signal field, so the GOOD AND CLEAR reason can imply stronger confirmation than the implemented test. Correct wording and add explicit tests in isolation before considering production changes.
- Reviewed TrendSpider Sidekick, Trade Ideas Holly/OddsMaker and Capitalise.ai for transferable design patterns: multi-timeframe scans, chart context, event-based backtesting, cost-aware strategy comparison, risk-aware exits and forward simulation. Do not copy marketing accuracy claims or treat these products as proof of profitability.
- Next isolated work: explain dashboard signal visibility, measure signal churn/expiry/approval/execution by symbol and class, reconcile requested entry to broker fill and close, then run chronological cost-aware walk-forward tests.
- No production code, database rows, deployed functions, signal thresholds, strategy settings, risk controls, account settings, approvals, queue items or trades were changed. Demo-first, manual approval, 0.01-lot cap and Real-account hard lock remain unchanged.
- Dashboard source follow-up confirmed that market cards default to monitor-only WAIT and separately restore only independently verified candidates from the last 10 minutes that remain within 0.25R of current price. Fewer than four actionable cards can therefore be correct even while all four markets scan. Recommended dashboard clarity improvement: persist four market rows and separate scan health, market bias, setup state, candidate expiry and WAIT reason. No UI code changed.
