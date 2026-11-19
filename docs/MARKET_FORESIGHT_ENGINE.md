# Mktradehome Market Foresight Engine — Research & Build Contract

**Status:** Phase A foundation and Phase B statistical baseline deployed in shadow mode; not yet calibrated or proven to forecast profitably.  
**Principle:** Forecast probabilities, never pretend to know the future. Never manipulate markets or fabricate certainty.

## 1. Product ambition

Mktradehome should become a disciplined market-intelligence and forecasting assistant for BTCUSD, EURUSD, XAUUSD and USDJPY. It should continuously observe market data, estimate plausible future paths, identify when the evidence gives a tradable advantage, and explain when the best decision is to wait.

The system can analyse and forecast markets; it cannot control, manipulate, or guarantee the behaviour of external markets. “Best possible outcome” means improving decision quality under uncertainty, not promising profit.

## 2. Separate five layers

1. **Observation:** timestamped bid/ask, spread, OHLCV/candles, market session, volatility, data source and freshness. Preserve raw source data and detect gaps/outliers.
2. **Context:** multi-timeframe trend, range/trend regime, volatility regime, support/resistance zones, momentum, liquidity/session context and scheduled event risk where reliable event data exists.
3. **Forecast:** produce calibrated distributions/scenarios for explicit horizons (15m, 1h, 4h, 1d where sufficient data supports them). Estimate probability of up/down/sideways, expected return, volatility/range, and probability of reaching specified barriers before stop/time expiry.
4. **Decision:** convert forecasts into BUY/SELL/WAIT only when expected value remains positive after spread, commission, slippage assumptions and risk constraints. If uncertainty or data quality is poor, WAIT.
5. **Execution & review:** manual approval and Demo-first execution controls remain separate. Record forecast, inputs, decision, actual outcome and costs for unbiased evaluation.

## 3. Forecast outputs — no fake precision

Every forecast record must include:
- symbol, generated_at, source timestamps and data age;
- horizon and forecast expiry;
- directional probabilities that sum to 100% (UP / DOWN / SIDEWAYS);
- expected return and a prediction interval, not a single guaranteed future price;
- expected volatility / likely price range;
- scenario levels and conditions that invalidate each scenario;
- estimated probability of TP before SL for the proposed setup;
- spread/cost assumptions and net expected value;
- model version, feature version, training window and confidence/calibration status;
- explanation of the strongest supporting and opposing evidence.

Do not call a technical quality score a probability. Do not display a numeric probability until it has been calibrated and validated on unseen, time-ordered data. Until then, show qualitative scenarios and mark probability as “not yet calibrated”.

## 4. Model research path

Start with transparent baselines before complex AI:
- naïve/random-walk and volatility-only baselines;
- trend/momentum and mean-reversion baselines;
- regime-conditioned statistical forecasts;
- only then evaluate ML models against the same chronological test sets.

Candidate features may include lagged returns, realized volatility, ATR, EMA slopes/relationships, RSI, MACD, candle structure, spread, session, volatility regime and cross-timeframe alignment. Any future external data (news, macro calendar, order book) must carry provenance, timestamp and missing-data handling. Never imply order-book depth exists if only retail quote candles are available.

Use time-series walk-forward validation with strict separation of train, validation and untouched test windows. Apply purging/embargo where labels overlap. Prevent look-ahead, survivorship, leakage, and tuning against the final test period. Compare every model to simple baselines.

## 5. Outcome labels and realistic testing

For each forecast horizon, store the future realized mid-price return and realized high/low range. For trade setups, use barrier outcomes (TP first, SL first, neither before expiry) with executable-side bid/ask prices. Model spread, commission, swap, slippage, rejected orders and market closures where data permits. If costs are unavailable, label results gross and do not describe them as net performance.

Report at minimum:
- Brier score and log loss for probabilities;
- reliability/calibration plots or tables by probability bucket;
- directional accuracy, balanced accuracy and confusion matrix;
- MAE/RMSE for return or price-range forecasts (with clear scale);
- TP-first/SL-first rates and average R;
- expectancy after costs, profit factor, drawdown and trade count;
- performance by symbol, horizon, session and volatility regime;
- confidence intervals and sample size.

A model is not promoted because it wins on one small sample. Require repeated walk-forward performance, stable calibration, adequate sample size, and positive net expectancy after realistic costs. Freeze the evaluation protocol before comparing versions.

## 6. Risk and governance

- Preserve V63 production rules and V100 shadow isolation until a new model passes validation and receives explicit approval.
- No strategy threshold may be weakened merely to increase signal frequency.
- Manual trade approval remains mandatory; no autonomous live order execution.
- Demo first. Real account stays locked/read-only until separately verified and explicitly authorized.
- Keep hard position sizing, stop-loss, max daily loss, max exposure and stale-data blocks.
- Forecast uncertainty must widen or the engine must abstain during data gaps, abnormal spreads, news shocks or unfamiliar regimes.
- Log every forecast including WAIT decisions so evaluation avoids selection bias.
- No market manipulation, spoofing, coordinated activity or attempts to move prices.

## 7. Data requirements and current limitation

The current V100 shadow function is a read-only copy of the V62 strategy helper logic, not a new predictive model. Current rolling BiQuote candle limits are insufficient for robust long-horizon model training and a long backtest. Build a timestamped, quality-checked historical archive before claiming long-term predictive performance. Do not synthesize missing candles.

The current MT5 bridge also lacks broker-confirmed live open-position snapshots; that remains a separate integration milestone documented in `docs/MT5_POSITION_REPORTING.md`.

## 8. Delivery phases

**Phase A — Measurement foundation (partially deployed):** the `market-foresight` function archives validated completed candles and saves forecast/outcome records. Data-quality validation covers timestamp freshness, OHLC geometry and cadence. Continuous archive coverage still depends on the dashboard being open and the scan succeeding.

**Phase B — Baseline forecasting (deployed v0.1):** recent 5M log-return drift and volatility generate 15M/1H/4H expected-price scenarios and normal-assumption intervals. Directional labels remain qualitative; probabilities are withheld until calibrated. The function is authenticated, shadow-only and does not create approvals or trades.

**Phase C — Evaluation:** run chronological walk-forward tests, calibration reports, cost-aware barrier simulations and regime breakdowns. Compare against simple baselines.

**Phase D — Decision layer:** only after evidence, combine calibrated forecasts with existing V63/V100 rule gates. Forecast is an additional evidence layer, never a reason to bypass hard risk checks.

**Phase E — Demo monitoring:** run shadow forecasts alongside Demo outcomes for a sustained period; measure drift and calibration. Promote only after documented acceptance criteria and explicit approval.

## 9. Acceptance criteria

The Foresight Engine is not “done” until:
- every output is reproducible from stored input data and model version;
- stale/missing/outlier data causes safe abstention;
- probability calibration is demonstrated on untouched chronological data;
- net performance includes realistic execution costs or is clearly marked gross;
- reports include sample size and uncertainty;
- it beats simple baselines consistently on pre-agreed metrics;
- no production approval, queue or execution path can be triggered by shadow forecasts;
- all changes are tested, reviewed, documented and committed.

**North star:** be early when evidence supports it, be honest when it does not, and protect capital when the market is unclear.


## Deployed baseline implementation notes (2026-11-19)
The first live implementation is `supabase/functions/market-foresight/index.ts`, Supabase function version 3. It archives up to 240 completed candles per symbol/timeframe from BiQuote and records three forecast horizons per market. The dashboard invokes it at sign-in and every five minutes while open. Matured forecasts are evaluated on later scans against the archived 5M bars.

This is a measurement and baseline layer, not the final intelligence system. The interval relies on a normal-return assumption and has not been empirically calibrated. The forecast is not connected to BUY/SELL approvals. The next release must add robust regime/context features, baseline-vs-baseline walk-forward evaluation, cost-aware barrier labels, and data-coverage monitoring before any numeric probability is displayed.
