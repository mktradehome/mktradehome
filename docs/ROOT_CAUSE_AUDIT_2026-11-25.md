# Mktradehome root-cause audit — 2026-11-25

## Scope and safety

This is a read-only audit of the Demo trading journal, saved signal evidence, deployed Edge Function versions, and the isolated historical replay code. The only code changes in this branch are to the isolated V100 backtest-shadow exit accounting and deterministic tests. No production signal logic, Supabase data, deployed function, approval, queue item, account setting, risk control, or trade was changed.

Demo account: 486163696 on Exness-MT5Trial10.

## Verified Demo performance

The current journal contains 33 closed trades with recorded P/L of +$0.87:
- 14 wins and 19 losses (42.4% win rate).
- BTCUSD: 12 trades, 6 wins / 6 losses, +$7.86, profit factor 1.31.
- EURUSD: 11 trades, 5 wins / 6 losses, +$1.56, profit factor 1.27.
- USDJPY: 5 trades, 0 wins / 5 losses, -$3.68.
- XAUUSD: 5 trades, 3 wins / 2 losses, -$4.87, profit factor 0.85.

Gold illustrates why win rate alone is misleading: its average recorded win is +$9.34 while its average recorded loss is -$16.45. The two latest Gold losses were -$14.95 and -$17.95. USDJPY has lost all five recorded trades.

The latest complete account snapshot was captured at 2026-11-25 03:14:10 UTC: balance/equity $502.83, zero open positions, positions_complete=true. This is a timestamped observation, not a live guarantee.

Recorded P/L is not independently verified net-of-all-costs because the journal still does not separately store broker close-deal commission, swap and fee.

## Signal-to-trade attribution and classifier finding

A read-only nearest-time join of closed trades to same-symbol/same-direction signal rows within 20 minutes linked 21 of 33 trades. This is only a diagnostic approximation: the schema still lacks an immutable signal_id foreign key from queue/trade rows to the original candidate.

Among those 21 approximate matches:
- GOOD_AND_CLEAR: 6 trades, 3 wins / 3 losses, -$12.63, profit factor 0.31.
- NORMAL: 15 trades, 4 wins / 11 losses, -$0.25, profit factor 0.99.
- 12 trades remain unlinked by this matching method and are excluded from label comparisons.

This is not a statistically sufficient sample and must not be treated as proof of a permanent class edge. It does show that the current labels have not demonstrated useful predictive separation.

A concrete example is XAUUSD trade journal id 155: its saved candidate was labelled GOOD AND CLEAR with quality score 85, but its saved timeframe indicator labels were 5M SELL, 15M WAIT, 1H WAIT and 4H WAIT. The classifier awards GOOD AND CLEAR from EMA alignment plus directional score thresholds; it does not require the full per-timeframe signal label to agree. Thus the display label can sound more conclusive than the underlying indicator agreement. The quality score is explicitly not a win probability.

The live candidate builder also allows a setup when 5M only fails to oppose the 1H direction strongly (score veto below -40), rather than requiring full 5M confirmation. 1H sets direction by EMA20/EMA50 plus score; 4H is a conflict veto; 15M structure must align or satisfy a pullback-reversal rule. This design may admit entries before short-term momentum has fully turned. It is a research hypothesis, not yet a proven cause of losses.

Some saved candidate snapshots show the last completed 1H candle around 45 minutes old. The current normalizer allows up to 1.5 timeframe periods of age. That is within the coded limit, but may be too permissive for a timeframe that determines trade direction. Test stricter freshness separately; do not change production thresholds based on this observation alone.

## Historical replay integrity defect found and isolated fix

The V100 baseline replay and short-term shadow both entered at the next candle OPEN (i+1) but started checking SL/TP from i+2. That skipped the entire fill candle, even though its high/low occur after the entry open and could hit either exit. This can bias backtest results in a favourable direction and makes prior replay metrics unreliable until corrected.

Branch experiment/root-cause-audit-2026-11-25 now:
- Adds a shared deterministic replay-exit resolver.
- Checks the fill candle and every later candle through the holding limit.
- Preserves the conservative rule that SL wins if SL and TP are both touched in one OHLC candle.
- Leaves unfinished trades open when the history ends before the holding limit.
- Correctly calculates time-exit R from the actual entry price.
- Adds five deterministic Deno tests for immediate SL, immediate TP, ambiguous same-bar SL/TP, incomplete future history, and time exit.
- Adds a dedicated GitHub Actions workflow.

Validation: the first CI attempt caught missing entryPrice wiring in the short-term replay call and test fixtures. That was corrected. Final GitHub Actions run 45539108188 passed all seven deterministic tests (five replay-exit cases and two 4H-filter cases); run 45539108207 passed the full engine/approval workflow, including type-checking production and shadow Edge Functions and all existing tests. The correction and 4H comparison remain isolated and have not been deployed to Supabase.

## Backtest and data limitations

The archive currently contains 10,014 candle rows across four symbols and four timeframes, but history depth differs by timeframe and symbol. The replay also merges provider rolling history. Its results remain gross simulations: historical bid/ask spread, commission, swap, slippage, broker fills and full historical session state are not modelled. It assumes zero spread in replay. Even after the fill-candle correction, these results are not expected live performance and need cost-aware sensitivity tests and chronological out-of-sample evaluation.

The separate short-term shadow is more demanding about entry timing: it uses 15M direction, completed 5M confirmation, 1H/4H conflict vetoes, and next-5M-open entry. It remains isolated and cannot create live signals, approvals, queue items or orders. Its results must be rerun after the replay correction and compared with the baseline on identical dates and realistic cost assumptions.

## Next investigation steps

1. Obtain passing CI for the replay exit correction.
2. Rerun baseline and short-term shadow on identical completed-candle coverage; report actual coverage, trade count, net R, profit factor, max drawdown, and results per symbol and signal class.
3. Add cost and slippage sensitivity; exclude any setup whose net expectancy does not survive realistic costs.
4. Test, separately, a stricter entry confirmation and tighter H1 freshness rule. Do not tune on the same data used to select the rules; retain a chronological untouched out-of-sample period.
5. Fix immutable signal-to-approval-to-position-to-close linkage and broker close-deal accounting before drawing strong conclusions from per-signal results.
6. Only consider a production change after shadow tests pass, results are robust across symbols and periods, and the user explicitly approves it.

## Current status

Production market-monitor is ACTIVE v68. market-monitor-v100-shadow is ACTIVE v5 and market-monitor-v100-backtest-shadow is ACTIVE v17 at the time of this audit. No production function was deployed or changed. Keep new Demo trade approvals paused during the investigation; do not increase lot size or use the Real account.


## Additional cross-timeframe outcome pattern

A second diagnostic join parsed saved timeframe labels for 29 approximate trade-to-signal matches. These are still nearest-time matches, not immutable lifecycle links, and the sample is small:
- 4H label ALIGNED with trade direction: 7 trades, 5 wins / 2 losses, 71.4% wins, +$6.49 recorded P/L.
- 4H label WAIT: 22 trades, 7 wins / 15 losses, 31.8% wins, -$10.48 recorded P/L.
- By market, all five USDJPY trades had 4H WAIT and all five lost. XAUUSD had 2 wins / 0 losses when 4H was aligned (+$8.71), versus 1 win / 2 losses when 4H was WAIT (-$13.58). BTCUSD and EURUSD were mixed, so this is not universal proof.
- In the latest five trades, all four losses had 4H WAIT; the one winner (BTCUSD SELL) had 4H SELL. Two of the losing candidates had all four timeframe signal labels at WAIT; the other two had lower-timeframe agreement but no 4H/1H signal confirmation.
- 15M ALIGNED: 4/8 wins, +$1.13; 15M WAIT: 8/21 wins, -$5.12. 1H ALIGNED: 8/18 wins, +$0.19; 1H WAIT: 4/11 wins, -$4.18. 5M ALIGNED: 2/8 wins, -$22.63; 5M WAIT: 9/20 wins, +$12.98. This warns against simply requiring every timeframe label to be BUY/SELL; the 5M full label did not improve these small-sample outcomes.

The live candidate builder treats 4H as a score-based conflict veto, not a requirement for an explicit 4H BUY/SELL signal. The results make a strict 4H directional-confirmation gate a promising hypothesis to test, particularly for USDJPY and Gold, but not a production conclusion.

The isolated backtest branch now adds a third comparison, fourHourConfirmedShadow: it replays the unchanged baseline and rejects a candidate unless the completed 4H indicator signal explicitly matches the trade direction. It is read-only research code only, has no live signal or execution connection, and must pass CI and historical cost-aware testing before anyone considers promotion. The existing baseline and short-term shadow remain unchanged.
