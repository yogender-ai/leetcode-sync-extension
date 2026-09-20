/**
 * LeetCode GitHub Auto-Sync - Page Injected Hook (MAIN World)
 * Hooks window.fetch and XMLHttpRequest to reliably intercept
 * accepted LeetCode code submissions in real-time.
 */

(function () {
  if (window.__LEETCODE_SYNC_INJECTED__) return;
  window.__LEETCODE_SYNC_INJECTED__ = true;

  console.log("%c[LeetCode-Sync] Interceptor active in page context", "color: #22d3ee; font-weight: bold;");

  // Store in-flight submissions keyed by submission_id or request context
  const pendingSubmits = new Map(); // slug -> { lang, typed_code, question_id, timestamp }
  const submissionMetadata = new Map(); // submission_id -> { ... }

  // Clean old entries (> 15 minutes)
  function cleanup() {
    const now = Date.now();
    for (const [k, v] of pendingSubmits.entries()) {
      if (now - v.timestamp > 15 * 60 * 1000) pendingSubmits.delete(k);
    }
    for (const [k, v] of submissionMetadata.entries()) {
      if (now - v.timestamp > 15 * 60 * 1000) submissionMetadata.delete(k);
    }
  }
  setInterval(cleanup, 60000);

  function notifyAccepted(payload) {
    console.log("%c[LeetCode-Sync] Accepted submission detected!", "color: #a3e635; font-weight: bold;", payload);
    document.dispatchEvent(new CustomEvent("LEETCODE_SYNC_ACCEPTED", {
      detail: payload
    }));
  }

  // Extract slug from URL if possible
  function getSlugFromPath(pathname) {
    const m = pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    let url = typeof resource === "string" ? resource : resource ? resource.url : "";

    // Check for submission POST: /problems/<slug>/submit/
    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    let capturedBody = null;
    let currentSlug = null;

    if (submitMatch && config && config.method && config.method.toUpperCase() === "POST") {
      currentSlug = submitMatch[1];
      try {
        if (typeof config.body === "string") {
          capturedBody = JSON.parse(config.body);
        }
      } catch (e) {
        console.warn("[LeetCode-Sync] Error parsing submit request body:", e);
      }
    }

    const response = await originalFetch.apply(this, args);

    try {
      // If this was the /submit/ response, extract submission_id
      if (submitMatch && capturedBody) {
        const cloned = response.clone();
        cloned.json().then(data => {
          if (data && data.submission_id) {
            submissionMetadata.set(String(data.submission_id), {
              submissionId: String(data.submission_id),
              slug: currentSlug,
              lang: capturedBody.lang,
              code: capturedBody.typed_code,
              questionId: capturedBody.question_id,
              timestamp: Date.now()
            });
            console.log(`[LeetCode-Sync] Registered submission #${data.submission_id} for '${currentSlug}'`);
          }
        }).catch(() => {});
      }

      // Check for check endpoint: /submissions/detail/<id>/check/
      const checkMatch = url.match(/\/submissions\/detail\/([^/]+)\/check\/?/);
      if (checkMatch) {
        const submissionId = checkMatch[1];
        const cloned = response.clone();
        cloned.json().then(data => {
          if (!data) return;

          // Check if status is Accepted
          const isAccepted = data.status_msg === "Accepted" || data.status_code === 10;
          if (isAccepted) {
            const meta = submissionMetadata.get(String(submissionId)) || {};
            const payload = {
              submissionId: String(submissionId),
              slug: meta.slug || getSlugFromPath(window.location.pathname),
              lang: meta.lang || data.lang,
              code: meta.code || data.code || "",
              questionId: meta.questionId || data.question_id,
              runtime: data.status_runtime || `${data.runtime || ""} ms`.trim(),
              memory: data.status_memory || `${data.memory || ""} MB`.trim(),
              runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
              memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
              totalCorrect: data.total_correct,
              totalTestcases: data.total_testcases,
              statusMsg: data.status_msg || "Accepted",
              timestamp: Date.now()
            };

            notifyAccepted(payload);
          }
        }).catch(() => {});
      }

      // Check for GraphQL queries/mutations containing submission status
      if (url.includes("/graphql")) {
        const cloned = response.clone();
        cloned.json().then(data => {
          if (!data || !data.data) return;
          // Check for submissionDetails
          const sub = data.data.submissionDetails;
          if (sub && (sub.statusCode === 10 || sub.statusMsg === "Accepted" || sub.statusDisplay === "Accepted")) {
            const payload = {
              submissionId: String(sub.id || ""),
              slug: sub.question ? sub.question.titleSlug : getSlugFromPath(window.location.pathname),
              lang: sub.lang ? (sub.lang.name || sub.lang) : "",
              code: sub.code || "",
              questionId: sub.question ? sub.question.questionId : null,
              runtime: `${sub.runtime || sub.runtimeDisplay || ""}`,
              memory: `${sub.memory || sub.memoryDisplay || ""}`,
              runtimePercentile: sub.runtimePercentile ? Number(sub.runtimePercentile).toFixed(1) : null,
              memoryPercentile: sub.memoryPercentile ? Number(sub.memoryPercentile).toFixed(1) : null,
              totalCorrect: sub.totalCorrect,
              totalTestcases: sub.totalTestcases,
              statusMsg: "Accepted",
              timestamp: Date.now()
            };
            notifyAccepted(payload);
          }
        }).catch(() => {});
      }
    } catch (err) {
      console.warn("[LeetCode-Sync] Error inspecting fetch response:", err);
    }

    return response;
  };

  // 2. Hook XMLHttpRequest for legacy or alternate network flows
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lc_url = url;
    this._lc_method = method;
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._lc_url && typeof this._lc_url === "string") {
      const submitMatch = this._lc_url.match(/\/problems\/([^/]+)\/submit\/?/);
      if (submitMatch && body) {
        try {
          const parsed = JSON.parse(body);
          this._lc_submit_body = parsed;
          this._lc_slug = submitMatch[1];
        } catch (e) {}
      }

      this.addEventListener("load", function () {
        try {
          if (submitMatch && this.responseText) {
            const data = JSON.parse(this.responseText);
            if (data && data.submission_id && this._lc_submit_body) {
              submissionMetadata.set(String(data.submission_id), {
                submissionId: String(data.submission_id),
                slug: this._lc_slug,
                lang: this._lc_submit_body.lang,
                code: this._lc_submit_body.typed_code,
                questionId: this._lc_submit_body.question_id,
                timestamp: Date.now()
              });
            }
          }

          const checkMatch = this._lc_url.match(/\/submissions\/detail\/([^/]+)\/check\/?/);
          if (checkMatch && this.responseText) {
            const data = JSON.parse(this.responseText);
            if (data && (data.status_msg === "Accepted" || data.status_code === 10)) {
              const submissionId = checkMatch[1];
              const meta = submissionMetadata.get(String(submissionId)) || {};
              notifyAccepted({
                submissionId: String(submissionId),
                slug: meta.slug || getSlugFromPath(window.location.pathname),
                lang: meta.lang || data.lang,
                code: meta.code || data.code || "",
                questionId: meta.questionId || data.question_id,
                runtime: data.status_runtime || `${data.runtime || ""} ms`.trim(),
                memory: data.status_memory || `${data.memory || ""} MB`.trim(),
                runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
                memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
                totalCorrect: data.total_correct,
                totalTestcases: data.total_testcases,
                statusMsg: data.status_msg || "Accepted",
                timestamp: Date.now()
              });
            }
          }
        } catch (e) {}
      });
    }

    return originalXhrSend.apply(this, arguments);
  };
})();
