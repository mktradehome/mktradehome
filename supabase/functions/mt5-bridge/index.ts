
import { createClient } from "npm:@supabase/supabase-js@2";
import { parseConfirmedBrokerFill } from "../_shared/execution-fill.ts";

const ACCOUNT_NUMBER = "486163696";
const ACCOUNT_SERVER = "Exness-MT5Trial10";
const DASHBOARD_USER_ID = "eb254614-cc9d-4846-adb6-fd45e5594a96";

function isExecutionEnabled(): boolean {
  return Deno.env.get("MT5_EXECUTION_ENABLED")?.toLowerCase() === "true";
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-bridge-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function requiredSecret(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing Supabase secret: ${name}`);
  return value;
}

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

function validNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function validPositionId(value: unknown): value is number {
  return typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value > 0;
}

function validUuid(value: unknown): value is string {
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      .test(value);
}

const supabase = createClient(
  requiredSecret("SUPABASE_URL"),
  requiredSecret("SUPABASE_SERVICE_ROLE_KEY"),
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
);

async function checkBridgeSecret(req: Request): Promise<boolean> {
  const supplied = req.headers.get("x-bridge-secret") ?? "";
  const expected = requiredSecret("MT5_BRIDGE_SECRET");
  return sameSecret(supplied, expected);
}

async function verifyDashboardUser(req: Request): Promise<boolean> {
  const authorization = req.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");

  if (!token || token === authorization) return false;

  const { data, error } = await supabase.auth.getUser(token);

  return !error &&
    !!data.user &&
    data.user.id === DASHBOARD_USER_ID;
}

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const action = url.searchParams.get("action");

  // Dashboard account snapshot (Demo or read-only Real).
  if (req.method === "GET" && action === "dashboard_snapshot") {
    if (!(await verifyDashboardUser(req))) {
      return json({ success: false, message: "Not authorized." }, 403);
    }

    const requestedAccount = url.searchParams.get("account") ?? "demo";
    if (requestedAccount !== "demo" && requestedAccount !== "real") {
      return json({ success: false, message: "Unknown account view." }, 400);
    }

    let query = supabase
      .from("mt5_account_snapshots")
      .select(
        "account_number,account_server,balance,equity,margin,free_margin,currency,leverage,open_positions,positions,positions_complete,captured_at",
      );

    if (requestedAccount === "real") {
      query = query.eq("account_server", "Exness-MT5Real30")
        .order("captured_at", { ascending: false }).limit(1);
    } else {
      query = query.eq("account_number", ACCOUNT_NUMBER)
        .eq("account_server", ACCOUNT_SERVER);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      return json({
        success: false,
        message: "Could not load account snapshot.",
      }, 500);
    }

    if (!data) {
      return json({
        success: false,
        message: requestedAccount === "real"
          ? "No Real account snapshot is available yet. Check the Real MT5 terminal connection."
          : "No Demo account snapshot is available yet.",
      }, 404);
    }

    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(data.captured_at).getTime()) / 1000));
    return json({
      success: true,
      snapshot: data,
      age_seconds: ageSeconds,
      stale: ageSeconds > 180,
      account_view: requestedAccount,
      read_only: requestedAccount === "real",
    });
  }

  // Dashboard execution history.
  if (req.method === "GET" && action === "dashboard_queue") {
    if (!(await verifyDashboardUser(req))) {
      return json({ success: false, message: "Not authorized." }, 403);
    }

    const { data, error } = await supabase
      .from("mt5_trade_queue")
      .select(
        "id,symbol,side,lot_size,entry_price,stop_loss,take_profit,status,approved_at,expires_at,executed_at,mt5_ticket,mt5_position_id,execution_message,created_at",
      )
      .eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Dashboard queue read failed:", error);
      return json({
        success: false,
        message: "Could not load MT5 execution history.",
      }, 500);
    }

    return json({
      success: true,
      trades: data ?? [],
      count: data?.length ?? 0,
    });
  }

  // All MT5 bridge actions require the private bridge secret.
  if (!(await checkBridgeSecret(req))) {
    return json({
      success: false,
      message: "Invalid bridge secret.",
    }, 401);
  }

  // Bridge health.
  if (req.method === "GET" && action === "health") {
    const { error } = await supabase
      .from("mt5_trade_queue")
      .select("id")
      .limit(1);

    if (error) {
      return json({
        success: false,
        connected: false,
        database_access: false,
        execution_supported: true,
        trading_enabled: false,
        message: "Database health check failed.",
      }, 500);
    }

    const enabled = isExecutionEnabled();

    return json({
      success: true,
      connected: true,
      database_access: true,
      execution_supported: true,
      trading_enabled: enabled,
      message: enabled
        ? "Bridge connected. Execution gate enabled."
        : "Bridge connected. Execution remains disabled.",
    });
  }

  // Read-only inspection of approved queue.
  if (req.method === "GET" && action === "peek") {
    const { data, error } = await supabase
      .from("mt5_trade_queue")
      .select(
        "id,account_number,account_server,symbol,side,lot_size,entry_price,stop_loss,take_profit,status,approved_at,expires_at",
      )
      .eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER)
      .eq("status", "approved")
      .gt("expires_at", new Date().toISOString())
      .order("approved_at", { ascending: true })
      .limit(1);

    if (error) {
      return json({
        success: false,
        message: "Could not read approved trade queue.",
      }, 500);
    }

    const foundTrade = data?.[0] ?? null;
    const enabled = isExecutionEnabled();

    return json({
      success: true,
      read_only: true,
      has_trade: foundTrade !== null,
      trading_enabled: enabled,
      trade: foundTrade,
      ...(foundTrade ?? {}),
    });
  }

  // Unapproved automatic execution is not supported.
  if (req.method === "GET" && action === "next") {
    return json({
      success: false,
      trading_enabled: false,
      message: "Automatic trade execution is not supported.",
    }, 403);
  }

  if (req.method !== "POST") {
    return json({
      success: false,
      message: "Unsupported request.",
    }, 405);
  }

  let body: Record<string, unknown>;

  try {
    const parsed = await req.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ success: false, message: "Invalid JSON body." }, 400);
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return json({ success: false, message: "Invalid JSON body." }, 400);
  }

  // Save latest Demo or registered Real MT5 account snapshot.
  // This endpoint only stores account totals; it does not approve or execute trades.
  if (body.action === "account_snapshot") {
    const incomingNumber = typeof body.account_number === "string" ? body.account_number : "";
    const incomingServer = typeof body.account_server === "string" ? body.account_server : "";
    let allowedAccount = incomingNumber === ACCOUNT_NUMBER && incomingServer === ACCOUNT_SERVER;

    if (!allowedAccount && incomingServer === "Exness-MT5Real30" && incomingNumber.length > 0) {
      const { data: registeredReal, error: registeredError } = await supabase
        .from("mt5_account_snapshots")
        .select("id")
        .eq("account_number", incomingNumber)
        .eq("account_server", incomingServer)
        .maybeSingle();

      if (registeredError) {
        return json({ success: false, message: "Could not verify registered Real account." }, 500);
      }
      allowedAccount = !!registeredReal;
    }

    if (!allowedAccount) {
      return json({ success: false, message: "Wrong or unregistered MT5 account." }, 403);
    }

    const numericFields = [
      "balance",
      "equity",
      "margin",
      "free_margin",
      "leverage",
      "open_positions",
    ];

    for (const field of numericFields) {
      if (!validNumber(body[field])) {
        return json({
          success: false,
          message: `Invalid account field: ${field}.`,
        }, 400);
      }
    }

    const openPositions = body.open_positions as number;
    const balance = body.balance as number;
    const equity = body.equity as number;
    const margin = body.margin as number;
    const freeMargin = body.free_margin as number;
    const leverage = body.leverage as number;

    if (
      !Number.isInteger(openPositions) ||
      openPositions < 0 ||
      balance < 0 ||
      equity < 0 ||
      margin < 0 ||
      freeMargin < 0 ||
      leverage <= 0 ||
      typeof body.currency !== "string" ||
      body.currency.length < 1 ||
      body.currency.length > 10
    ) {
      return json({
        success: false,
        message: "Invalid account snapshot values.",
      }, 400);
    }

    const positions = body.positions === undefined ? [] : body.positions;
    if (!Array.isArray(positions) || positions.length > 100) {
      return json({ success: false, message: "Invalid open positions snapshot." }, 400);
    }
    for (const position of positions) {
      if (!position || typeof position !== "object" || Array.isArray(position) ||
          !validPositionId(position.position_id) ||
          !validPositionId(position.ticket) ||
          typeof position.symbol !== "string" || position.symbol.length < 3 || position.symbol.length > 32 ||
          !["BUY", "SELL"].includes(position.side) ||
          !validNumber(position.volume) || position.volume <= 0 || position.volume > 100 ||
          !validNumber(position.entry_price) || position.entry_price <= 0 ||
          !validNumber(position.stop_loss) || position.stop_loss < 0 ||
          !validNumber(position.take_profit) || position.take_profit < 0 ||
          !validNumber(position.current_price) || position.current_price <= 0 ||
          !validNumber(position.profit) ||
          !validNumber(position.swap) ||
          !validNumber(position.opened_at_unix) || position.opened_at_unix <= 0 ||
          !Number.isSafeInteger(position.opened_at_unix)) {
        return json({ success: false, message: "Invalid open position details." }, 400);
      }
    }

    const snapshot = {
      account_number: incomingNumber,
      account_server: incomingServer,
      balance: body.balance,
      equity: body.equity,
      margin: body.margin,
      free_margin: body.free_margin,
      currency: body.currency,
      leverage: body.leverage,
      open_positions: body.open_positions,
      positions,
      positions_complete: Array.isArray(body.positions),
      captured_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("mt5_account_snapshots")
      .upsert(snapshot, {
        onConflict: "account_number,account_server",
      });

    if (error) {
      return json({
        success: false,
        message: "Could not save account snapshot.",
      }, 500);
    }

    return json({ success: true, saved: true });
  }

  // Record a position only after MT5 confirms it is fully closed.
  if (body.action === "close_report") {
    if (!validPositionId(body.mt5_position_id)) return json({ success: false, message: "Invalid MT5 position ID." }, 400);
    if (!validNumber(body.exit_price) || body.exit_price <= 0 || !validNumber(body.profit_loss) ||
        !validNumber(body.opened_at_unix) || body.opened_at_unix <= 0 ||
        !validNumber(body.closed_at_unix) || body.closed_at_unix <= 0 ||
        body.closed_at_unix < body.opened_at_unix) {
      return json({ success: false, message: "Invalid closing trade values." }, 400);
    }
    if (body.account_number !== ACCOUNT_NUMBER || body.account_server !== ACCOUNT_SERVER) {
      return json({ success: false, message: "Wrong MT5 account." }, 403);
    }
    if (body.mt5_opening_deal_ticket !== undefined &&
        body.mt5_opening_deal_ticket !== null &&
        !validPositionId(body.mt5_opening_deal_ticket)) {
      return json({ success: false, message: "Invalid MT5 opening deal ticket." }, 400);
    }

    const { data: positionMatch, error: queueError } = await supabase
      .from("mt5_trade_queue")
      .select("id,symbol,side,lot_size,entry_price,stop_loss,take_profit,mt5_position_id,mt5_ticket,execution_message,status")
      .eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER)
      .eq("mt5_position_id", body.mt5_position_id)
      .eq("status", "executed")
      .maybeSingle();

    if (queueError) {
      console.error("Close report queue lookup failed:", queueError);
      return json({ success: false, message: "Could not match closed position." }, 500);
    }

    let queued = positionMatch;

    // Backward-compatible recovery: the EA's opening deal ticket is the exact
    // MT5 ticket saved when the approved order was first confirmed.
    if (!queued && validPositionId(body.mt5_opening_deal_ticket)) {
      const { data: ticketMatch, error: ticketError } = await supabase
        .from("mt5_trade_queue")
        .select("id,symbol,side,lot_size,entry_price,stop_loss,take_profit,mt5_position_id,mt5_ticket,execution_message,status")
        .eq("account_number", ACCOUNT_NUMBER)
        .eq("account_server", ACCOUNT_SERVER)
        .eq("mt5_ticket", String(body.mt5_opening_deal_ticket))
        .eq("status", "executed")
        .maybeSingle();

      if (ticketError) {
        console.error("Opening deal ticket lookup failed:", ticketError);
        return json({ success: false, message: "Could not recover closed position match." }, 500);
      }

      if (ticketMatch) {
        if (ticketMatch.mt5_position_id !== null &&
            Number(ticketMatch.mt5_position_id) !== body.mt5_position_id) {
          return json({ success: false, message: "Opening deal ticket is already linked to a different position ID." }, 409);
        }

        if (ticketMatch.mt5_position_id === null) {
          const { data: linked, error: linkError } = await supabase
            .from("mt5_trade_queue")
            .update({ mt5_position_id: body.mt5_position_id })
            .eq("id", ticketMatch.id)
            .eq("account_number", ACCOUNT_NUMBER)
            .eq("account_server", ACCOUNT_SERVER)
            .eq("status", "executed")
            .is("mt5_position_id", null)
            .select("id,symbol,side,lot_size,entry_price,stop_loss,take_profit,mt5_position_id,mt5_ticket,execution_message,status")
            .maybeSingle();

          if (linkError) {
            console.error("Position ID recovery update failed:", linkError);
            return json({ success: false, message: "Could not save recovered position match." }, 500);
          }

          if (!linked) {
            return json({ success: false, message: "Position match changed during recovery; retry the report." }, 409);
          }

          queued = linked;
        } else {
          queued = ticketMatch;
        }
      }
    }

    if (!queued) {
      return json({ success: false, message: "No executed queue trade matches this position ID or opening deal ticket." }, 404);
    }
    if (!["BTCUSD", "EURUSD", "XAUUSD", "USDJPY"].includes(queued.symbol) ||
        !["BUY", "SELL"].includes(queued.side)) {
      return json({ success: false, message: "Matched queue trade has invalid details." }, 409);
    }
    const brokerFill = parseConfirmedBrokerFill(queued.execution_message);

    const journalRow = {
      user_id: DASHBOARD_USER_ID,
      account_number: ACCOUNT_NUMBER,
      account_server: ACCOUNT_SERVER,
      mt5_position_id: body.mt5_position_id,
      symbol: queued.symbol,
      direction: queued.side,
      entry_price: Number(queued.entry_price),
      requested_entry_price: Number(queued.entry_price),
      broker_entry_price: brokerFill?.price ?? null,
      mt5_opening_deal_ticket: queued.mt5_ticket ?? null,
      stop_loss: queued.stop_loss === null ? null : Number(queued.stop_loss),
      take_profit: queued.take_profit === null ? null : Number(queued.take_profit),
      exit_price: body.exit_price,
      lot_size: Number(queued.lot_size),
      status: "CLOSED",
      profit_loss: body.profit_loss,
      opened_at: new Date(body.opened_at_unix * 1000).toISOString(),
      closed_at: new Date(body.closed_at_unix * 1000).toISOString(),
      currency: typeof body.currency === "string" && /^[A-Z]{3,10}$/.test(body.currency) ? body.currency : "USD",
    };
    const { data: saved, error: saveError } = await supabase
      .from("trades")
      .upsert(journalRow, { onConflict: "account_number,account_server,mt5_position_id" })
      .select("id,symbol,direction,status,mt5_position_id,entry_price,exit_price,lot_size,profit_loss,opened_at,closed_at,currency")
      .single();
    if (saveError) {
      console.error("Closed trade journal save failed:", saveError);
      return json({ success: false, message: "Could not save closed trade journal entry." }, 500);
    }
    return json({ success: true, saved: true, trade: saved });
  }

  // Claim one exact approved trade.
  if (body.action === "claim") {
    if (!validUuid(body.id)) {
      return json({ success: false, message: "Invalid trade ID." }, 400);
    }

    if (!isExecutionEnabled()) {
      return json({
        success: false,
        claimed: false,
        trading_enabled: false,
        message: "Execution is disabled by the server safety lock.",
      }, 423);
    }

    const { data, error } = await supabase.rpc("claim_mt5_trade", {
      p_trade_id: body.id,
    });

    if (error) {
      console.error("Trade claim database error:", error);
      return json({
        success: false,
        claimed: false,
        trading_enabled: true,
        message: "Trade claim failed.",
      }, 500);
    }

    const claimedTrade = Array.isArray(data) ? data[0] : data;

    if (!claimedTrade || claimedTrade.id !== body.id) {
      return json({
        success: false,
        claimed: false,
        trading_enabled: true,
        message: "Trade is unavailable, expired, or already claimed.",
      }, 409);
    }

    return json({
      success: true,
      claimed: true,
      trading_enabled: true,
      trade: claimedTrade,
      ...claimedTrade,
    });
  }

  // Report one execution result.
  if (body.action === "report") {
    if (!validUuid(body.id)) {
      return json({ success: false, message: "Invalid trade ID." }, 400);
    }

    if (body.status !== "executed" && body.status !== "failed") {
      return json({
        success: false,
        message: "Report status must be executed or failed.",
      }, 400);
    }

    if (
      typeof body.execution_message !== "string" ||
      body.execution_message.trim().length === 0 ||
      body.execution_message.length > 1000
    ) {
      return json({
        success: false,
        message: "Invalid execution message.",
      }, 400);
    }

    if (
      body.status === "executed" &&
      (typeof body.mt5_ticket !== "string" ||
        body.mt5_ticket.trim().length === 0 ||
        body.mt5_ticket.length > 100)
    ) {
      return json({
        success: false,
        message: "An MT5 ticket is required for an executed trade.",
      }, 400);
    }

    // Position ID is optional until the EA is updated.
    if (
      body.mt5_position_id !== undefined &&
      body.mt5_position_id !== null &&
      !validPositionId(body.mt5_position_id)
    ) {
      return json({
        success: false,
        message: "Invalid MT5 position ID.",
      }, 400);
    }

    const update: Record<string, unknown> = {
      status: body.status,
      mt5_ticket: body.status === "executed" ? body.mt5_ticket : null,
      execution_message: body.execution_message,
    };

    if (body.status === "executed") {
      update.executed_at = new Date().toISOString();

      if (validPositionId(body.mt5_position_id)) {
        update.mt5_position_id = body.mt5_position_id;
      }
    } else {
      update.executed_at = null;
      update.mt5_position_id = null;
    }

    const { data, error } = await supabase
      .from("mt5_trade_queue")
      .update(update)
      .eq("id", body.id)
      .eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER)
      .eq("status", "executing")
      .select(
        "id,status,mt5_ticket,mt5_position_id,execution_message,executed_at",
      )
      .maybeSingle();

    if (error) {
      console.error("Trade report database error:", error);
      return json({
        success: false,
        message: "Could not save execution report.",
      }, 500);
    }

    if (!data) {
      return json({
        success: false,
        message: "No matching executing trade was found to update.",
      }, 409);
    }

    return json({
      success: true,
      reported: true,
      trade: data,
    });
  }

  return json({ success: false, message: "Unknown action." }, 400);
}

Deno.serve(async (req: Request) => {
  try {
    return await handleRequest(req);
  } catch (error) {
    console.error("mt5-bridge error:", error);
    return json({
      success: false,
      message: "Bridge internal error.",
    }, 500);
  }
});
