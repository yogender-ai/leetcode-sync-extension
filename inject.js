/**
 * LeetCode GitHub Auto-Sync — Page Hook (MAIN world)
 *
 * Detects accepted submissions via THREE paths (whichever fires first wins):
 *   Path A: REST  /problems/<slug>/submit/  →  /submissions/detail/<id>/check/
 *   Path B: GraphQL submissionDetails query returning Accepted
 *   Path C: GraphQL submissionStatus / statusCode === 10
 *
 * Absolute dedup: once a submission ID fires, it NEVER fires again.
 * Never fires on Run Code (interpret_solution).
 */

(function () {
  if (window.__LEETCODE_SYNC_INJECTED__) return;
  window.__LEETCODE_SYNC_INJECTED__ = true;

  // submission_id → { slug, lang, code, questionId, ts }
  const submitRegistry = new Map();

  // submission IDs (or slug-based keys) that already fired — NEVER fire again
  const fired = new Set();

  setInterval(() => {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const [k, v] of submitRegistry) if (v.ts < cutoff) submitRegistry.delete(k);
  }, 60000);

  function slugFromPath(p) {
    const m = (p || window.location.pathname).match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function emit(payload) {
    const key = payload.submissionId || (payload.slug + "-" + Date.now());
    if (fired.has(key)) return;
    fired.add(key);
    // Also block any alternate ID for same slug within 5 seconds
    if (payload.slug) fired.add("slug:" + payload.slug);
    setTimeout(() => fired.delete("slug:" + payload.slug), 5000);

    console.log("%c[LeetCode-Sync] ✅ ACCEPTED", "color:#a3e635;font-weight:bold", payload);
    document.dispatchEvent(new CustomEvent("LEETCODE_SYNC_ACCEPTED", { detail: payload }));
  }

  function isIgnoredUrl(url) {
    return /interpret_solution|\/test\/|\/run\//.test(url);
  }

  function buildPayload(sid, meta, extra) {
    return {
      submissionId: sid,
      slug: meta.slug || extra.slug || slugFromPath(),
      lang: meta.lang || extra.lang || "python3",
      code: meta.code || extra.code || "",
      questionId: meta.questionId || extra.questionId || null,
      runtime: extra.runtime || "",
      memory: extra.memory || "",
      runtimePercentile: extra.runtimePercentile || null,
      memoryPercentile: extra.memoryPercentile || null,
      totalCorrect: extra.totalCorrect,
      totalTestcases: extra.totalTestcases,
      statusMsg: "Accepted",
      timestamp: Date.now()
    };
  }

  // ───────── Hook fetch ─────────
  const _fetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    const url = typeof resource === "string" ? resource : (resource?.url ?? "");
    const method = (config?.method ?? "GET").toUpperCase();

    if (isIgnoredUrl(url)) return _fetch.apply(this, args);

    // ── Path A step 1: capture /submit/ POST body ──
    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    let submitBody = null;
    if (submitMatch && method === "POST") {
      try { submitBody = JSON.parse(config.body); } catch (_) {}
    }

    const response = await _fetch.apply(this, args);

    try {
      // Register submission ID from /submit/ response
      if (submitMatch && submitBody?.typed_code) {
        response.clone().json().then(d => {
          if (d?.submission_id) {
            submitRegistry.set(String(d.submission_id), {
              slug: submitMatch[1],
              lang: submitBody.lang,
              code: submitBody.typed_code,
              questionId: submitBody.question_id,
              ts: Date.now()
            });
          }
        }).catch(() => {});
      }

      // ── Path A step 2: /check/ for registered submit IDs ──
      const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
      if (checkMatch) {
        const sid = checkMatch[1];
        if (submitRegistry.has(sid) && !fired.has(sid)) {
          response.clone().json().then(d => {
            if (!d || d.state !== "SUCCESS" || d.status_code !== 10) return;
            const meta = submitRegistry.get(sid) || {};
            if (!meta.code) return;
            emit(buildPayload(sid, meta, {
              runtime: d.status_runtime || "",
              memory: d.status_memory || "",
              runtimePercentile: d.runtime_percentile ? Number(d.runtime_percentile).toFixed(1) : null,
              memoryPercentile: d.memory_percentile ? Number(d.memory_percentile).toFixed(1) : null,
              totalCorrect: d.total_correct,
              totalTestcases: d.total_testcases
            }));
          }).catch(() => {});
        }
      }

      // ── Path B & C: GraphQL responses ──
      if (url.includes("/graphql")) {
        response.clone().json().then(d => {
          if (!d?.data) return;

          // Path B: submissionDetails query
          const sd = d.data.submissionDetails;
          if (sd && sd.code && sd.code.trim()) {
            const isAccepted = sd.statusCode === 10
              || sd.statusDisplay === "Accepted"
              || sd.statusMsg === "Accepted";
            if (!isAccepted) return;

            const sid = String(sd.id || "");
            if (fired.has(sid) || fired.has("slug:" + (sd.question?.titleSlug))) return;

            emit({
              submissionId: sid,
              slug: sd.question?.titleSlug || slugFromPath(),
              lang: (typeof sd.lang === "object" ? sd.lang.name : sd.lang) || "python3",
              code: sd.code,
              questionId: sd.question?.questionId || null,
              runtime: sd.runtimeDisplay || sd.runtime || "",
              memory: sd.memoryDisplay || sd.memory || "",
              runtimePercentile: sd.runtimePercentile ? Number(sd.runtimePercentile).toFixed(1) : null,
              memoryPercentile: sd.memoryPercentile ? Number(sd.memoryPercentile).toFixed(1) : null,
              totalCorrect: sd.totalCorrect,
              totalTestcases: sd.totalTestcases,
              statusMsg: "Accepted",
              timestamp: Date.now()
            });
          }

          // Path C: check / submissionStatus with statusCode 10
          const ss = d.data.submissionStatus || d.data.checkSubmissionStatus;
          if (ss && (ss.statusCode === 10 || ss.status_code === 10)) {
            const sid = String(ss.submissionId || ss.submission_id || "");
            if (!sid || fired.has(sid)) return;
            // For this path, try to get code from registry
            const meta = submitRegistry.get(sid) || {};
            if (!meta.code) return; // can't sync without code
            emit(buildPayload(sid, meta, {
              slug: ss.titleSlug || meta.slug,
              runtime: ss.statusRuntime || ss.status_runtime || "",
              memory: ss.statusMemory || ss.status_memory || "",
              runtimePercentile: ss.runtimePercentile ? Number(ss.runtimePercentile).toFixed(1) : null,
              memoryPercentile: ss.memoryPercentile ? Number(ss.memoryPercentile).toFixed(1) : null,
              totalCorrect: ss.totalCorrect || ss.total_correct,
              totalTestcases: ss.totalTestcases || ss.total_testcases
            }));
          }
        }).catch(() => {});
      }
    } catch (_) {}

    return response;
  };

  // ───────── Hook XHR (fallback) ─────────
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lcUrl = url; this._lcMethod = method;
    return _xhrOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._lcUrl || "";
    if (isIgnoredUrl(url)) return _xhrSend.apply(this, arguments);

    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    if (submitMatch && body) {
      try {
        const p = JSON.parse(body);
        if (p.typed_code) this._lcSubmit = { slug: submitMatch[1], ...p };
      } catch (_) {}
    }

    this.addEventListener("load", function () {
      try {
        const data = JSON.parse(this.responseText);
        if (this._lcSubmit && data?.submission_id) {
          submitRegistry.set(String(data.submission_id), {
            slug: this._lcSubmit.slug,
            lang: this._lcSubmit.lang,
            code: this._lcSubmit.typed_code,
            questionId: this._lcSubmit.question_id,
            ts: Date.now()
          });
        }
        const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
        if (checkMatch) {
          const sid = checkMatch[1];
          if (submitRegistry.has(sid) && !fired.has(sid) && data?.state === "SUCCESS" && data?.status_code === 10) {
            const meta = submitRegistry.get(sid) || {};
            if (meta.code) emit(buildPayload(sid, meta, {
              runtime: data.status_runtime || "", memory: data.status_memory || "",
              runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
              memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
              totalCorrect: data.total_correct, totalTestcases: data.total_testcases
            }));
          }
        }
      } catch (_) {}
    });

    return _xhrSend.apply(this, arguments);
  };
})();
