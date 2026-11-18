import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {

  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":

    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods": "POST, OPTIONS",

};

function respond(data: object, status = 200) {

  return new Response(JSON.stringify(data), {

    status,

    headers: {

      ...corsHeaders,

      "Content-Type": "application/json",

    },

  });

}

Deno.serve(async (req) => {

  if (req.method === "OPTIONS") {

    return new Response("ok", { headers: corsHeaders });

  }

  if (req.method !== "POST") {

    return respond({ error: "Method not allowed" }, 405);

  }

  try {

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

    const supabaseKey =

      Deno.env.get("SUPABASE_ANON_KEY") ||

      Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

    const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");

    const authHeader = req.headers.get("Authorization");

    if (!supabaseKey || !botToken || !authHeader) {

      return respond({ error: "Missing configuration or login" }, 401);

    }

    const supabase = createClient(supabaseUrl, supabaseKey, {

      global: {

        headers: { Authorization: authHeader },

      },

    });

    const { data: userData, error: userError } =

      await supabase.auth.getUser();

    if (userError || !userData.user) {

      return respond({ error: "Please log in again" }, 401);

    }

    const body = await req.json();
    const message = body.message;
    if (!message || typeof message !== "string") return respond({ error: "Message is required" }, 400);

    // Only the connection test is allowed without a persisted approval proof.
    const isConnectionTest = message.startsWith("Mktradehome Telegram connected successfully.");
    if (!isConnectionTest) {
      const candidateId = Number(body.candidate_id);
      const queueId = String(body.queue_id || "");
      if (!Number.isSafeInteger(candidateId) || candidateId <= 0 || !/^[0-9a-f-]{36}$/i.test(queueId)) return respond({ error: "Trading alerts require a verified candidate and saved approval." }, 403);
      if (userData.user.id !== "eb254614-cc9d-4846-adb6-fd45e5594a96") return respond({ error: "Not authorized." }, 403);
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (!serviceKey) return respond({ error: "Approval verification is unavailable." }, 503);
      const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      const { data: candidate, error: candidateError } = await admin.from("trade_signals").select("id,user_id,symbol,signal,analysis").eq("id", candidateId).eq("user_id", userData.user.id).maybeSingle();
      let proof: any = null;
      try { proof = JSON.parse(candidate?.analysis || "{}"); } catch { proof = null; }
      if (candidateError || !candidate || proof?.source !== "mktradehome-technical-engine" || proof?.engineVerified !== true || proof?.verificationStatus !== "PASSED" || !proof?.expiresAt || Date.parse(proof.expiresAt) <= Date.now()) return respond({ error: "Trading alert blocked: independent technical-engine proof is missing or expired." }, 403);
      const { data: queued, error: queueError } = await admin.from("mt5_trade_queue").select("id,account_number,account_server,symbol,side,status,expires_at").eq("id", queueId).maybeSingle();
      if (queueError || !queued || queued.account_number !== "486163696" || queued.account_server !== "Exness-MT5Trial10" || queued.symbol !== candidate.symbol || queued.side !== candidate.signal || queued.status !== "approved" || !queued.expires_at || Date.parse(queued.expires_at) <= Date.now()) return respond({ error: "Trading alert blocked: matching active Demo approval was not found." }, 403);
    }

    if (!message || typeof message !== "string") {

      return respond({ error: "Message is required" }, 400);

    }

    const { data: connection, error: dbError } = await supabase

      .from("telegram_users")

      .select("chat_id")

      .eq("user_id", userData.user.id)

      .single();

    if (dbError || !connection?.chat_id) {

      return respond({ error: "Telegram account is not connected" }, 404);

    }

    const telegramResponse = await fetch(

      `https://api.telegram.org/bot${botToken}/sendMessage`,

      {

        method: "POST",

        headers: { "Content-Type": "application/json" },

        body: JSON.stringify({

          chat_id: connection.chat_id,

          text: message,

        }),

      }

    );

    const telegramResult = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramResult.ok) {

      return respond({

        error: "Telegram delivery failed",

        details: telegramResult.description || "Unknown Telegram error",

      }, 502);

    }

    return respond({

      success: true,

      message: "Telegram alert delivered successfully",

    });

  } catch (error) {

    return respond({

      error: error instanceof Error ? error.message : "Unknown error",

    }, 500);

  }

});