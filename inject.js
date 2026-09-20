/**
 * LeetCode GitHub Auto-Sync — Page Hook (MAIN world)
 *
 * DEAD-SIMPLE LOGIC:
 *   1. When user clicks "Submit", LeetCode POSTs to /problems/<slug>/submit/
 *      → We capture the submission_id and the code from that POST body.
 *   2. LeetCode then polls /submissions/detail/<id>/check/ until it finishes.
 *      → We ONLY look at check responses whose ID we registered from step 1.
 *      → We ONLY fire if status_code === 10 (Accepted) and state === "SUCCESS".
 *   3. That's it. No GraphQL. No interpret_solution. No Run Code. No duplicates.
 */

(function () {
  if (window.__LEETCODE_SYNC_INJECTED__) return;
  window.__LEETCODE_SYNC_INJECTED__ = true;

  // Map of submission_id -> { slug, lang, code, questionId, timestamp }
  // ONLY populated by /submit/ POST responses. Never by Run/interpret.
  const pendingSubmits = new Map();

  // Set of submission_ids we already fired for (prevents duplicate toasts)
  const alreadyFired = new Set();

  // Cleanup old entries every 60s
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of pendingSubmits.entries()) {
      if (now - v.timestamp > 10 * 60 * 1000) pendingSubmits.delete(k);
    }
  }, 60000);

  function fireAccepted(payload) {
    const id = payload.submissionId;
    if (alreadyFired.has(id)) return;   // absolute dedup
    alreadyFired.add(id);
    pendingSubmits.delete(id);           // consumed

    console.log("%c[LeetCode-Sync] ✅ ACCEPTED — pushing to GitHub", "color:#a3e635;font-weight:bold", payload);
    document.dispatchEvent(new CustomEvent("LEETCODE_SYNC_ACCEPTED", { detail: payload }));
  }

  // ───────── Hook fetch ─────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === "string" ? resource : (resource?.url ?? "");
    const method = (config?.method ?? "GET").toUpperCase();

    // ── Step 1: Capture /submit/ POST ──
    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    let submitBody = null;
    if (submitMatch && method === "POST") {
      try { submitBody = JSON.parse(config.body); } catch (_) {}
    }

    const response = await _fetch.apply(this, args);

    // Register submission_id from /submit/ response
    if (submitMatch && submitBody?.typed_code) {
      response.clone().json().then(data => {
        if (data?.submission_id) {
          const sid = String(data.submission_id);
          pendingSubmits.set(sid, {
            slug: submitMatch[1],
            lang: submitBody.lang,
            code: submitBody.typed_code,
            questionId: submitBody.question_id,
            timestamp: Date.now()
          });
          console.log(`[LeetCode-Sync] Registered submit #${sid} for "${submitMatch[1]}"`);
        }
      }).catch(() => {});
    }

    // ── Step 2: Watch /check/ only for IDs we registered ──
    const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
    if (checkMatch) {
      const sid = checkMatch[1];

      // If we never saw this ID from a /submit/ call, ignore it completely.
      // This skips ALL "Run Code" / interpret_solution checks.
      if (!pendingSubmits.has(sid)) return response;
      if (alreadyFired.has(sid)) return response;

      response.clone().json().then(data => {
        if (!data || data.state !== "SUCCESS") return;       // still processing
        if (data.status_code !== 10) return;                 // not Accepted (11=WA, 14=TLE, 15=RE…)

        const meta = pendingSubmits.get(sid);
        if (!meta?.code) return;

        fireAccepted({
          submissionId: sid,
          slug: meta.slug,
          lang: meta.lang || data.lang || "python3",
          code: meta.code,
          questionId: meta.questionId || data.question_id,
          runtime: data.status_runtime || "",
          memory: data.status_memory || "",
          runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
          memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
          totalCorrect: data.total_correct,
          totalTestcases: data.total_testcases,
          statusMsg: "Accepted",
          timestamp: Date.now()
        });
      }).catch(() => {});
    }

    return response;
  };

  // ───────── Hook XHR (fallback for older LeetCode code paths) ─────────
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lcUrl = url;
    this._lcMethod = method;
    return _xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._lcUrl || "";

    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    if (submitMatch && body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed.typed_code) this._lcSubmit = { slug: submitMatch[1], ...parsed };
      } catch (_) {}
    }

    this.addEventListener("load", function () {
      try {
        const data = JSON.parse(this.responseText);

        // Register from /submit/
        if (this._lcSubmit && data?.submission_id) {
          const sid = String(data.submission_id);
          pendingSubmits.set(sid, {
            slug: this._lcSubmit.slug,
            lang: this._lcSubmit.lang,
            code: this._lcSubmit.typed_code,
            questionId: this._lcSubmit.question_id,
            timestamp: Date.now()
          });
        }

        // Check from /check/
        const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
        if (checkMatch) {
          const sid = checkMatch[1];
          if (!pendingSubmits.has(sid) || alreadyFired.has(sid)) return;
          if (data.state !== "SUCCESS" || data.status_code !== 10) return;

          const meta = pendingSubmits.get(sid);
          if (!meta?.code) return;

          fireAccepted({
            submissionId: sid,
            slug: meta.slug,
            lang: meta.lang || data.lang || "python3",
            code: meta.code,
            questionId: meta.questionId || data.question_id,
            runtime: data.status_runtime || "",
            memory: data.status_memory || "",
            runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
            memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
            totalCorrect: data.total_correct,
            totalTestcases: data.total_testcases,
            statusMsg: "Accepted",
            timestamp: Date.now()
          });
        }
      } catch (_) {}
    });

    return _xhrSend.apply(this, arguments);
  };
})();
