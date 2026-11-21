import { createClient } from "npm:@supabase/supabase-js@2";

const ACCOUNT_NUMBER = "224224761";
const ACCOUNT_SERVER = "Exness-MT5Real30";
const USER_ID = "eb254614-cc9d-4846-adb6-fd45e5594a96";
const SYMBOLS = ["BTCUSD", "EURUSD", "XAUUSD", "USDJPY"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-supabase-api-version, x-bridge-secret",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
/**
 * Real-account order execution is intentionally hard-disabled in this build.
 * Do not re-enable it through an environment variable. Reopening Real execution
 * requires a separately reviewed and explicitly authorized release.
 */
function enabled(): boolean {
  return false;
}
function validUuid(v: unknown): v is string {
  return typeof v === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
function validPosition(v: unknown): v is number {
  return typeof v === "number" && Number.isSafeInteger(v) && v > 0;
}
function validNum(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}
function accountMatches(body: Record<string, unknown>): boolean {
  return body.account_number === ACCOUNT_NUMBER &&
    body.account_server === ACCOUNT_SERVER;
}

async function saveClosedJournal(body: Record<string, unknown>): Promise<Response | null> {
  if (!validPosition(body.mt5_position_id) ||
      !validNum(body.exit_price) || body.exit_price <= 0 ||
      !validNum(body.profit_loss) ||
      !validNum(body.opened_at_unix) || body.opened_at_unix <= 0 ||
      !validNum(body.closed_at_unix) || body.closed_at_unix <= 0 ||
      body.closed_at_unix < body.opened_at_unix) {
    return json({ success: false, message: "Invalid closed-trade journal values." }, 400);
  }

  const { data: queued, error: queueError } = await supabase
    .from("mt5_trade_queue")
    .select("id,symbol,side,lot_size,entry_price,stop_loss,take_profit,mt5_position_id,status")
    .eq("account_number", ACCOUNT_NUMBER)
    .eq("account_server", ACCOUNT_SERVER)
    .eq("mt5_position_id", body.mt5_position_id)
    .eq("status", "executed")
    .maybeSingle();

  if (queueError) {
    console.error("Closed journal queue lookup failed:", queueError);
    return json({ success: false, message: "Could not match closed position." }, 500);
  }
  if (!queued) {
    return json({ success: false, message: "No executed Real trade matches this position ID." }, 404);
  }
  if (!SYMBOLS.includes(queued.symbol) ||
      !["BUY", "SELL"].includes(queued.side)) {
    return json({ success: false, message: "Matched trade has invalid details." }, 409);
  }

  const currency = typeof body.currency === "string" &&
      /^[A-Z]{3,10}$/.test(body.currency) ? body.currency : "USD";

  const journalRow = {
    user_id: USER_ID,
    account_number: ACCOUNT_NUMBER,
    account_server: ACCOUNT_SERVER,
    mt5_position_id: body.mt5_position_id,
    symbol: queued.symbol,
    direction: queued.side,
    entry_price: Number(queued.entry_price),
    stop_loss: queued.stop_loss === null ? null : Number(queued.stop_loss),
    take_profit: queued.take_profit === null ? null : Number(queued.take_profit),
    exit_price: body.exit_price,
    lot_size: Number(queued.lot_size),
    status: "CLOSED",
    profit_loss: body.profit_loss,
    opened_at: new Date((body.opened_at_unix as number) * 1000).toISOString(),
    closed_at: new Date((body.closed_at_unix as number) * 1000).toISOString(),
    currency,
  };

  const { data: saved, error: saveError } = await supabase
    .from("trades")
    .upsert(journalRow, {
      onConflict: "account_number,account_server,mt5_position_id",
    })
    .select("id,symbol,direction,status,mt5_position_id,entry_price,exit_price,lot_size,profit_loss,opened_at,closed_at,currency")
    .single();

  if (saveError) {
    console.error("Closed trade journal save failed:", saveError);
    return json({ success: false, message: "Could not save closed trade journal entry." }, 500);
  }
  return json({ success: true, saved: true, trade: saved });
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);
  if (req.method === "GET" && url.searchParams.get("action") === "dashboard_snapshot") {
    const authorization = req.headers.get("authorization") ?? "";
    if (!authorization.startsWith("Bearer ")) return json({ success: false, message: "Sign in required." }, 401);
    const authClient = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authorization } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: authData, error: authError } = await authClient.auth.getUser();
    if (authError || authData.user?.id !== USER_ID) return json({ success: false, message: "Not authorized." }, 403);
    const { data: snapshot, error } = await supabase.from("mt5_account_snapshots")
      .select("balance,equity,margin,free_margin,currency,leverage,open_positions,captured_at,account_server")
      .eq("account_number", ACCOUNT_NUMBER).eq("account_server", ACCOUNT_SERVER)
      .order("captured_at", { ascending: false }).limit(1).maybeSingle();
    if (error) return json({ success: false, message: "Could not retrieve Real MT5 snapshot." }, 500);
    if (!snapshot) return json({ success: false, connected: false, message: "No Real MT5 snapshot received yet." }, 404);
    const ageSeconds = Math.max(0, Math.floor((Date.now() - new Date(snapshot.captured_at).getTime()) / 1000));
    return json({ success: true, connected: ageSeconds <= 180, stale: ageSeconds > 180,
      message: ageSeconds <= 180 ? "Real MT5 snapshot received successfully." : "Real MT5 snapshot is stale; check the MT5 EA.",
      snapshot, age_seconds: ageSeconds, account_server: ACCOUNT_SERVER, source: "MT5 Real bridge" });
  }

  const expected = Deno.env.get("MT5_BRIDGE_SECRET") ?? "";
  const supplied = req.headers.get("x-bridge-secret") ?? "";
  if (expected.length < 32 || !sameSecret(supplied, expected)) {
    return json({ success: false, message: "Bridge authentication failed." }, 401);
  }

  if (req.method === "GET") {
    const action = url.searchParams.get("action");
    const accountNumber = url.searchParams.get("account_number");
    const accountServer = url.searchParams.get("account_server");
    if (accountNumber !== ACCOUNT_NUMBER || accountServer !== ACCOUNT_SERVER) {
      return json({ success: false, message: "Wrong Real MT5 account." }, 403);
    }

    if (action === "health") {
      return json({
        success: true, connected: true, account_server: ACCOUNT_SERVER,
        read_only: !enabled(), trading_enabled: enabled(),
        message: enabled()
          ? "Real bridge authenticated; execution gate is enabled."
          : "Real bridge authenticated; live execution remains safely disabled.",
      });
    }

    if (action === "peek" || action === "peek_close") {
      const isClose = action === "peek_close";
      if (!enabled()) {
        return json({
          success: true,
          ...(isClose ? { has_close: false, close: null } : { has_trade: false, trade: null }),
          trading_enabled: false,
          message: "Real-account execution is hard-disabled; no queue item is exposed.",
        });
      }
      const table = isClose ? "mt5_close_queue" : "mt5_trade_queue";
      const columns = isClose
        ? "id,mt5_position_id,symbol,lot_size,status,approved_at,expires_at"
        : "id,symbol,side,lot_size,entry_price,stop_loss,take_profit,status,approved_at,expires_at";
      const { data, error } = await supabase.from(table)
        .select(columns)
        .eq("account_number", ACCOUNT_NUMBER).eq("account_server", ACCOUNT_SERVER)
        .eq("status", "approved").gt("expires_at", new Date().toISOString())
        .order("approved_at", { ascending: true }).limit(1);
      if (error) return json({ success: false, message: isClose ? "Close queue read failed." : "Trade queue read failed." }, 500);
      const row = data?.[0] ?? null;
      return json({
        success: true,
        ...(isClose
          ? { has_close: !!row, close: row, ...(row ?? {}) }
          : { has_trade: !!row, trade: row, ...(row ?? {}) }),
        trading_enabled: enabled(),
      });
    }
    return json({ success: false, message: "Unknown GET action." }, 400);
  }

  if (req.method !== "POST") return json({ success: false, message: "Method not allowed." }, 405);
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
  if (!accountMatches(body)) return json({ success: false, message: "Wrong Real MT5 account." }, 403);

  if (body.action === "account_snapshot") {
    const fields = ["balance","equity","margin","free_margin","leverage","open_positions"];
    for (const f of fields) if (!validNum(body[f])) return json({ success: false, message: "Invalid account snapshot." }, 400);
    if (!Number.isInteger(body.open_positions) || (body.open_positions as number) < 0 ||
        (body.balance as number) < 0 || (body.equity as number) < 0 ||
        (body.margin as number) < 0 || (body.free_margin as number) < 0 ||
        (body.leverage as number) <= 0 || typeof body.currency !== "string") {
      return json({ success: false, message: "Invalid account snapshot values." }, 400);
    }
    const { error } = await supabase.from("mt5_account_snapshots").upsert({
      account_number: ACCOUNT_NUMBER, account_server: ACCOUNT_SERVER,
      balance: body.balance, equity: body.equity, margin: body.margin,
      free_margin: body.free_margin, currency: body.currency,
      leverage: body.leverage, open_positions: body.open_positions,
      captured_at: new Date().toISOString(),
    }, { onConflict: "account_number,account_server" });
    if (error) return json({ success: false, message: "Snapshot save failed." }, 500);
    return json({ success: true, saved: true });
  }

  if (body.action === "claim" || body.action === "claim_close") {
    if (!enabled()) return json({ success: false, claimed: false, trading_enabled: false, message: "Real execution is disabled by the server safety lock." }, 423);
    if (!validUuid(body.id)) return json({ success: false, message: "Invalid request ID." }, 400);
    const isClose = body.action === "claim_close";
    const rpc = isClose ? "claim_mt5_close_for_account" : "claim_mt5_trade_for_account";
    const args = isClose
      ? { p_close_id: body.id, p_account_number: ACCOUNT_NUMBER, p_account_server: ACCOUNT_SERVER }
      : { p_trade_id: body.id, p_account_number: ACCOUNT_NUMBER, p_account_server: ACCOUNT_SERVER };
    const { data, error } = await supabase.rpc(rpc, args);
    if (error) return json({ success: false, claimed: false, message: "Request claim failed." }, 500);
    const claimed = Array.isArray(data) ? data[0] : data;
    if (!claimed || claimed.id !== body.id) return json({ success: false, claimed: false, message: "Request unavailable, expired, or already claimed." }, 409);
    return json({ success: true, claimed: true, trading_enabled: true, [isClose ? "close" : "trade"]: claimed });
  }

  if (body.action === "report") {
    if (!validUuid(body.id) || !["executed","failed"].includes(String(body.status)) ||
        typeof body.execution_message !== "string" || !body.execution_message.trim() ||
        body.execution_message.length > 1000) {
      return json({ success: false, message: "Invalid execution report." }, 400);
    }
    if (body.status === "executed" && (!validPosition(body.mt5_position_id) ||
        typeof body.mt5_ticket !== "string" || !body.mt5_ticket.trim())) {
      return json({ success: false, message: "Executed report requires broker ticket and position ID." }, 400);
    }
    const update: Record<string, unknown> = {
      status: body.status, execution_message: body.execution_message,
      mt5_ticket: body.status === "executed" ? body.mt5_ticket : null,
      mt5_position_id: body.status === "executed" ? body.mt5_position_id : null,
      executed_at: body.status === "executed" ? new Date().toISOString() : null,
    };
    const { data, error } = await supabase.from("mt5_trade_queue").update(update)
      .eq("id", body.id).eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER).eq("status", "executing")
      .select("id,status,mt5_ticket,mt5_position_id,execution_message,executed_at").maybeSingle();
    if (error || !data) return json({ success: false, message: "No matching executing Real trade was updated." }, error ? 500 : 409);
    return json({ success: true, reported: true, trade: data });
  }

  if (body.action === "journal_closed") {
    const result = await saveClosedJournal(body);
    return result ?? json({ success: false, message: "Journal processing failed." }, 500);
  }

  if (body.action === "close_report") {
    if (!validUuid(body.id) || !validPosition(body.mt5_position_id) ||
        !["executed","failed"].includes(String(body.status)) ||
        typeof body.execution_message !== "string" ||
        !body.execution_message.trim() || body.execution_message.length > 1000) {
      return json({ success: false, message: "Invalid close report." }, 400);
    }

    if (body.status === "executed") {
      const journalResult = await saveClosedJournal(body);
      if (journalResult && journalResult.status !== 200) return journalResult;
    }

    const { data, error } = await supabase.from("mt5_close_queue").update({
      status: body.status,
      executed_at: body.status === "executed" ? new Date().toISOString() : null,
      close_price: body.status === "executed" ? body.close_price : null,
      profit_loss: body.status === "executed" ? body.profit_loss : null,
      execution_message: body.execution_message,
    }).eq("id", body.id).eq("account_number", ACCOUNT_NUMBER)
      .eq("account_server", ACCOUNT_SERVER).eq("mt5_position_id", body.mt5_position_id)
      .eq("status", "executing").select("id,status,mt5_position_id,close_price,profit_loss").maybeSingle();

    if (error || !data) return json({ success: false, message: "No matching executing close request was updated." }, error ? 500 : 409);
    return json({ success: true, reported: true, close: data });
  }

  return json({ success: false, message: "Unknown action." }, 400);
}

Deno.serve(async (req: Request) => {
  try { return await handle(req); }
  catch (error) {
    console.error("mt5-real-bridge error:", error);
    return json({ success: false, message: "Real bridge internal error." }, 500);
  }
});
