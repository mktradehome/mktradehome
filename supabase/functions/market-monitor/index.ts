
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "content-type, x-monitor-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const markets = ["BTCUSD", "EURUSD", "XAUUSD", "USDJPY"];
const intervals = ["5m", "15m", "1h", "4h"];

function response(data: object, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let result = values[0];

  for (let i = 1; i < values.length; i++) {
    result = values[i] * k + result * (1 - k);
  }

  return result;
}

function analyse(candles: any[]) {
  if (candles.length < 60) return "WAIT";

  const closes = candles.map((c) => Number(c.close));

  if (closes.some((v) => !Number.isFinite(v))) return "WAIT";

  const fast = ema(closes.slice(-100), 20);
  const slow = ema(closes.slice(-120), 50);
  const previousFast = ema(closes.slice(-101, -1), 20);

  let score = 0;

  if (closes.at(-1)! > fast) score++;
  if (fast > slow) score++;
  if (fast > previousFast) score++;
  if (closes.at(-1)! > closes.at(-2)!) score++;

  if (score >= 3) return "BUY";
  if (score <= 1) return "SELL";

  return "WAIT";
}

function atr(candles: any[]) {
  const bars = candles.slice(-15);

  const ranges = bars.map((c, i) => {
    const high = Number(c.high);
    const low = Number(c.low);

    const previous = i === 0
      ? Number(c.close)
      : Number(bars[i - 1].close);

    return Math.max(
      high - low,
      Math.abs(high - previous),
      Math.abs(low - previous)
    );
  });

  return ranges.reduce((a, b) => a + b, 0) / ranges.length;
}

async function getCandles(symbol: string, interval: string) {
  const url =
    `https://biquote.io/api/${symbol}/ohlc?interval=${interval}&limit=200`;

  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`Candle request failed: ${symbol} ${interval}`);
  }

  const result = await res.json();
  const rows = result.bars || [];

  return rows
    .filter((c: any) => c.isOpen !== true)
    .reverse();
}


async function saveIndependentFallback(supabase: any, users: any[], symbol: string, timeframes: Record<string, any>, quote: any, price: number, quoteAgeSeconds: number): Promise<any> {
  const higher = [timeframes["4H"]?.signal, timeframes["1H"]?.signal];
  const lower = [timeframes["15M"]?.signal, timeframes["5M"]?.signal];
  const side = higher[0];
  const higherTimeframesAgree = (side === "BUY" || side === "SELL") && higher[1] === side;
  const lowerTimeframesClear = lower.every((s) => s === "WAIT" || s === side);
  const lowerConfirmsDirection = lower.includes(side);
  const quoteFresh = quote?.stale === false &&
    (symbol === "BTCUSD" || String(quote?.marketState).toLowerCase() === "open") &&
    Number.isFinite(quoteAgeSeconds) && quoteAgeSeconds >= 0 && quoteAgeSeconds <= 30 &&
    Number.isFinite(price) && price > 0;
  const enoughCandles = ["4H", "1H", "15M", "5M"].every((key) => Number(timeframes[key]?.bars) >= 60);
  if (!higherTimeframesAgree || !lowerTimeframesClear || !lowerConfirmsDirection || !quoteFresh || !enoughCandles) {
    return { status: "Independent engine: WAIT. Trend, confirmation, candle-history or fresh-quote checks did not all pass.", signal: "WAIT", verificationStatus: "NOT_GPT_VERIFIED", checks: { higherTimeframesAgree, lowerTimeframesClear, lowerConfirmsDirection, quoteFresh, enoughCandles } };
  }
  const atr15 = Number(timeframes["15M"]?.atr);
  const atr5 = Number(timeframes["5M"]?.atr);
  const riskDistance = Math.max(atr15 * 1.5, atr5 * 2);
  if (!Number.isFinite(riskDistance) || riskDistance <= 0 || riskDistance >= price) {
    return { status: "Independent engine: WAIT. Volatility-based stop distance is invalid.", signal: "WAIT" };
  }
  const entry = price;
  const stopLoss = side === "BUY" ? entry - riskDistance : entry + riskDistance;
  const takeProfit1 = side === "BUY" ? entry + riskDistance * 2 : entry - riskDistance * 2;
  const takeProfit2 = side === "BUY" ? entry + riskDistance * 3 : entry - riskDistance * 3;
  const risk = side === "BUY" ? entry - stopLoss : stopLoss - entry;
  const reward1 = side === "BUY" ? takeProfit1 - entry : entry - takeProfit1;
  const reward2 = side === "BUY" ? takeProfit2 - entry : entry - takeProfit2;
  if (!(risk > 0 && reward1 >= risk * 2 && reward2 >= risk * 3)) {
    return { status: "Independent engine: WAIT. Risk/reward validation failed.", signal: "WAIT" };
  }
  const { data: previous, error: previousError } = await supabase.from("market_signal_state").select("last_signal,updated_at").eq("symbol", symbol).maybeSingle();
  if (previousError) throw previousError;
  const previousAge = previous?.updated_at ? Date.now() - Date.parse(previous.updated_at) : Infinity;
  if (previous?.last_signal === side && previousAge >= 0 && previousAge <= 10 * 60 * 1000) {
    return { status: "Independent setup direction unchanged; duplicate signal and alert suppressed during the 10-minute candidate window.", signal: side, duplicateSuppressed: true };
  }
  const { data: activeApproval, error: activeApprovalError } = await supabase.from("mt5_trade_queue")
    .select("id").eq("account_number", "486163696").eq("account_server", "Exness-MT5Trial10")
    .eq("symbol", symbol).in("status", ["approved", "executing"]).limit(1).maybeSingle();
  if (activeApprovalError) throw activeApprovalError;
  if (activeApproval) {
    return { status: "An active Demo approval or executing trade already exists; duplicate candidate suppressed.", signal: side, duplicateSuppressed: true };
  }
  const createdAt = new Date().toISOString();
  const analysis = {
    source: "mktradehome-independent-fallback", analysisMode: "MKTRADEHOME",
    fallbackVerified: true, gptVerified: false, verificationStatus: "NOT_GPT_VERIFIED",
    verificationNote: "Mktradehome rule checks passed. This is not GPT verified and is not a promise of profit.",
    explanation: "Independent EMA trend and volatility-based risk analysis using completed candles.",
    risk_note: "Review the live market and approve manually. This candidate expires after 10 minutes.",
    strength: "STANDARD",
    checks: { higherTimeframesAgree: true, lowerTimeframesClear: true, lowerConfirmsDirection: true, quoteFresh: true, enoughCandles: true, riskReward: "1:2 and 1:3" },
    timeframes,
    quote: { price, bid: Number(quote.bid), ask: Number(quote.ask), quoteAgeSeconds, marketState: String(quote.marketState || "").toLowerCase(), checkedAt: createdAt },
    riskDistance, expiryMinutes: 10
  };
  const message = "⚠️ MKTRADEHOME SIGNAL — NOT GPT VERIFIED\\n\\n" + symbol + " · " + side + "\\n" +
    "Entry: " + entry + "\\nStop Loss: " + stopLoss + "\\nTP1 (1:2): " + takeProfit1 +
    "\\nTP2 (1:3): " + takeProfit2 + "\\nEngine: Mktradehome independent rules\\n" +
    "Expires in 10 minutes. Review and approve manually in Demo. No trade has been placed.";
  let signalsSaved = 0, alertsSaved = 0, telegramDelivered = 0;
  const errors: string[] = [];
  for (const user of users) {
    if (!user.user_id) continue;
    const { error: signalError } = await supabase.from("trade_signals").insert({
      user_id: user.user_id, symbol, signal: side, entry_price: entry, stop_loss: stopLoss,
      take_profit_1: takeProfit1, take_profit_2: takeProfit2, confidence: 60, analysis: JSON.stringify(analysis)
    });
    if (signalError) { errors.push("Signal history: " + signalError.message); continue; }
    signalsSaved++;
    const { error: alertError } = await supabase.from("trade_alerts").insert({ user_id: user.user_id, symbol, alert_type: side, message });
    if (alertError) errors.push("Alert history: " + alertError.message); else alertsSaved++;
    if (user.chat_id) {
      try {
        const tg = await fetch("https://api.telegram.org/bot" + Deno.env.get("TELEGRAM_BOT_TOKEN") + "/sendMessage", {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chat_id: user.chat_id, text: message })
        });
        const tgData = await tg.json();
        if (tg.ok && tgData.ok) telegramDelivered++; else errors.push("Telegram: " + (tgData.description || "delivery failed"));
      } catch (error) { errors.push("Telegram: " + (error instanceof Error ? error.message : "delivery failed")); }
    }
  }
  if (signalsSaved > 0) {
    const { error: stateError } = await supabase.from("market_signal_state").upsert({ symbol, last_signal: side, updated_at: createdAt });
    if (stateError) errors.push("Market state: " + stateError.message);
  }
  return { status: "Independent Mktradehome candidate saved; NOT GPT VERIFIED. Demo review required.", signal: side, verificationStatus: "NOT_GPT_VERIFIED", signalsSaved, alertsSaved, telegramDelivered, expiresInMinutes: 10, checks: analysis.checks, errors };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "POST required" }, 405);
  }

  try {
    const monitorSecret = Deno.env.get("MARKET_MONITOR_SECRET");

    if (
      !monitorSecret ||
      req.headers.get("x-monitor-secret") !== monitorSecret
    ) {
      return response({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    if (!supabaseUrl || !serviceKey || !botToken) {
      return response({
        error: "Missing Supabase or Telegram secrets",
      }, 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Global GPT request guard: preserve the API's limited daily allowance.
    const { data: monitorControl, error: monitorControlError } = await supabase
      .from("market_monitor_control")
      .select("next_gpt_at")
      .eq("control_key", "global_gpt_cooldown")
      .maybeSingle();
    if (monitorControlError) throw monitorControlError;
    let nextGptAllowedAt = monitorControl?.next_gpt_at
      ? Date.parse(monitorControl.next_gpt_at)
      : 0;

    // Retrieve both the Telegram destination and its real account ID.
    const { data: users, error: userError } = await supabase
      .from("telegram_users")
      .select("user_id, chat_id");

    if (userError) throw userError;

    if (!users?.length) {
      return response({ error: "No Telegram users connected" }, 404);
    }

    const quoteUrl =
      "https://biquote.io/api/latest?symbols=BTCUSD&symbols=EURUSD&symbols=XAUUSD&symbols=USDJPY";

    const quoteResponse = await fetch(quoteUrl);

    if (!quoteResponse.ok) {
      throw new Error("Could not fetch live prices");
    }

    const quoteData = await quoteResponse.json();
    const quotes = quoteData.data || quoteData.quotes || quoteData;

    const results: any[] = [];

    for (const symbol of markets) {
      try {
        const quote = quotes[symbol];

        if (
          !quote ||
          quote.stale === true ||
          (symbol !== "BTCUSD" && String(quote.marketState).toLowerCase() !== "open") ||
          !Number(quote.bid) ||
          !Number(quote.ask)
        ) {
          results.push({
            symbol,
            status: "Skipped: price unavailable or market closed",
          });

          continue;
        }

        const price =
          (Number(quote.bid) + Number(quote.ask)) / 2;

        const candleSets = await Promise.all(
          intervals.map((interval) => getCandles(symbol, interval))
        );

        const counts = candleSets.map((set) => set.length);

        if (candleSets.some((set) => set.length < 60)) {
          results.push({
            symbol,
            status: "Skipped: insufficient candles",
            candleCounts: counts,
          });

          continue;
        }

        const timeframes: Record<string, any> = {};
        const timeframeKeys = ["5M", "15M", "1H", "4H"];
        candleSets.forEach((set, index) => {
          const closes = set.map((c: any) => Number(c.close));
          const last = closes[closes.length - 1];
          const fast = ema(closes.slice(-100), 20);
          const slow = ema(closes.slice(-120), 50);
          const signal = analyse(set);
          timeframes[timeframeKeys[index]] = {
            signal,
            price: last,
            ema20: fast,
            ema50: slow,
            atr: atr(set),
            bars: set.length,
          };
        });

        // Match the dashboard's higher-timeframe prefilter so GPT requests
        // are reserved for setups that are technically eligible for review.
        const higher = [timeframes["4H"]?.signal, timeframes["1H"]?.signal];
        const lower = [timeframes["15M"]?.signal, timeframes["5M"]?.signal];
        const higherAgree =
          ["BUY", "SELL"].includes(higher[1]) &&
          (higher[0] === higher[1] || higher[0] === "WAIT");
        const lowerConflict = lower.some(
          (signal) => signal !== "WAIT" && signal !== higher[1],
        );
        const lowerConfirms = lower.includes(higher[1]);
        if (!higherAgree || lowerConflict || !lowerConfirms) {
          results.push({
            symbol,
            status: "No GPT request: 1H direction lacks 4H support, or 5M/15M confirmation is missing.",
          });
          continue;
        }

        const quoteAgeSeconds = Number(quote.quoteAgeSeconds);
        if (
          quote.stale !== false ||
          !Number.isFinite(quoteAgeSeconds) ||
          quoteAgeSeconds > 120
        ) {
          results.push({ symbol, status: "Skipped: quote freshness could not be verified." });
          continue;
        }

        if (Date.now() < nextGptAllowedAt) {
          const fallback = await saveIndependentFallback(supabase, users, symbol, timeframes, quote, price, quoteAgeSeconds);
          results.push({ symbol, ...fallback, gptCooldownUntil: new Date(nextGptAllowedAt).toISOString() });
          continue;
        }

        // Reserve one full review slot per hour. A verified BUY/SELL can use
        // two API requests (analysis + independent review), staying below the
        // known 50-request daily ceiling without paying for an upgrade.
        const reservationUntil = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const { error: reserveError } = await supabase
          .from("market_monitor_control")
          .upsert({
            control_key: "global_gpt_cooldown",
            next_gpt_at: reservationUntil,
            updated_at: new Date().toISOString(),
          });
        if (reserveError) throw reserveError;
        nextGptAllowedAt = Date.parse(reservationUntil);

        let gptResponse: Response | null = null;
        let gptFailureDetail = "";
        try {
          gptResponse = await fetch(
            `${supabaseUrl}/functions/v1/gpt-market-analysis`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "apikey": serviceKey,
                "Authorization": `Bearer ${serviceKey}`,
              },
              body: JSON.stringify({
                symbol,
                quote: {
                  price,
                  bid: Number(quote.bid),
                  ask: Number(quote.ask),
                  stale: false,
                  marketState: String(quote.marketState || "").toLowerCase(),
                  quoteAgeSeconds,
                },
                timeframes,
              }),
              signal: AbortSignal.timeout(12000),
            },
          );
        } catch (gptNetworkError) {
          gptFailureDetail = gptNetworkError instanceof Error ? gptNetworkError.message : "GPT network request failed";
        }

        if (!gptResponse || !gptResponse.ok) {
          const detail = gptResponse ? await gptResponse.text() : gptFailureDetail;
          if (gptResponse?.status === 429) {
            let retrySeconds = 0;
            try { retrySeconds = Number(JSON.parse(detail)?.retryAfterSeconds) || 0; } catch { /* keep hourly reservation */ }
            if (retrySeconds > 0) {
              const retryUntil = new Date(Date.now() + (retrySeconds + 10) * 1000).toISOString();
              const { error: cooldownError } = await supabase
                .from("market_monitor_control")
                .upsert({
                  control_key: "global_gpt_cooldown",
                  next_gpt_at: retryUntil,
                  updated_at: new Date().toISOString(),
                });
              if (cooldownError) console.error("Could not save GPT retry cooldown:", cooldownError.message);
              nextGptAllowedAt = Math.max(nextGptAllowedAt, Date.parse(retryUntil));
            }
          }
          console.error("GPT verification unavailable; signal blocked:", symbol, gptResponse?.status ?? "network_error", detail);
          const fallback = await saveIndependentFallback(supabase, users, symbol, timeframes, quote, price, quoteAgeSeconds);
          results.push({ symbol, ...fallback, gptFailure: true, verificationStatus: fallback.verificationStatus || "NOT_GPT_VERIFIED" });
          continue;
        }

        const gptResponseText = await gptResponse.text();
        let gptPayload: any;
        try {
          gptPayload = JSON.parse(gptResponseText);
        } catch (parseError) {
          console.error("GPT returned invalid JSON; signal blocked:", symbol, parseError);
          const fallback = await saveIndependentFallback(supabase, users, symbol, timeframes, quote, price, quoteAgeSeconds);
          results.push({ symbol, ...fallback, gptInvalidResponse: true });
          continue;
        }
        const candidate = gptPayload?.analysis;
        const verified =
          gptPayload?.success === true &&
          candidate?.gptVerified === true &&
          candidate?.verificationStatus === "PASSED" &&
          ["BUY", "SELL"].includes(candidate?.signal) &&
          Number.isFinite(Number(candidate?.entry)) &&
          Number.isFinite(Number(candidate?.stop_loss)) &&
          Number.isFinite(Number(candidate?.take_profit_1)) &&
          Number.isFinite(Number(candidate?.take_profit_2));

        if (!verified) {
          await supabase.from("market_signal_state").upsert({
            symbol,
            last_signal: "WAIT",
            updated_at: new Date().toISOString(),
          });
          const fallback = await saveIndependentFallback(supabase, users, symbol, timeframes, quote, price, quoteAgeSeconds);
          results.push({ symbol, ...fallback, gptDidNotVerify: true });
          continue;
        }

        const signal = candidate.signal as string;
        const { data: previous, error: previousError } = await supabase
          .from("market_signal_state")
          .select("last_signal")
          .eq("symbol", symbol)
          .maybeSingle();
        if (previousError) throw previousError;

        if (previous?.last_signal === signal) {
          results.push({ symbol, status: "Verified setup direction unchanged; duplicate alert suppressed." });
          continue;
        }

        const entry = Number(candidate.entry);
        const stopLoss = Number(candidate.stop_loss);
        const takeProfit1 = Number(candidate.take_profit_1);
        const takeProfit2 = Number(candidate.take_profit_2);
        const risk = signal === "BUY" ? entry - stopLoss : stopLoss - entry;
        const reward1 = signal === "BUY" ? takeProfit1 - entry : entry - takeProfit1;
        const reward2 = signal === "BUY" ? takeProfit2 - entry : entry - takeProfit2;
        if (
          risk <= 0 || reward1 < risk * 2 || reward2 < risk * 3 ||
          (signal === "BUY" && !(stopLoss < entry && takeProfit1 > entry && takeProfit2 > entry)) ||
          (signal === "SELL" && !(stopLoss > entry && takeProfit1 < entry && takeProfit2 < entry))
        ) {
          results.push({ symbol, status: "GPT candidate failed final price/risk validation." });
          continue;
        }

        const message =
          `✅ MKTRADEHOME GPT-VERIFIED SETUP\\n\\n` +
          `${symbol} · ${signal}\\n` +
          `Entry: ${entry}\\nStop Loss: ${stopLoss}\\n` +
          `TP1: ${takeProfit1}\\nTP2: ${takeProfit2}\\n` +
          `Confidence: ${Number(candidate.confidence) || 0}/100\\n` +
          `Independent GPT review: PASSED\\n` +
          `Open Mktradehome to review. This alert does not place a trade.`;

        let delivered = 0;
        let signalsSaved = 0;
        let alertsSaved = 0;
        const errors: string[] = [];

        for (const user of users) {
          if (!user.user_id) continue;

          const persistedAnalysis = JSON.stringify({
            source: "gpt-market-analysis",
            gptVerified: true,
            verificationStatus: "PASSED",
            verificationNote: candidate.verificationNote || "",
            strength: candidate.strength || "STANDARD",
            explanation: candidate.explanation || "",
            risk_note: candidate.risk_note || "",
            timeframes,
            quote: { price, quoteAgeSeconds, marketState: quote.marketState },
          });

          const { error: signalError } = await supabase.from("trade_signals").insert({
            user_id: user.user_id,
            symbol,
            signal,
            entry_price: entry,
            stop_loss: stopLoss,
            take_profit_1: takeProfit1,
            take_profit_2: takeProfit2,
            confidence: Number(candidate.confidence) || 0,
            analysis: persistedAnalysis,
          });
          if (signalError) errors.push("Signal history: " + signalError.message);
          else signalsSaved++;

          const { error: alertError } = await supabase.from("trade_alerts").insert({
            user_id: user.user_id,
            symbol,
            alert_type: signal,
            message,
          });
          if (alertError) errors.push("Alert history: " + alertError.message);
          else alertsSaved++;

          if (user.chat_id) {
            try {
              const telegramResponse = await fetch(
                `https://api.telegram.org/bot${botToken}/sendMessage`,
                {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ chat_id: user.chat_id, text: message }),
                },
              );
              const telegramResult = await telegramResponse.json();
              if (telegramResponse.ok && telegramResult.ok) delivered++;
              else errors.push("Telegram: " + (telegramResult.description || "delivery failed"));
            } catch (telegramError) {
              errors.push(telegramError instanceof Error ? telegramError.message : "Telegram delivery failed");
            }
          }
        }

        const { error: stateError } = await supabase.from("market_signal_state").upsert({
          symbol,
          last_signal: signal,
          updated_at: new Date().toISOString(),
        });
        if (stateError) errors.push("Market state: " + stateError.message);

        results.push({
          symbol,
          status: "GPT-verified candidate saved; user approval required.",
          signal,
          verificationStatus: "PASSED",
          signalsSaved,
          alertsSaved,
          telegramDelivered: delivered,
          errors,
        });
      } catch (error) {
        results.push({
          symbol,
          status: "Error",
          details: error instanceof Error
            ? error.message
            : "Unknown error",
        });
      }
    }

    return response({
      success: true,
      results,
    });
  } catch (error) {
    return response({
      error: error instanceof Error
        ? error.message
        : "Unknown error",
    }, 500);
  }
});
