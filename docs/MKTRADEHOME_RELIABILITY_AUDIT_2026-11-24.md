# Mktradehome market reliability and signal-quality audit — 2026-11-24

## Scope and safety
Read-only review of production market data, market-monitor v68 source, recent scan logs, signal records, classification logic, existing project documentation, and external AI trading-platform capabilities. No production code, Supabase data, deployed function, strategy parameter, risk control, account setting, approval, queue item, or trade was changed. No trade was placed or managed.

Demo-first, manual approval, 0.01-lot maximum, and Real-account hard lock remain mandatory.

## Current four-market health
At the 2026-11-24 21:25 UTC scan:
- The production monitor logged a completed scan for BTCUSD, EURUSD, XAUUSD and USDJPY.
- The 5-minute, 15-minute, 1-hour and 4-hour candle requests returned the expected interval cadence for all four symbols.
- The latest quote archive rows were 0–20 seconds old, with no stale rows in the inspected 24-hour sample.
- The market-analysis snapshots were updated at approximately 21:25 UTC for all four symbols.
- The 21:25 scan had EURUSD BUY, XAUUSD SELL and USDJPY BUY candidates; BTCUSD was held at WAIT because 5M momentum strongly opposed its SELL bias (5M directional score +45). The preceding 21:20 scan logged directional candidates for all four markets.

Recent 24-hour saved signal counts:
- BTCUSD: 42 SELL
- EURUSD: 9 BUY and 27 SELL
- XAUUSD: 43 SELL
- USDJPY: 22 BUY and 26 SELL

These are saved signal rows, not unique independent market opportunities and not a count of profitable trades. Repeated signals and direction changes need a separate churn/duplicate analysis.

**Finding:** The recent only-two-markets impression is not explained by a missing symbol, stale quote, or absent candle feed in the inspected scan. All four markets are being scanned and all four have recent saved signal rows. The dashboard's latest-candidate filtering, expiry, duplicate suppression, and presentation should be checked against the underlying records to explain what the user sees.

## Signal engine findings
The production market-monitor source is a rule-based technical engine, not a GPT signal generator. Its common candidate path:
1. Requires a fresh quote and open market.
2. Uses 1H EMA direction plus a minimum directional score to establish bias.
3. Allows 4H neutrality but rejects strong 4H opposition.
4. Requires compatible 15M EMA structure or a defined pullback reversal.
5. Rejects strong 5M opposition.
6. Rejects extended entries and invalid ATR/spread-derived risk geometry.
7. Creates an unapproved candidate with a 10-minute expiry; manual approval remains separate.

The per-timeframe BUY/SELL/WAIT field is stricter than the candidate-direction score: it also requires RSI to be inside a narrow band and MACD histogram to agree. Consequently a timeframe can display WAIT while its EMA/score evidence still contributes to a candidate. This is a meaningful dashboard/wording distinction, not proof by itself that the candidate is invalid.

The classifier receives EMA alignment and directional scores, not the timeframe signal field. GOOD AND CLEAR therefore means the defined EMA/score confluence passed; it does not mean every timeframe's stricter signal field equals BUY or SELL. The current explanation text can be read more strongly than the actual condition. Add tests and revise wording in an isolated branch before any production integration.

The quality score is a rule-based heuristic, not a win probability. Do not display it as an accuracy percentage.

## Key work still required before strategy changes
1. Explain the user's dashboard view by comparing current candidate rows, expiry, duplicate suppression, and the exact dashboard queries/filters.
2. Measure signal churn: repeated same-direction candidates, fast BUY/SELL flips, expiry rate, approval rate, execution rate, and close outcomes by symbol and class.
3. Reconcile intended/approved entry with broker-confirmed fill and close price for every Demo trade. Preserve both requested and actual fill prices; do not overwrite historical rows.
4. Replay historical candles using next-bar executable-side entries, realistic spread, commission, swap and slippage. Report expectancy in R, profit factor, maximum drawdown, average win/loss, consecutive losses, sample size and confidence intervals.
5. Use chronological walk-forward and untouched out-of-sample periods. Do not tune rules to the ten-trade loss sample or select a strategy solely because it wins in-sample.
6. Keep candidate ideas (including regime filters, session filters, cost-aware expected-move checks, and calibrated probability models) in a separate shadow experiment. Do not relax existing entry or risk gates to increase signal count.
7. Improve dashboard transparency: show each market's data freshness, directional bias, timeframe state, developing setup, exact WAIT/rejection reason, candidate expiry, executable entry/SL/TP, estimated cost and approval state separately.

## External platform research: useful patterns, not promises
- TrendSpider Sidekick describes a workflow for researching charts, building multi-timeframe scans, developing strategies, backtesting, inspecting individual trade behavior/drawdown, and evaluating models on data separate from training. Its strategy tools compare across symbols/timeframes and include trading-cost analysis. Sources: https://trendspider.com/product/sidekick-ai-trading-assistant/ and https://trendspider.com/product/strategy-development-and-backtesting-tools/
- Trade Ideas Holly combines live scans/alerts and chart context with OddsMaker event-based historical testing. Its risk-mode documentation distinguishes stop, target, profit-save, reduce-risk and timed exits. These are useful design patterns, but its focus and data are primarily US equities and are not a drop-in forex/crypto system. Sources: https://www.trade-ideas.com/ai-trading-assistant/ and https://www.trade-ideas.com/hollyguide/AI_Risk_Mode.html
- Capitalise.ai demonstrates readable rule-based entry/exit automation, historical backtesting and live simulation. This is a useful example of explicit rules and consistent execution, not evidence that automation itself creates an edge. Source: https://support.capitalise.ai/en/articles/2164262-about-capitalise-ai

The best transferable lesson is not to copy another AI's BUY/SELL calls. It is a closed research loop: scan → explain evidence → test historical outcomes → simulate forward → compare actual broker fills/results → revise only after out-of-sample evidence.

## Decision
No production fix is justified from this read-only review alone. Keep the existing production engine and all protections unchanged while the next isolated work item focuses on dashboard-vs-database signal visibility, signal churn, classifier wording/tests, and broker-fill reconciliation. No profitability claim is made.

## Dashboard candidate visibility follow-up

- Inspected the production dashboard source. Its market-analysis cards are intentionally monitor-only and default to WAIT; they do not create independent signals. The dashboard separately restores only saved, independently verified BUY/SELL candidates from the last 10 minutes, checks proof metadata and current quote proximity (within 0.25R), and displays those candidates. This explains why the four markets can all be scanned while fewer than four show a current actionable signal at any moment.
- The 10-minute candidate expiry and current-price proximity check are deliberate safety filters, not evidence of missing symbol coverage. The dashboard's Market Intelligence panel is separate from its actionable candidate feed; the user-facing UI should make that distinction clearer.
- No dashboard code was changed. Recommended UI improvement: show four persistent market rows with separate columns for scan/data health, market bias, setup state, actionable candidate/expiry, and exact WAIT reason. This improves visibility without manufacturing more trades or weakening gates.
