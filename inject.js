/**
 * LeetCode GitHub Auto-Sync - page hook (MAIN world, document_start)
 *
 * Emits LEETCODE_SYNC_ACCEPTED exactly once per ACCEPTED SUBMISSION.
 *
 * Three independent detectors; the first to confirm wins and the rest are
 * deduped by submission id:
 *
 *   A. Network - POST /problems/<slug>/submit/ registers the id + code,
 *      then GET /submissions/detail/<id>/check/ confirms the status.
 *   B. Network - GraphQL submissionDetails response.
 *   C. URL watcher - after a submit the URL carries /submissions/<id>, so we
 *      ask LeetCode's own GraphQL what that submission was. This path
 *      intercepts nothing, so it still works when A and B lose the race
 *      against LeetCode's bundles.
 *
 * Run Code (/interpret_solution/) is not a submission and is always ignored.
 * Nothing is ever emitted unless statusCode === 10 and every testcase passed.
 */

(function () {
  if (window.__LEETCODE_SYNC_INJECTED__) return;
  window.__LEETCODE_SYNC_INJECTED__ = true;

  // Flip to false to silence the console. Leave on while diagnosing.
  let DEBUG = true;

  function log() {
    if (!DEBUG) return;
    console.log.apply(console, ["%c[LC-Sync]", "color:#8b5cf6;font-weight:bold"].concat([].slice.call(arguments)));
  }
  function warn() {
    if (!DEBUG) return;
    console.warn.apply(console, ["%c[LC-Sync]", "color:#f59e0b;font-weight:bold"].concat([].slice.call(arguments)));
  }

  // submission_id -> { slug, lang, code, questionId, ts }
  const submitRegistry = new Map();
  // submission ids already emitted - never emit twice
  const fired = new Set();
  // submission ids the URL watcher has already resolved (accepted or not)
  const inspected = new Set();
  // when we last saw a submit actually go out
  let lastSubmitAt = 0;

  setInterval(function () {
    const cutoff = Date.now() - 10 * 60 * 1000;
    for (const entry of submitRegistry) {
      if (entry[1].ts < cutoff) submitRegistry.delete(entry[0]);
    }
  }, 60000);

  function slugFromPath() {
    const m = window.location.pathname.match(/\/problems\/([^/]+)/);
    return m ? m[1] : null;
  }

  function submissionIdFromPath() {
    const m = window.location.pathname.match(/\/submissions\/(\d+)/);
    return m ? m[1] : null;
  }

  function isIgnoredUrl(url) {
    return /interpret_solution|\/runcode\/|\/problems\/[^/]+\/test\//.test(url);
  }

  function pct(v) {
    return (v || v === 0) ? Number(v).toFixed(1) : null;
  }

  /** The single gate every detector has to pass. */
  function isAccepted(o) {
    if (Number(o.statusCode) !== 10) return false;
    // When LeetCode reports counts they must agree. Some GraphQL shapes omit
    // them, and there statusCode 10 alone is authoritative.
    if (typeof o.totalCorrect === "number" && typeof o.totalTestcases === "number") {
      if (o.totalTestcases === 0 || o.totalCorrect !== o.totalTestcases) return false;
    }
    return true;
  }

  function emit(payload) {
    const sid = String(payload.submissionId || "");
    if (!sid) { warn("refusing to emit without a submission id"); return; }
    if (fired.has(sid)) { log("already synced", sid, "- skipping"); return; }
    if (!payload.code || !payload.code.trim()) { warn("refusing to emit empty code for", sid); return; }
    fired.add(sid);

    log("ACCEPTED - dispatching to extension", payload);
    document.dispatchEvent(new CustomEvent("LEETCODE_SYNC_ACCEPTED", { detail: payload }));
  }

  // ------------------------- GraphQL helper -------------------------
  // Runs in the page, so it carries the user's session cookies. A POST to
  // /graphql/ also needs the CSRF token echoed back from the cookie.
  const originalFetch = window.fetch;

  function csrfToken() {
    const m = document.cookie.match(/csrftoken=([^;]+)/);
    return m ? m[1] : "";
  }

  const SUBMISSION_DETAILS_QUERY = [
    "query submissionDetails($submissionId: Int!) {",
    "  submissionDetails(submissionId: $submissionId) {",
    "    code",
    "    statusCode",
    "    timestamp",
    "    runtimeDisplay",
    "    memoryDisplay",
    "    runtimePercentile",
    "    memoryPercentile",
    "    totalCorrect",
    "    totalTestcases",
    "    lang { name }",
    "    question { questionId titleSlug title }",
    "  }",
    "}"
  ].join("\n");

  function fetchSubmissionDetails(submissionId) {
    return originalFetch.call(window, "/graphql/", {
      method: "POST",
      credentials: "include",
      headers: {
        "content-type": "application/json",
        "x-csrftoken": csrfToken()
      },
      body: JSON.stringify({
        query: SUBMISSION_DETAILS_QUERY,
        variables: { submissionId: Number(submissionId) },
        operationName: "submissionDetails"
      })
    }).then(function (res) {
      return res.json();
    }).then(function (json) {
      return (json && json.data && json.data.submissionDetails) || null;
    });
  }

  function payloadFromDetails(sid, sd) {
    const langName = (sd.lang && typeof sd.lang === "object") ? sd.lang.name : sd.lang;
    return {
      submissionId: String(sid),
      slug: (sd.question && sd.question.titleSlug) || slugFromPath(),
      lang: langName || "python3",
      code: sd.code || "",
      questionId: (sd.question && sd.question.questionId) || null,
      runtime: sd.runtimeDisplay || "",
      memory: sd.memoryDisplay || "",
      runtimePercentile: pct(sd.runtimePercentile),
      memoryPercentile: pct(sd.memoryPercentile),
      totalCorrect: sd.totalCorrect,
      totalTestcases: sd.totalTestcases,
      statusMsg: "Accepted",
      timestamp: Date.now()
    };
  }

  // ------------------------- Detector A/B: fetch -------------------------
  window.fetch = async function () {
    const args = [].slice.call(arguments);
    const resource = args[0];
    const config = args[1];
    const url = typeof resource === "string" ? resource : ((resource && resource.url) || "");
    const method = ((config && config.method) || (resource && resource.method) || "GET").toUpperCase();

    if (isIgnoredUrl(url)) {
      if (/interpret_solution/.test(url)) log("ignoring Run Code request");
      return originalFetch.apply(this, args);
    }

    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    let submitBody = null;
    if (submitMatch && method === "POST") {
      try { submitBody = JSON.parse(config.body); } catch (e) {}
      lastSubmitAt = Date.now();
      log("Submit detected for", submitMatch[1]);
    }

    const response = await originalFetch.apply(this, args);

    try {
      if (submitMatch && submitBody && submitBody.typed_code) {
        response.clone().json().then(function (d) {
          if (d && d.submission_id) {
            submitRegistry.set(String(d.submission_id), {
              slug: submitMatch[1],
              lang: submitBody.lang,
              code: submitBody.typed_code,
              questionId: submitBody.question_id,
              ts: Date.now()
            });
            log("registered submission", d.submission_id);
          }
        }).catch(function () {});
      }

      const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
      if (checkMatch && !fired.has(checkMatch[1])) {
        const sid = checkMatch[1];
        response.clone().json().then(function (d) {
          if (!d || d.state !== "SUCCESS") return;
          log("check result for", sid, "->", d.status_msg, "(" + d.status_code + ")");

          if (!isAccepted({
            statusCode: d.status_code,
            totalCorrect: d.total_correct,
            totalTestcases: d.total_testcases
          })) {
            log("not accepted - nothing will be synced");
            return;
          }

          const base = {
            submissionId: sid,
            runtime: d.status_runtime || "",
            memory: d.status_memory || "",
            runtimePercentile: pct(d.runtime_percentile),
            memoryPercentile: pct(d.memory_percentile),
            totalCorrect: d.total_correct,
            totalTestcases: d.total_testcases,
            statusMsg: "Accepted",
            timestamp: Date.now()
          };

          const meta = submitRegistry.get(sid);
          if (meta && meta.code) {
            emit(Object.assign({}, base, {
              slug: meta.slug,
              lang: meta.lang,
              code: meta.code,
              questionId: meta.questionId
            }));
            return;
          }

          // We saw the verdict but missed the submit body - ask GraphQL for the code.
          log("no code in registry for", sid, "- fetching via GraphQL");
          fetchSubmissionDetails(sid).then(function (sd) {
            if (sd && sd.code) emit(Object.assign({}, payloadFromDetails(sid, sd), base, {
              code: sd.code,
              slug: (sd.question && sd.question.titleSlug) || slugFromPath()
            }));
          }).catch(function (e) { warn("GraphQL lookup failed", e); });
        }).catch(function () {});
      }

      if (/\/graphql/.test(url)) {
        response.clone().json().then(function (d) {
          const sd = d && d.data && d.data.submissionDetails;
          if (!sd || !sd.code || !sd.code.trim()) return;
          const sid = String(sd.id || submissionIdFromPath() || "");
          if (!sid || fired.has(sid)) return;
          log("graphql submissionDetails for", sid, "-> statusCode", sd.statusCode);
          if (!isAccepted({ statusCode: sd.statusCode, totalCorrect: sd.totalCorrect, totalTestcases: sd.totalTestcases })) return;
          emit(payloadFromDetails(sid, sd));
        }).catch(function () {});
      }
    } catch (e) {
      warn("fetch hook error", e);
    }

    return response;
  };

  // ------------------------- Detector A: XHR fallback -------------------------
  const _xhrOpen = XMLHttpRequest.prototype.open;
  const _xhrSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url) {
    this._lcUrl = url;
    this._lcMethod = method;
    return _xhrOpen.apply(this, arguments);
  };

  XMLHttpRequest.prototype.send = function (body) {
    const url = this._lcUrl || "";
    if (isIgnoredUrl(url)) return _xhrSend.apply(this, arguments);

    const submitMatch = url.match(/\/problems\/([^/]+)\/submit\/?/);
    if (submitMatch && body) {
      try {
        const p = JSON.parse(body);
        if (p.typed_code) {
          this._lcSubmit = Object.assign({ slug: submitMatch[1] }, p);
          lastSubmitAt = Date.now();
        }
      } catch (e) {}
    }

    this.addEventListener("load", function () {
      // responseText throws when responseType is "json" or "blob", which is
      // how axios issues these - read whichever form this request produced.
      let data = null;
      try {
        if (this.responseType === "json") data = this.response;
        else if (this.responseType === "" || this.responseType === "text") data = JSON.parse(this.responseText);
      } catch (e) { return; }
      if (!data) return;

      try {
        if (this._lcSubmit && data.submission_id) {
          submitRegistry.set(String(data.submission_id), {
            slug: this._lcSubmit.slug,
            lang: this._lcSubmit.lang,
            code: this._lcSubmit.typed_code,
            questionId: this._lcSubmit.question_id,
            ts: Date.now()
          });
          log("registered submission (xhr)", data.submission_id);
        }

        const checkMatch = url.match(/\/submissions\/detail\/(\d+)\/check\/?/);
        if (!checkMatch || data.state !== "SUCCESS") return;

        const sid = checkMatch[1];
        if (fired.has(sid)) return;
        log("check result (xhr) for", sid, "->", data.status_msg, "(" + data.status_code + ")");

        if (!isAccepted({
          statusCode: data.status_code,
          totalCorrect: data.total_correct,
          totalTestcases: data.total_testcases
        })) {
          log("not accepted - nothing will be synced");
          return;
        }

        const meta = submitRegistry.get(sid);
        if (!meta || !meta.code) return;

        emit({
          submissionId: sid,
          slug: meta.slug,
          lang: meta.lang,
          code: meta.code,
          questionId: meta.questionId,
          runtime: data.status_runtime || "",
          memory: data.status_memory || "",
          runtimePercentile: pct(data.runtime_percentile),
          memoryPercentile: pct(data.memory_percentile),
          totalCorrect: data.total_correct,
          totalTestcases: data.total_testcases,
          statusMsg: "Accepted",
          timestamp: Date.now()
        });
      } catch (e) {
        warn("xhr hook error", e);
      }
    });

    return _xhrSend.apply(this, arguments);
  };

  // ------------------------- Detector C: URL watcher -------------------------
  // After a submit, LeetCode routes to /problems/<slug>/submissions/<id>/, so
  // we ask GraphQL what that submission was. This path touches none of
  // LeetCode's own requests, so it survives the hooks being installed late.
  //
  // Guard against re-pushing old solutions: we only act on a submission that
  // LeetCode says is less than 3 minutes old, or one that followed a submit we
  // watched go out. Browsing your own submission history stays safe.
  const RECENT_WINDOW_MS = 3 * 60 * 1000;

  function inspectCurrentUrl() {
    const sid = submissionIdFromPath();
    if (!sid || fired.has(sid) || inspected.has(sid)) return;
    inspected.add(sid);

    fetchSubmissionDetails(sid).then(function (sd) {
      if (!sd) return;
      log("url watcher saw submission", sid, "-> statusCode", sd.statusCode,
        (sd.question && sd.question.titleSlug) || "");

      if (!isAccepted({ statusCode: sd.statusCode, totalCorrect: sd.totalCorrect, totalTestcases: sd.totalTestcases })) {
        log("not accepted - nothing will be synced");
        return;
      }

      const ageMs = sd.timestamp ? Date.now() - Number(sd.timestamp) * 1000 : null;
      const followsOurSubmit = (Date.now() - lastSubmitAt) < RECENT_WINDOW_MS;
      if (ageMs !== null && ageMs > RECENT_WINDOW_MS && !followsOurSubmit) {
        log("submission is", Math.round(ageMs / 1000), "s old - treating as history browsing, not syncing");
        return;
      }

      emit(payloadFromDetails(sid, sd));
    }).catch(function (e) {
      warn("GraphQL lookup failed for", sid, e);
      inspected.delete(sid); // let the next tick retry
    });
  }

  let lastPath = "";
  function tick() {
    const p = window.location.pathname;
    if (p !== lastPath) { lastPath = p; log("path ->", p); }
    inspectCurrentUrl();
  }

  function startWatcher() {
    setInterval(tick, 1000);
    tick();
    log("url watcher started");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", startWatcher, { once: true });
  } else {
    startWatcher();
  }

  // ------------------------- Console diagnostics -------------------------
  window.__lcSync = {
    get state() {
      return {
        debug: DEBUG,
        fetchHooked: window.fetch !== originalFetch,
        currentSlug: slugFromPath(),
        currentSubmissionId: submissionIdFromPath(),
        registered: Array.from(submitRegistry.keys()),
        fired: Array.from(fired),
        inspected: Array.from(inspected),
        lastSubmitAt: lastSubmitAt ? new Date(lastSubmitAt).toLocaleTimeString() : "never"
      };
    },
    setDebug: function (v) { DEBUG = !!v; return DEBUG; },
    /** Force a re-check of the submission in the current URL. */
    recheck: function () {
      const sid = submissionIdFromPath();
      if (sid) { inspected.delete(sid); fired.delete(sid); }
      return tick();
    },
    /** Raw GraphQL lookup, to eyeball what LeetCode actually returns. */
    lookup: function (id) { return fetchSubmissionDetails(id || submissionIdFromPath()); }
  };

  log("page hook installed (MAIN world, document_start)");
})();
