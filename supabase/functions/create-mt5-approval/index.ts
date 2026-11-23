
import { createClient } from "npm:@supabase/supabase-js@2";
import { validateIndependentCandidateProof } from "../_shared/approval-proof.ts";
import { validateApprovalExecutionPrice } from "../_shared/approval-price.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DASHBOARD_USER_ID = "eb254614-cc9d-4846-adb6-fd45e5594a96";
const ACCOUNT_NUMBER = "486163696";
const ACCOUNT_SERVER = "Exness-MT5Trial10";

const ALLOWED_SYMBOLS = ["BTCUSD", "EURUSD", "XAUUSD", "USDJPY"];
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
    const proofExpiry = Date.parse(proof?.expiresAt || "");
    if (
      proof?.source !== "mktradehome-technical-engine" ||
      proof?.engineVersion !== "1.0.0" ||
      proof?.engineVerified !== true ||
      proof?.verificationStatus !== "PASSED" ||
      !Number.isFinite(proofExpiry) || proofExpiry <= Date.now()
    ) {
      return response({ error: "BLOCKED: independent technical-engine proof is missing, unsupported or expired." }, 403);
    }

    // Recheck saved indicator evidence server-side; do not trust a dashboard label.
    const validation = validateIndependentCandidateProof(candidate as any, proof as any, MAX_QUOTE_AGE_SECONDS);
    if (!validation.valid || proof?.source !== "mktradehome-technical-engine" ||
        proof?.engineVersion !== "1.0.0" || proof?.engineVerified !== true ||
        proof?.verificationStatus !== "PASSED" || proof?.qualityScoreIsWinProbability !== false) {
      return response({ error: "BLOCKED: " + (validation.reason || "independent engine proof is missing or unsupported") }, 403);
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

    const quoteBid = Number(quote.bid);
    const quoteAsk = Number(quote.ask);
    const midValue = Number(quote.mid);
    const livePrice = Number.isFinite(midValue) ? midValue : (quoteBid + quoteAsk) / 2;
    const quoteAge = Number(quote.quoteAgeSeconds);

    // 4. Reject stale quotes and closed markets.
    if (
      quote.stale !== false ||
      (symbol !== "BTCUSD" && String(quote.marketState).toLowerCase() !== "open") ||
      !Number.isFinite(livePrice) ||
      livePrice <= 0 ||
      !Number.isFinite(quoteBid) || !Number.isFinite(quoteAsk) || quoteBid <= 0 || quoteAsk < quoteBid ||
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

    // 5. Revalidate at the executable side of the live quote.
    // BUY orders execute at Ask; SELL orders execute at Bid. Keep the
    // candidate's original SL/TP fixed and reject if current RR or structure
    // no longer qualifies. This replaces the direction-blind 0.05% midpoint
    // comparison without weakening the strategy's ATR entry-zone limit.
    const priceValidation = validateApprovalExecutionPrice({
      side: side as "BUY" | "SELL",
      entry,
      stopLoss,
      takeProfit1: takeProfit,
      takeProfit2,
      bid: quoteBid,
      ask: quoteAsk,
      timeframe15m: {
        close: Number(proof?.timeframes?.["15M"]?.close),
        atr14: Number(proof?.timeframes?.["15M"]?.atr14),
      },
      originalQuote: {
        bid: Number(proof?.quote?.bid),
        ask: Number(proof?.quote?.ask),
      },
    });

    if (!priceValidation.valid || !Number.isFinite(priceValidation.executionEntry)) {
      console.warn("Approval price validation blocked:", {
        symbol,
        side,
        reason: priceValidation.reason,
        quoteAge,
        spread: quoteAsk - quoteBid,
        candidateEntry: entry,
        liveMid: livePrice,
      });
      return response({
        error: priceValidation.reason,
        submitted_entry: entry,
        live_bid: quoteBid,
        live_ask: quoteAsk,
        quote_age_seconds: quoteAge,
      }, 409);
    }
    const executionPrice = priceValidation.executionEntry;

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
          entry_price: executionPrice,
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
      verified_live_price: executionPrice,
      quote_side: side === "BUY" ? "ASK" : "BID",
      verified_spread: priceValidation.spread,
      verified_risk: priceValidation.risk,
      verified_reward_1: priceValidation.reward1,
      verified_reward_2: priceValidation.reward2,
      verified_rr_1: priceValidation.rr1,
      verified_rr_2: priceValidation.rr2,
      drift_from_signal_atr: priceValidation.driftFromSignalAtr,
    });
  } catch (error) {
    console.error("Approval function error:", error);

    return response({
      error: "Unexpected approval error. No approval confirmation was returned.",
    }, 500);
  }
});
