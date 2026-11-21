/* Mktradehome scanner observability.
   Read-only status only: no signals, approvals, queues, alerts or orders are created. */
(() => {
  const scanner = document.querySelector('.mk-v2-view[data-section="scanner"] .mk-v2-content');
  if (!scanner || document.getElementById("mkScannerStatus")) return;

  const card = document.createElement("section");
  card.id = "mkScannerStatus";
  card.className = "card";
  card.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <h2 style="margin:0">Scanner Health &amp; Opportunity Log</h2>
      <button type="button" id="mkScannerStatusRefresh" class="secondary" style="width:auto;margin:0;padding:9px 12px">Refresh Status</button>
    </div>
    <p style="margin-top:8px">Independent server-side scanner heartbeat, saved analysis freshness, latest verified candidate and notification registration. This panel is read-only.</p>
    <div id="mkScannerHeartbeat" class="status">Checking scheduled scanner…</div>
    <div id="mkScannerRunStats" class="small"></div>
    <hr>
    <h3>Latest verified setup</h3>
    <div id="mkScannerCandidate" class="trade-item">Loading candidate history…</div>
    <hr>
    <h3>Four-market status</h3>
    <div id="mkScannerMarkets"></div>
    <hr>
    <h3>Notification readiness</h3>
    <div id="mkScannerNotifications" class="trade-item">Checking linked notification channels…</div>
    <p class="small" id="mkScannerStatusUpdated">Status has not been refreshed yet.</p>
    <p class="small">A scheduled run marked successful confirms the cron request completed; it does not mean a trade setup qualified or that Telegram delivered a message. Old analysis is labelled stale and is never presented as a current signal.</p>
  `;
  const heading = scanner.querySelector(".mk-v2-heading");
  if (heading?.nextSibling) scanner.insertBefore(card, heading.nextSibling);
  else scanner.prepend(card);

  const $ = (id) => document.getElementById(id);
  const escape = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[ch]);
  const stamp = (value) => {
    const time = Date.parse(value || "");
    return Number.isFinite(time) ? new Date(time).toLocaleString() : "Not available";
  };
  const age = (value) => {
    const time = Date.parse(value || "");
    if (!Number.isFinite(time)) return "unknown age";
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if (seconds < 60) return seconds + " sec ago";
    if (seconds < 3600) return Math.floor(seconds / 60) + " min ago";
    if (seconds < 86400) return Math.floor(seconds / 3600) + " hr ago";
    return Math.floor(seconds / 86400) + " day(s) ago";
  };
  const markets = [
    ["BTCUSD", "BTC/USD"],
    ["EURUSD", "EUR/USD"],
    ["XAUUSD", "Gold · XAU/USD"],
    ["USDJPY", "USD/JPY"]
  ];
  let busy = false;
  let timer = null;

  function quoteStatus(symbol) {
    let quote = null;
    try { quote = typeof quotes !== "undefined" ? quotes[symbol] : null; } catch (_) {}
    if (!quote) return "Dashboard quote not loaded";
    const ageSeconds = Number(quote.quoteAgeSeconds);
    const marketOpen = String(quote.marketState || "").toLowerCase() === "open";
    if (quote.stale === true || !Number.isFinite(ageSeconds) || ageSeconds > 30) {
      return "QUOTE STALE · " + (Number.isFinite(ageSeconds) ? Math.round(ageSeconds) + " sec old" : "age unknown");
    }
    if (!marketOpen) return "MARKET NOT CONFIRMED OPEN";
    return "QUOTE FRESH · " + Math.round(ageSeconds) + " sec · market open";
  }

  function renderCandidate(candidate) {
    const el = $("mkScannerCandidate");
    if (!candidate) {
      el.textContent = "No saved independently verified candidate was found.";
      return;
    }
    let proof = {};
    try { proof = JSON.parse(candidate.analysis || "{}"); } catch (_) {}
    if (proof.source !== "mktradehome-technical-engine" ||
        proof.engineVerified !== true || proof.verificationStatus !== "PASSED") {
      el.textContent = "The latest saved record does not contain a valid independent-engine proof.";
      return;
    }
    const created = stamp(candidate.createdAt);
    const expiresAt = proof.expiresAt;
    const expiryTime = Date.parse(expiresAt || "");
    const expired = !Number.isFinite(expiryTime) || expiryTime <= Date.now();
    const quality = Number(proof.qualityScore);
    el.innerHTML =
      '<strong>' + escape(candidate.symbol) + ' · ' + escape(candidate.signal) + '</strong>' +
      '<div class="row"><span>Saved</span><strong>' + escape(created) + '</strong></div>' +
      '<div class="row"><span>Expiry</span><strong>' + escape(stamp(expiresAt)) + '</strong></div>' +
      '<div class="row"><span>Candidate state</span><strong>' + (expired ? 'EXPIRED · NOT APPROVABLE' : 'FRESH · CHECK APPROVAL CENTRE') + '</strong></div>' +
      '<div class="row"><span>Rule-quality score</span><strong>' + (Number.isFinite(quality) ? quality + '/100' : 'Not supplied') + '</strong></div>' +
      '<p class="small">The quality score is a rule-quality heuristic, not a win probability. A saved candidate is not an approval or an executed trade.</p>';
  }

  function renderMarkets(rows) {
    const el = $("mkScannerMarkets");
    const bySymbol = new Map((Array.isArray(rows) ? rows : []).map((row) => [row.symbol, row]));
    el.innerHTML = markets.map(([symbol, label]) => {
      const row = bySymbol.get(symbol);
      const updated = row?.updatedAt;
      const snapshotTime = Date.parse(updated || "");
      const snapshotFresh = Number.isFinite(snapshotTime) && Date.now() - snapshotTime <= 15 * 60 * 1000;
      const summary = snapshotFresh
        ? String(row.summary || "No explanatory summary was saved.")
        : "Last saved technical analysis is stale; no old rejection reason is being presented as current.";
      const bias = snapshotFresh ? String(row.bias || "UNKNOWN") + " · score " + String(row.score ?? "—") : "STALE / NO RECENT SNAPSHOT";
      return '<div class="trade-item">' +
        '<strong>' + escape(label) + '</strong>' +
        '<div class="row"><span>Current quote</span><strong>' + escape(quoteStatus(symbol)) + '</strong></div>' +
        '<div class="row"><span>Saved engine context</span><strong>' + escape(bias) + '</strong></div>' +
        '<div class="small">' + escape(summary) + '</div>' +
        '<div class="small">Last saved analysis: ' + escape(updated ? stamp(updated) + ' · ' + age(updated) : 'Not available') + '</div>' +
        '</div>';
    }).join("");
  }

  function renderNotifications(info) {
    const el = $("mkScannerNotifications");
    const telegram = Number(info?.telegramConnections) || 0;
    const push = Number(info?.browserPushSubscriptions) || 0;
    const latest = info?.latestAlertAt;
    el.innerHTML =
      '<div class="row"><span>Telegram account</span><strong>' + (telegram > 0 ? 'LINKED · ' + telegram : 'NOT LINKED') + '</strong></div>' +
      '<div class="row"><span>Browser push devices</span><strong>' + push + ' registered</strong></div>' +
      '<div class="row"><span>Latest saved in-app alert</span><strong>' + escape(latest ? stamp(latest) : 'No alert recorded') + '</strong></div>' +
      '<p class="small">' + (telegram > 0
        ? 'Telegram is linked, but this status check does not prove delivery of a trading alert. Use the existing Telegram control to run its explicit connection test.'
        : 'Link Telegram from the dashboard before expecting Telegram alerts.') +
        (push === 0 ? ' No browser push device is registered.' : '') + '</p>';
  }

  async function refreshStatus() {
    if (busy) return;
    busy = true;
    const button = $("mkScannerStatusRefresh");
    button.disabled = true;
    $("mkScannerHeartbeat").textContent = "Refreshing read-only scanner status…";
    try {
      const { data, error } = await supabaseClient.rpc("mktradehome_scan_status");
      if (error) throw error;
      if (!data || typeof data !== "object") throw new Error("Status is unavailable. Please sign in again.");

      const schedule = data.schedule || {};
      const run = data.latestRun || {};
      const runTime = Date.parse(run.startedAt || "");
      const runAgeMs = Number.isFinite(runTime) ? Date.now() - runTime : Infinity;
      const recentRuns = Array.isArray(data.recentRuns) ? data.recentRuns : [];
      const failures = recentRuns.filter((item) => item.status !== "succeeded").length;
      const lastRunText = Number.isFinite(runTime)
        ? stamp(run.startedAt) + " · " + age(run.startedAt)
        : "No recorded run";
      const runHealthy = run.status === "succeeded" && runAgeMs <= 10 * 60 * 1000;
      const scheduleText = schedule.active === true
        ? "ACTIVE · " + (schedule.schedule === "*/5 * * * *" ? "every 5 minutes" : schedule.schedule)
        : "INACTIVE / NOT FOUND";
      $("mkScannerHeartbeat").textContent =
        scheduleText + " · Last scheduled run: " + (run.status || "unknown").toUpperCase() +
        " · " + lastRunText + (runHealthy ? " · ON TIME" : " · CHECK FRESHNESS");
      $("mkScannerRunStats").textContent =
        recentRuns.length + " scheduled runs recorded in the last 24 hours · " +
        failures + " non-successful run(s). This measures scheduler execution, not trade-signal count.";

      renderCandidate(data.latestCandidate);
      renderMarkets(data.markets);
      renderNotifications(data.notifications);
      $("mkScannerStatusUpdated").textContent = "Read-only status refreshed " + new Date().toLocaleString() + ".";
    } catch (error) {
      console.error("Mktradehome scanner status:", error);
      $("mkScannerHeartbeat").textContent = "Scanner status could not be loaded: " + (error?.message || "Unknown error");
      $("mkScannerRunStats").textContent = "No fresh status is being assumed. Existing signal and approval safeguards are unchanged.";
    } finally {
      busy = false;
      button.disabled = false;
    }
  }

  refreshStatus();
  timer = window.setInterval(refreshStatus, 60000);
  window.addEventListener("beforeunload", () => {
    if (timer) window.clearInterval(timer);
  });
})();