# Mktradehome Demo trade-close audit — 2026-11-23

## Scope and safety
Read-only inspection of the EURUSD Demo position previously verified open as MT5 position ID 595355103. No trade, code, database row, signal rule, risk setting, approval, or execution setting was changed.

## EURUSD position 595355103
- Signal #909 was the previously verified GOOD AND CLEAR SELL candidate (quality score 85/100; this is a heuristic score, not an 85% win probability).
- Manual approval: 2026-11-23 12:00:20 UTC.
- MT5 queue: `executed`; broker confirmation retcode 10009; SELL 0.01 EURUSDm; broker fill stated in execution message: 1.09610.
- Position opened: 12:00:31 UTC; closed: 12:45:56 UTC.
- Trade journal row #120 exists and is CLOSED for the same MT5 position ID.
- Journal values: SELL EURUSD, 0.01 lot, entry 1.09614, exit 1.09426, SL 1.09693143, TP 1.09425714, recorded P/L +$1.84.
- The exit is effectively at the configured TP (rounding to the broker's displayed price precision).
- Latest complete Demo account snapshot checked: 12:57:33 UTC, zero open positions, positions_complete=true, balance/equity $517.20. This is a timestamped snapshot, not a live status guarantee after that time.

## Reconciliation finding
The broker execution message records fill price 1.09610, while the queue's saved entry_price and journal entry_price are 1.09614. Difference: 0.00004 (0.4 pip on EURUSD). The journal row is correctly associated to the broker position ID and closed outcome, but the canonical entry-price field is not an exact match to the broker fill reported in the execution message. Investigate the bridge's fill-price persistence and ensure the journal uses the broker-confirmed fill as canonical, while retaining requested/approved price separately if needed. Do not silently overwrite historical records; first inspect the close-report payload and broker history source.

## Demo closed-trade scorecard at query time
All 18 CLOSED trade rows for the configured Demo account/server:
- Net recorded P/L: +$15.24
- Wins/losses: 10 / 8 (55.6% win rate)
- Gross profit: $35.36; gross loss: $20.12
- Profit factor: 1.76
- Average P/L per closed trade: +$0.85

By market:
| Market | Trades | Wins | Losses | Net P/L | Profit factor |
|---|---:|---:|---:|---:|---:|
| BTCUSD | 9 | 4 | 5 | +$4.03 | 1.23 |
| EURUSD | 6 | 4 | 2 | +$3.63 | 3.39 |
| XAUUSD | 2 | 2 | 0 | +$8.71 | Not meaningful with no losses |
| USDJPY | 1 | 0 | 1 | -$1.13 | Not meaningful with no wins |

These are small-sample, recorded Demo results, not proof of durable profitability or expected live returns. The four most recent closures included two EURUSD wins (+$1.84 and +$1.64) and two BTCUSD losses (-$3.19 and -$2.96), illustrating why all outcomes must be included.

## Decision / next steps
1. Preserve the production strategy and risk rules; do not tune from this small sample.
2. Fix/verify broker-fill-to-journal price reconciliation in an isolated test before production changes. Trace requested/approved price, actual broker fill, close price, costs, and realized P/L end-to-end.
3. Continue collecting Demo closures and evaluate by market and regime with chronological out-of-sample testing. Report expectancy, profit factor, drawdown, costs and confidence intervals alongside win rate.
4. Confirm the dashboard's closed-trade journal shows position 595355103 once, with its recorded close result. No browser visual inspection was available in this audit.
5. Keep manual approval, Demo-first, 0.01-lot cap, and Real-account read-only lock unchanged.

No production code or database changes were made during this audit.
