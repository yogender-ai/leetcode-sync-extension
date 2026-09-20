/**
 * LeetCode GitHub Auto-Sync - Page Injected Hook (MAIN World)
 * Hooks window.fetch and XMLHttpRequest to strictly intercept
 * genuine ACCEPTED submissions (ignoring test runs / Wrong Answers / Run Code).
 */

(function () {
  if (window.__LEETCODE_SYNC_INJECTED__) return;
  window.__LEETCODE_SYNC_INJECTED__ = true;

  console.log("%c[LeetCode-Sync] Strict submission hook active 🚀", "color: #22d3ee; font-weight: bold;");

  // ONLY store submissions that were sent to /submit/ (NOT /interpret_solution/)
  const submittedCodes = new Map(); // submission_id (string) -> { slug, lang, code, questionId, timestamp }

  function cleanup() {
    const now = Date.now();
    for (const [k, v] of submittedCodes.entries()) {
      if (now - v.timestamp > 15 * 60 * 1000) submittedCodes.delete(k);
    }
  }
  setInterval(cleanup, 60000);

  function notifyAccepted(payload) {
    console.log("%c[LeetCode-Sync] Verified Accepted submission:", "color: #a3e635; font-weight: bold;", payload);
    document.dispatchEvent(
      new CustomEvent("LEETCODE_SYNC_ACCEPTED", {
        detail: payload
      })
    );
  }

  function getSlugFromPath(pathname) {
    const m = pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  // 1. Hook window.fetch
  const originalFetch = window.fetch;
  window.fetch = async function (...args) {
    const [resource, config] = args;
    let url = typeof resource === "string" ? resource : resource ? resource.url : "";

    // Ignore test runs / interpret solution completely
    if (url.includes("/interpret_solution/") || url.includes("/test/") || url.includes("/run/")) {
      return originalFetch.apply(this, args);
    }

    // STRICT: Only catch official submissions: /problems/<slug>/submit/
    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    let capturedSubmitBody = null;
    let submitSlug = null;

    if (submitMatch && config && config.method && config.method.toUpperCase() === "POST") {
      submitSlug = submitMatch[1];
      try {
        if (typeof config.body === "string") {
          capturedSubmitBody = JSON.parse(config.body);
        }
      } catch (e) {
        console.warn("[LeetCode-Sync] Error parsing submit request body:", e);
      }
    }

    const response = await originalFetch.apply(this, args);

    try {
      // If this was the /submit/ response, register submission_id
      if (submitMatch && capturedSubmitBody && capturedSubmitBody.typed_code) {
        const cloned = response.clone();
        cloned
          .json()
          .then((data) => {
            if (data && data.submission_id) {
              submittedCodes.set(String(data.submission_id), {
                submissionId: String(data.submission_id),
                slug: submitSlug,
                lang: capturedSubmitBody.lang,
                code: capturedSubmitBody.typed_code,
                questionId: capturedSubmitBody.question_id,
                timestamp: Date.now()
              });
              console.log(`[LeetCode-Sync] Registered official submission #${data.submission_id} for '${submitSlug}'`);
            }
          })
          .catch(() => {});
      }

      // Check for check endpoint: /submissions/detail/<id>/check/
      const checkMatch = url.match(/\/submissions\/detail\/([^/]+)\/check\/?/);
      if (checkMatch) {
        const submissionId = String(checkMatch[1]);
        const cloned = response.clone();
        cloned
          .json()
          .then((data) => {
            if (!data) return;

            // CRITICAL CHECK 1: Must be in submittedCodes map!
            // If it is NOT in submittedCodes, it was NOT an official submit (it was a Run Code / interpret run)!
            if (!submittedCodes.has(submissionId)) {
              return;
            }

            // CRITICAL CHECK 2: Must be fully finished and state === "SUCCESS"
            if (data.state !== "SUCCESS") {
              return;
            }

            // CRITICAL CHECK 3: Must NOT have compare_result (which indicates interpret_solution)
            if (data.compare_result !== undefined) {
              return;
            }

            // CRITICAL CHECK 4: Status code must be 10 and status_msg must be "Accepted"
            // (Status 11 = Wrong Answer, 14 = TLE, 15 = Runtime Error, etc.)
            if (data.status_code !== 10 || data.status_msg !== "Accepted") {
              console.log(`[LeetCode-Sync] Submission #${submissionId} finished with: ${data.status_msg} (code: ${data.status_code}). Not accepted.`);
              return;
            }

            // CRITICAL CHECK 5: All testcases must pass!
            if (typeof data.total_correct === "number" && typeof data.total_testcases === "number") {
              if (data.total_testcases === 0 || data.total_correct !== data.total_testcases) {
                console.log(`[LeetCode-Sync] Submission #${submissionId} failed testcases (${data.total_correct}/${data.total_testcases})`);
                return;
              }
            }

            const meta = submittedCodes.get(submissionId);
            // CRITICAL CHECK 6: Code must exist and be non-empty!
            if (!meta || !meta.code || !meta.code.trim()) {
              console.warn(`[LeetCode-Sync] Submission #${submissionId} has no code payload. Aborting.`);
              return;
            }

            // Consume and delete so it cannot be triggered more than once
            submittedCodes.delete(submissionId);

            const payload = {
              submissionId,
              slug: meta.slug || getSlugFromPath(window.location.pathname),
              lang: meta.lang || data.lang || "python3",
              code: meta.code,
              questionId: meta.questionId || data.question_id,
              runtime: data.status_runtime || `${data.runtime || ""} ms`.trim(),
              memory: data.status_memory || `${data.memory || ""} MB`.trim(),
              runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
              memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
              totalCorrect: data.total_correct,
              totalTestcases: data.total_testcases,
              statusMsg: "Accepted",
              timestamp: Date.now()
            };

            notifyAccepted(payload);
          })
          .catch(() => {});
      }

      // Check GraphQL queries for submission details
      if (url.includes("/graphql")) {
        const cloned = response.clone();
        cloned
          .json()
          .then((data) => {
            if (!data || !data.data) return;
            const sub = data.data.submissionDetails;
            if (
              sub &&
              sub.code &&
              sub.code.trim().length > 0 &&
              (sub.statusCode === 10 || sub.statusMsg === "Accepted" || sub.statusDisplay === "Accepted") &&
              (!sub.totalCorrect || !sub.totalTestcases || sub.totalCorrect === sub.totalTestcases)
            ) {
              const payload = {
                submissionId: String(sub.id || ""),
                slug: sub.question ? sub.question.titleSlug : getSlugFromPath(window.location.pathname),
                lang: sub.lang ? sub.lang.name || sub.lang : "python3",
                code: sub.code,
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
          })
          .catch(() => {});
      }
    } catch (err) {
      console.warn("[LeetCode-Sync] Error in fetch interceptor:", err);
    }

    return response;
  };

  // 2. Hook XMLHttpRequest
  const originalXhrOpen = XMLHttpRequest.prototype.open;
  const originalXhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._lc_url = url;
    this._lc_method = method;
    return originalXhrOpen.apply(this, [method, url, ...rest]);
  };

  XMLHttpRequest.prototype.send = function (body) {
    if (this._lc_url && typeof this._lc_url === "string") {
      // Ignore test runs
      if (this._lc_url.includes("/interpret_solution/") || this._lc_url.includes("/test/") || this._lc_url.includes("/run/")) {
        return originalXhrSend.apply(this, arguments);
      }

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
          if (submitMatch && this.responseText && this._lc_submit_body && this._lc_submit_body.typed_code) {
            const data = JSON.parse(this.responseText);
            if (data && data.submission_id) {
              submittedCodes.set(String(data.submission_id), {
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
            const submissionId = String(checkMatch[1]);
            if (!submittedCodes.has(submissionId)) return;

            const data = JSON.parse(this.responseText);
            if (
              data &&
              data.state === "SUCCESS" &&
              data.status_code === 10 &&
              data.status_msg === "Accepted" &&
              data.compare_result === undefined &&
              (!data.total_testcases || data.total_correct === data.total_testcases)
            ) {
              const meta = submittedCodes.get(submissionId);
              if (!meta || !meta.code || !meta.code.trim()) return;
              submittedCodes.delete(submissionId);

              notifyAccepted({
                submissionId,
                slug: meta.slug || getSlugFromPath(window.location.pathname),
                lang: meta.lang || data.lang || "python3",
                code: meta.code,
                questionId: meta.questionId || data.question_id,
                runtime: data.status_runtime || `${data.runtime || ""} ms`.trim(),
                memory: data.status_memory || `${data.memory || ""} MB`.trim(),
                runtimePercentile: data.runtime_percentile ? Number(data.runtime_percentile).toFixed(1) : null,
                memoryPercentile: data.memory_percentile ? Number(data.memory_percentile).toFixed(1) : null,
                totalCorrect: data.total_correct,
                totalTestcases: data.total_testcases,
                statusMsg: "Accepted",
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
