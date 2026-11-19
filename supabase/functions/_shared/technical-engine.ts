export type Side = "BUY" | "SELL" | "WAIT";
export type Timeframe = "5M" | "15M" | "1H" | "4H";

export interface Candle {
  open: number; high: number; low: number; close: number;
  time: number; isOpen?: boolean;
}
export interface Indicators {
  signal: Side; close: number; ema20: number; ema20Previous: number; ema50: number;
  rsi14: number; macd: number; macdSignal: number; macdHistogram: number;
  atr14: number; bars: number; candleAgeSeconds: number;
  reason: string;
}
export interface Candidate {
  signal: "BUY" | "SELL"; entry: number; stopLoss: number;
  takeProfit1: number; takeProfit2: number; riskDistance: number;
  qualityScore: number; explanation: string;
}
const PERIOD_MS: Record<Timeframe, number> = {
  "5M": 5 * 60_000, "15M": 15 * 60_000,
  "1H": 60 * 60_000, "4H": 4 * 60 * 60_000,
};
const finite = (n: number) => Number.isFinite(n) && n > 0;

export function ema(values: number[], period: number): number {
  if (values.length < period) return NaN;
  const k = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = values[i] * k + value * (1 - k);
  return value;
}
export function rsi(values: number[], period = 14): number {
  if (values.length <= period) return NaN;
  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gain += delta; else loss -= delta;
  }
  let avgGain = gain / period, avgLoss = loss / period;
  for (let i = period + 1; i < values.length; i++) {
    const delta = values[i] - values[i - 1];
    avgGain = (avgGain * (period - 1) + Math.max(delta, 0)) / period;
    avgLoss = (avgLoss * (period - 1) + Math.max(-delta, 0)) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - 100 / (1 + avgGain / avgLoss);
}
function macd(values: number[]) {
  const fast = ema(values.slice(-120), 12);
  const slow = ema(values.slice(-120), 26);
  const line = fast - slow;
  const lines: number[] = [];
  for (let i = 26; i <= values.length; i++) {
    const sample = values.slice(0, i);
    lines.push(ema(sample.slice(-120), 12) - ema(sample.slice(-120), 26));
  }
  const signal = ema(lines.slice(-60), 9);
  return { line, signal, histogram: line - signal };
}
export function atr(candles: Candle[], period = 14): number {
  if (candles.length < period + 1) return NaN;
  const ranges: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const c = candles[i], prev = candles[i - 1];
    ranges.push(Math.max(c.high - c.low, Math.abs(c.high - prev.close), Math.abs(c.low - prev.close)));
  }
  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}
export function normalizeCandles(input: any[], timeframe: Timeframe, now = Date.now()): Candle[] {
  if (!Array.isArray(input)) throw new Error("Candle response is not an array.");
  const rows = input.filter((c) => c && c.isOpen !== true).map((c) => {
    let raw = c.time ?? c.openTime ?? c.timestamp ?? c.open_time;
    let time = typeof raw === "string"
      ? (/^\d+(\.\d+)?$/.test(raw) ? Number(raw) : Date.parse(raw))
      : Number(raw);
    if (Number.isFinite(time) && time > 0 && time < 1e12) time *= 1000;
    return { open: Number(c.open), high: Number(c.high), low: Number(c.low), close: Number(c.close), time };
  }).filter((c) => [c.open,c.high,c.low,c.close,c.time].every(Number.isFinite))
    .sort((a,b) => a.time-b.time);
  const unique = rows.filter((c,i) => i === 0 || c.time > rows[i-1].time);
  if (unique.length < 60) throw new Error("Fewer than 60 valid completed candles.");
  for (const c of unique) {
    if (!finite(c.open) || !finite(c.high) || !finite(c.low) || !finite(c.close) ||
      c.high < c.low || c.high < Math.max(c.open,c.close) || c.low > Math.min(c.open,c.close)) {
      throw new Error("Invalid OHLC candle.");
    }
  }
  const last = unique[unique.length - 1];
  const age = now - (last.time + PERIOD_MS[timeframe]);
  if (age < -120_000 || age > PERIOD_MS[timeframe] * 1.5) {
    throw new Error("Latest completed candle is stale or timestamp is invalid.");
  }
  return unique;
}
export function analyseTimeframe(candles: Candle[], timeframe: Timeframe, now = Date.now()): Indicators {
  if (candles.length < 60) throw new Error("Insufficient candles.");
  const closes = candles.map(c => c.close);
  const close = closes[closes.length - 1];
  const ema20 = ema(closes.slice(-100),20);
  const ema50 = ema(closes.slice(-120),50);
  const priorEma20 = ema(closes.slice(-101,-1),20);
  const rsi14 = rsi(closes,14);
  const m = macd(closes);
  const atr14 = atr(candles,14);
  if (![close,ema20,ema50,priorEma20,rsi14,m.line,m.signal,m.histogram,atr14].every(Number.isFinite) || atr14 <= 0) {
    throw new Error("Indicator calculation failed.");
  }
  const bullish = close > ema20 && ema20 > ema50 && ema20 > priorEma20 &&
    rsi14 >= 52 && rsi14 <= 68 && m.histogram > 0;
  const bearish = close < ema20 && ema20 < ema50 && ema20 < priorEma20 &&
    rsi14 >= 32 && rsi14 <= 48 && m.histogram < 0;
  const signal: Side = bullish ? "BUY" : bearish ? "SELL" : "WAIT";
  const age = Math.max(0, now - (candles[candles.length-1].time + PERIOD_MS[timeframe])) / 1000;
  return { signal, close, ema20, ema20Previous:priorEma20, ema50, rsi14, macd:m.line, macdSignal:m.signal,
    macdHistogram:m.histogram, atr14, bars:candles.length, candleAgeSeconds:age,
    reason: signal === "BUY" ? "EMA trend, RSI and MACD agree bullishly" :
      signal === "SELL" ? "EMA trend, RSI and MACD agree bearishly" : "Indicators are mixed or momentum is not confirmed" };
}
export function buildCandidate(
  frames: Record<Timeframe, Indicators>,
  quote: { bid:number; ask:number; stale:boolean; marketState:string; quoteAgeSeconds:number },
): Candidate | null {
  const price = (quote.bid + quote.ask) / 2;
  if (!finite(quote.bid) || !finite(quote.ask) || quote.ask < quote.bid ||
      quote.stale !== false || quote.marketState.toLowerCase() !== "open" ||
      !Number.isFinite(quote.quoteAgeSeconds) || quote.quoteAgeSeconds < 0 || quote.quoteAgeSeconds > 30) return null;
  const side = frames["4H"].signal;
  if (side === "WAIT" || frames["1H"].signal !== side || frames["15M"].signal !== side ||
      (frames["5M"].signal !== side && frames["5M"].signal !== "WAIT")) return null;
  const atr15 = frames["15M"].atr14, atr5 = frames["5M"].atr14;
  if (!finite(atr15) || !finite(atr5)) return null;
  if (Math.abs(price - frames["15M"].close) > atr15 * 0.75) return null;
  const spread = quote.ask - quote.bid;
  const riskDistance = Math.max(atr15 * 1.5, atr5 * 2, spread * 2.5);
  if (!finite(riskDistance) || riskDistance >= price) return null;
  const stopLoss = side === "BUY" ? price-riskDistance : price+riskDistance;
  const takeProfit1 = side === "BUY" ? price+2*riskDistance : price-2*riskDistance;
  const takeProfit2 = side === "BUY" ? price+3*riskDistance : price-3*riskDistance;
  const risk = side === "BUY" ? price-stopLoss : stopLoss-price;
  const reward1 = side === "BUY" ? takeProfit1-price : price-takeProfit1;
  const reward2 = side === "BUY" ? takeProfit2-price : price-takeProfit2;
  if (!(risk > 0 && reward1 >= 2*risk && reward2 >= 3*risk)) return null;
  const aligned = [frames["4H"],frames["1H"],frames["15M"]].filter(f=>f.signal===side).length;
  const lowerBonus = frames["5M"].signal===side ? 10 : 0;
  return { signal:side, entry:price, stopLoss, takeProfit1, takeProfit2, riskDistance,
    qualityScore:Math.min(90,70+aligned*5+lowerBonus),
    explanation:"Rules passed: 4H/1H/15M alignment, 5M non-conflict, EMA20/50, RSI14, MACD, fresh quotes and ATR-based 1:2/1:3 targets. Quality score is not a win probability." };
}
export function validateCandidate(c: Candidate): boolean {
  const nums=[c.entry,c.stopLoss,c.takeProfit1,c.takeProfit2,c.riskDistance];
  if (!nums.every(Number.isFinite) || nums.some(n=>n<=0)) return false;
  const risk=c.signal==="BUY"?c.entry-c.stopLoss:c.stopLoss-c.entry;
  const r1=c.signal==="BUY"?c.takeProfit1-c.entry:c.entry-c.takeProfit1;
  const r2=c.signal==="BUY"?c.takeProfit2-c.entry:c.entry-c.takeProfit2;
  return risk>0 && r1>=2*risk && r2>=3*risk &&
    (c.signal==="BUY" ? c.stopLoss<c.entry&&c.takeProfit1>c.entry&&c.takeProfit2>c.entry :
      c.stopLoss>c.entry&&c.takeProfit1<c.entry&&c.takeProfit2<c.entry);
}
