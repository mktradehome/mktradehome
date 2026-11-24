# External trading-system research notes — 2026-11-24

## Purpose
Capture transferable research and testing practices from established trading platforms and technical literature for Mktradehome. This is research guidance, not a strategy change or a claim that any external product is profitable.

## Findings from established systems

### MetaTrader 5 Strategy Tester
Official MT5 documentation describes:
- Real-tick testing as the closest available historical simulation to broker conditions; spreads can vary within a minute.
- Trading on Bid/Ask sides even when chart data is displayed using another price basis.
- Configurable commission, margin and account conditions.
- Random or fixed execution delays and requote simulation.
- A forward period separated from the earlier test/optimization period to check whether selected settings survive unseen later data.

Sources:
- https://www.metatrader5.com/en/terminal/help/algotrading/testing
- https://www.metatrader5.com/en/terminal/help/algotrading/tick_generation
- https://www.metatrader5.com/en/automated-trading/strategy-tester

**Mktradehome implication:** our current shadow replay based on rolling OHLC candles, bid=ask assumptions and unmodelled commission/swap/slippage is useful for checking logic, but it is not yet an execution-realistic profitability test. Where broker tick history is unavailable, label the limitation and use conservative cost/slippage scenarios rather than describing the replay as live-like.

### Strategy research and backtest overfitting
Bailey, Borwein, López de Prado and Zhu's *The Probability of Backtest Overfitting* explains why ordinary holdout testing can be unreliable after many strategy configurations have been tried. Their work proposes a framework to estimate the risk that a selected backtest result is overfit. Related research warns that trying more configurations increases the chance of finding an attractive result by chance.

Sources:
- https://escholarship.org/uc/item/4w1110bb
- https://papers.ssrn.com/sol3/papers.cfm?abstract_id=2308659
- https://link.springer.com/article/10.1007/s10462-022-10226-0

**Mktradehome implication:** keep a trial ledger of every tested strategy idea, parameter set, symbol, timeframe and date range. Freeze the rules before evaluating a genuinely untouched chronological period. Do not repeatedly tune against the same holdout. A positive backtest is not proof of a durable edge.

### Transferable product patterns
- TrendSpider Sidekick: multi-timeframe research, scan building, strategy development, backtesting, trade/drawdown inspection and comparison across symbols/timeframes.
  - https://trendspider.com/product/sidekick-ai-trading-assistant/
  - https://trendspider.com/product/strategy-development-and-backtesting-tools/
- Trade Ideas Holly/OddsMaker: live market scans and alerts paired with event-based historical testing and explicit risk/exit modes. Its main focus is US equities, so its signals/data assumptions should not be transplanted into FX/crypto.
  - https://www.trade-ideas.com/ai-trading-assistant/
  - https://www.trade-ideas.com/hollyguide/AI_Risk_Mode.html
- Capitalise.ai: readable rule-based entry/exit conditions, historical backtesting and live simulation.
  - https://support.capitalise.ai/en/articles/2164262-about-capitalise-ai

**Mktradehome implication:** borrow the workflow patterns—clear rules, explainable setup evidence, historical event review, risk-aware exits and forward simulation—not proprietary code, signals or marketing claims.

## Research principles to adopt

1. **One source of truth for each trade lifecycle.** Preserve signal ID, strategy/version, symbol, direction, generated time, expiry, approved quote, requested entry, broker fill, spread, commission, swap, stop/target changes, close fill, close reason and realized P/L. Never overwrite requested entry with actual fill.
2. **Executable-side pricing.** Evaluate buys against Ask and sells against Bid at entry, and the opposite side at exit. Include spread at the moment of execution, not a fixed idealized zero spread.
3. **Cost-aware outcomes.** Report gross and net P/L separately. Calculate R from actual broker fill and initial risk, with costs included in net results. If required contract/tick-value data is missing, mark R unavailable instead of guessing.
4. **Chronological evaluation.** Use a development period, rolling walk-forward periods and a final untouched out-of-sample period. No future candles, no same-candle look-ahead, and no random shuffling of time-series observations.
5. **Full experiment accounting.** Log every tested variation and why it was tested. Do not report only the best configuration. Avoid repeated tuning on the final holdout.
6. **Robustness, not a single score.** Report trade count, net expectancy in R, profit factor, max drawdown, average win/loss, tail loss, consecutive losses, exposure, costs and uncertainty. Segment by symbol, session and volatility/regime only when sample sizes support it.
7. **Abstention is a valid decision.** Preserve WAIT when evidence is conflicting, stale, costly to execute or statistically unsupported. Never loosen entry gates just to make the dashboard look active.
8. **Shadow before production.** New filters, forecasts, classifiers and exit logic must run separately, be compared on identical data, and pass code, data-integrity and forward Demo checks before any promotion review.

## Mktradehome-specific gaps to close

- The existing historical replay uses completed OHLC candles and next-bar entry logic, which is a good anti-look-ahead foundation, but it does not yet have historical bid/ask spread, commissions, swap, slippage or real tick-level sequencing. Its current gross results must not be interpreted as expected net trading performance.
- The Market Foresight baseline is an uncalibrated statistical scenario generator, not a proven predictive model. Keep its probabilities unavailable until calibration and independent outcome validation justify them.
- The current GOOD AND CLEAR / NORMAL labels are rule-quality categories, not calibrated win probabilities. Preserve the single engine and explain exactly which evidence supports each label.
- The small recent live-trade sample is not enough to retune thresholds. First reconcile broker fills and closes, then collect a larger, representative sample.

## Proposed order of work

1. Reconcile the existing Demo trade lifecycle and calculate verified broker-fill-based outcomes.
2. Audit signal duplication, flips, expiry, approval and execution rates by market and quality label.
3. Add a shadow-only cost model with documented spread, commission, swap and slippage assumptions; compare conservative/base/stress cases.
4. Extend historical coverage and verify data provenance/cadence before running longer chronological replay.
5. Compare the current strategy with isolated challenger hypotheses on identical data.
6. Forward-test frozen candidates in Demo and report uncertainty; do not promote based on a short winning streak.
7. Only then consider a separately reviewed production change.

## Safety boundary
No production code, database rows, deployed functions, strategy parameters, signal thresholds, account settings, risk controls, approvals, queue items or trades were changed by this research. Manual approval, Demo-first testing, 0.01-lot cap and Real-account hard lock remain unchanged.
