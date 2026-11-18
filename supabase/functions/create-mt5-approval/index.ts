
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DASHBOARD_USER_ID = "eb254614-cc9d-4846-adb6-fd45e5594a96";
const ACCOUNT_NUMBER = "486163696";
const ACCOUNT_SERVER = "Exness-MT5Trial10";

const ALLOWED_SYMBOLS = ["BTCUSD", "EURUSD", "XAUUSD", "USDJPY"];
const MAX_ENTRY_DEVIATION_PERCENT = 0.05;
const MAX_QUOTE_AGE_SECONDS = 30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return response({ error: "Method not allowed." }, 405);
  }

  try {
    // 1. Authenticate dashboard user.
    const authorization = req.headers.get("Authorization");

    if (!authorization?.startsWith("Bearer ")) {
      return response({ error: "Authentication required." }, 401);
    }

    const token = authorization.slice(7);

    const authClient = createClient(
      SUPABASE_URL,
      SUPABASE_ANON_KEY,
      {
        global: {
          headers: { Authorization: `Bearer ${token}` },
        },
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const { data: userData, error: authError } =
      await authClient.auth.getUser();

    if (authError || !userData.user) {
      return response({ error: "Invalid login session." }, 401);
    }

    if (userData.user.id !== DASHBOARD_USER_ID) {
      return response({ error: "Not authorized." }, 403);
    }

    // 2. Accept only a persisted candidate with valid independent-engine proof.
    const body = await req.json();
    const candidateId = Number(body.candidate_id);
    if (!Number.isSafeInteger(candidateId) || candidateId <= 0) {
      return response({ error: "A saved technical-engine candidate is required." }, 400);
    }

    const verificationClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const { data: candidate, error: candidateError } = await verificationClient
      .from("trade_signals")
      .select("id,user_id,symbol,signal,entry_price,stop_loss,take_profit_1,take_profit_2,analysis,created_at")
      .eq("id", candidateId)
      .eq("user_id", DASHBOARD_USER_ID)
      .maybeSingle();

    if (candidateError || !candidate) {
      return response({ error: "Saved candidate not found. No approval created." }, 404);
    }

    let proof: any;
    try { proof = JSON.parse(candidate.analysis || "{}"); } catch { proof = null; }
    if (
      proof?.source !== "mktradehome-technical-engine" ||
      proof?.engineVersion !== "1.0.0" ||
      proof?.engineVerified !== true ||
      proof?.verificationStatus !== "PASSED" ||
      !proof?.expiresAt || Date.parse(proof.expiresAt) <= Date.now()
    ) {
      return response({ error: "BLOCKED: independent technical-engine proof is missing, unsupported or expired." }, 403);
    }

    // Recheck saved indicator evidence server-side; do not trust a dashboard label.
    const frames = proof?.timeframes || {};
    const requiredFrames = ["4H", "1H", "15M", "5M"];
    const frameEvidenceValid = requiredFrames.every((key) => {
      const f = frames[key];
      if (!f || !Number.isFinite(Number(f.close)) || !Number.isFinite(Number(f.ema20)) ||
          !Number.isFinite(Number(f.ema20Previous)) || !Number.isFinite(Number(f.ema50)) ||
          !Number.isFinite(Number(f.rsi14)) || !Number.isFinite(Number(f.macdHistogram)) ||
          !Number.isFinite(Number(f.atr14)) || Number(f.atr14) <= 0 ||
          !Number.isFinite(Number(f.bars)) || Number(f.bars) < 60 ||
          !Number.isFinite(Number(f.candleAgeSeconds)) || Number(f.candleAgeSeconds) < 0) return false;
      if (key === "5M" && f.signal === "WAIT") return true;
      if (side === "BUY") return f.signal === "BUY" && Number(f.close) > Number(f.ema20) &&
        Number(f.ema20) > Number(f.ema50) && Number(f.ema20) > Number(f.ema20Previous) &&
        Number(f.rsi14) >= 52 && Number(f.rsi14) <= 68 && Number(f.macdHistogram) > 0;
      return f.signal === "SELL" && Number(f.close) < Number(f.ema20) &&
        Number(f.ema20) < Number(f.ema50) && Number(f.ema20) < Number(f.ema20Previous) &&
        Number(f.rsi14) >= 32 && Number(f.rsi14) <= 48 && Number(f.macdHistogram) < 0;
    });
    if (!frameEvidenceValid || !Number.isFinite(Number(proof?.qualityScore)) ||
        Number(proof.qualityScore) < 70 || Number(proof.qualityScore) > 90 ||
        proof?.qualityScoreIsWinProbability !== false) {
      return response({ error: "BLOCKED: saved technical indicators failed server-side validation." }, 403);
    }

    const createdAt = Date.parse(candidate.created_at || "");
    if (!Number.isFinite(createdAt) || Date.now() - createdAt < 0 || Date.now() - createdAt > 10 * 60 * 1000) {
      return response({ error: "This technical-engine setup has expired. Refresh analysis." }, 409);
    }

    const symbol = String(candidate.symbol || "").toUpperCase();
    const side = String(candidate.signal || "").toUpperCase();
    const entry = Number(candidate.entry_price);
    const stopLoss = Number(candidate.stop_loss);
    const takeProfit = Number(candidate.take_profit_1);
    const takeProfit2 = Number(candidate.take_profit_2);

    if (!ALLOWED_SYMBOLS.includes(symbol) || !["BUY", "SELL"].includes(side)) {
      return response({ error: "Saved candidate has an unsupported market or direction." }, 400);
    }
    if (![entry, stopLoss, takeProfit, takeProfit2].every(Number.isFinite) || entry <= 0 || stopLoss <= 0 || takeProfit <= 0 || takeProfit2 <= 0) {
      return response({ error: "Saved candidate contains invalid prices." }, 400);
    }
    const risk = side === "BUY" ? entry - stopLoss : stopLoss - entry;
    const reward1 = side === "BUY" ? takeProfit - entry : entry - takeProfit;
    const reward2 = side === "BUY" ? takeProfit2 - entry : entry - takeProfit2;
    if (!(risk > 0 && reward1 >= risk * 2 && reward2 >= risk * 3)) {
      return response({ error: "Saved candidate failed server-side risk/reward validation." }, 400);
    }

    // 3. Independently fetch the latest market quote.
    const quoteUrl =
      "https://biquote.io/api/latest?symbols=BTCUSD&symbols=EURUSD&symbols=XAUUSD&symbols=USDJPY";

    let quoteResponse: Response;

    try {
      quoteResponse = await fetch(quoteUrl, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
    } catch (error) {
      console.error("Market quote request failed:", error);

      return response({
        error: "Market data provider could not be reached. No approval was created.",
      }, 503);
    }

    if (!quoteResponse.ok) {
      console.error(
        "Market quote provider returned HTTP status:",
        quoteResponse.status,
      );

      return response({
        error: "Market data provider is unavailable. Refresh the dashboard and try again.",
        provider_status: quoteResponse.status,
      }, 503);
    }

    let quotePayload: any;

    try {
      quotePayload = await quoteResponse.json();
    } catch (error) {
      console.error("Invalid market quote response:", error);

      return response({
        error: "Market data provider returned invalid data. No approval was created.",
      }, 503);
    }

    // Supports both the documented top-level format and data-wrapped format.
    const quote =
      quotePayload?.[symbol] ??
      quotePayload?.data?.[symbol];

    if (!quote) {
      console.error("Requested quote missing:", symbol);

      return response({
        error: `Live ${symbol} quote is unavailable. No approval was created.`,
      }, 503);
    }

    const livePrice = Number(quote.mid);
    const quoteAge = Number(quote.quoteAgeSeconds);

    // 4. Reject stale quotes and closed markets.
    if (
      quote.stale !== false ||
      quote.marketState !== "open" ||
      !Number.isFinite(livePrice) ||
      livePrice <= 0 ||
      !Number.isFinite(quoteAge) ||
      quoteAge < 0 ||
      quoteAge > MAX_QUOTE_AGE_SECONDS
    ) {
      console.error("Quote failed freshness checks:", {
        symbol,
        marketState: quote.marketState,
        stale: quote.stale,
        quoteAge,
      });

      return response({
        error: "Market quote is stale or the market is closed. Refresh the analysis before approving.",
        market_state: quote.marketState ?? null,
        quote_age_seconds: Number.isFinite(quoteAge) ? quoteAge : null,
      }, 409);
    }

    // 5. Enforce maximum 0.05% entry deviation.
    const deviationPercent =
      (Math.abs(entry - livePrice) / livePrice) * 100;

    if (deviationPercent > MAX_ENTRY_DEVIATION_PERCENT) {
      return response({
        error: "Market price has moved too far from this setup. Refresh the analysis and approve the new signal.",
        live_price: livePrice,
        submitted_entry: entry,
        deviation_percent: Number(deviationPercent.toFixed(5)),
      }, 409);
    }

    // 6. Create secure database client.
    const adminClient = createClient(
      SUPABASE_URL,
      SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      },
    );

    const now = new Date();
    const nowIso = now.toISOString();

    // 7. Expire old approvals for this account and symbol.
    const { error: expireError } = await adminClient
      .from("mt5_trade_queue")
      .update({ status: "expired" })
      .eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER)
      .eq("symbol", symbol)
      .eq("status", "approved")
      .or(`expires_at.is.null,expires_at.lte.${nowIso}`);

    if (expireError) {
      console.error("Could not expire old approvals:", expireError);

      return response({
        error: "Could not prepare the approval queue.",
      }, 500);
    }

    // 8. Block another approval if a trade is executing.
    const { data: executingTrade, error: executingError } =
      await adminClient
        .from("mt5_trade_queue")
        .select("id")
        .eq("account_number", ACCOUNT_NUMBER)
        .eq("account_server", ACCOUNT_SERVER)
        .eq("symbol", symbol)
        .eq("status", "executing")
        .limit(1)
        .maybeSingle();

    if (executingError) {
      console.error("Executing-trade check failed:", executingError);

      return response({
        error: "Could not check the execution queue.",
      }, 500);
    }

    if (executingTrade) {
      return response({
        error: "A trade for this market is already executing. Wait for its result before approving another.",
      }, 409);
    }

    // 9. Block a second unexpired approval for the same market.
    const { data: activeApproval, error: approvalCheckError } =
      await adminClient
        .from("mt5_trade_queue")
        .select("id")
        .eq("account_number", ACCOUNT_NUMBER)
        .eq("account_server", ACCOUNT_SERVER)
        .eq("symbol", symbol)
        .eq("status", "approved")
        .gt("expires_at", nowIso)
        .limit(1)
        .maybeSingle();

    if (approvalCheckError) {
      console.error("Approval check failed:", approvalCheckError);

      return response({
        error: "Could not check existing approvals.",
      }, 500);
    }

    if (activeApproval) {
      return response({
        error: "An unexpired approval already exists for this market.",
      }, 409);
    }

    // 10. Save approval with a 15-minute expiry.
    const expiresAt = new Date(
      now.getTime() + 15 * 60 * 1000,
    );

    const { data: savedTrade, error: insertError } =
      await adminClient
        .from("mt5_trade_queue")
        .insert({
          account_number: ACCOUNT_NUMBER,
          account_server: ACCOUNT_SERVER,
          symbol,
          side,
          lot_size: 0.01,
          entry_price: entry,
          stop_loss: stopLoss,
          take_profit: takeProfit,
          status: "approved",
          approved_at: nowIso,
          expires_at: expiresAt.toISOString(),
        })
        .select(
          "id, symbol, side, entry_price, stop_loss, take_profit, status, expires_at",
        )
        .single();

    if (insertError) {
      console.error("Approval insert failed:", insertError);

      return response({
        error: "Could not save the trade approval.",
      }, 500);
    }

    // 11. Confirm approval only after successful database insertion.
    return response({
      success: true,
      message: "Approval saved after live-price validation. No MT5 order has been placed by this function.",
      trade: savedTrade,
      verified_live_price: livePrice,
      price_deviation_percent: Number(
        deviationPercent.toFixed(5),
      ),
    });
  } catch (error) {
    console.error("Approval function error:", error);

    return response({
      error: "Unexpected approval error. No approval confirmation was returned.",
    }, 500);
  }
});
