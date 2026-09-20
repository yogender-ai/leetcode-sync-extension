/**
 * LeetCode GitHub Auto-Sync - Content Script
 * Runs on leetcode.com/problems/* in ISOLATED world.
 */

(function () {
  if (window.__LEETCODE_SYNC_CONTENT_LOADED__) return;
  window.__LEETCODE_SYNC_CONTENT_LOADED__ = true;

  console.log("%c[LeetCode-Sync] Content script loaded", "color: #8b5cf6; font-weight: bold;");

  // Helper: check if extension context is still alive
  function isExtensionAlive() {
    try {
      return !!chrome.runtime && !!chrome.runtime.id;
    } catch (e) {
      return false;
    }
  }

  // 1. Inject inject.js into page context (MAIN world)
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject.js");
    s.onload = function () { this.remove(); };
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    console.error("[LeetCode-Sync] Failed to inject script:", err);
  }

  const syncedSubmissions = new Set();

  function getHudContainer() {
    let c = document.getElementById("leetcode-sync-hud-container");
    if (!c) {
      c = document.createElement("div");
      c.id = "leetcode-sync-hud-container";
      document.body.appendChild(c);
    }
    return c;
  }

  function showToast({ title, message, status = "info", link = null, autoDismiss = 7000 }) {
    const container = getHudContainer();
    const toast = document.createElement("div");
    toast.className = `lc-sync-toast lc-sync-toast-${status}`;

    let icon = "⚡";
    if (status === "success") icon = "✅";
    if (status === "error") icon = "❌";
    if (status === "loading") icon = "🔄";

    toast.innerHTML = `
      <div class="lc-sync-toast-header">
        <span class="lc-sync-toast-icon">${icon}</span>
        <span class="lc-sync-toast-title">${title}</span>
        <button class="lc-sync-toast-close" title="Dismiss">&times;</button>
      </div>
      <div class="lc-sync-toast-body">${message}</div>
      ${link ? `<a class="lc-sync-toast-link" href="${link}" target="_blank">View on GitHub ↗</a>` : ""}
    `;

    toast.querySelector(".lc-sync-toast-close").addEventListener("click", () => {
      toast.classList.add("lc-sync-toast-fadeout");
      setTimeout(() => toast.remove(), 300);
    });

    container.appendChild(toast);

    if (autoDismiss && status !== "loading") {
      setTimeout(() => {
        if (toast.parentElement) {
          toast.classList.add("lc-sync-toast-fadeout");
          setTimeout(() => toast.remove(), 300);
        }
      }, autoDismiss);
    }

    return {
      update(opts) {
        if (opts.title) toast.querySelector(".lc-sync-toast-title").textContent = opts.title;
        if (opts.message) toast.querySelector(".lc-sync-toast-body").textContent = opts.message;
        if (opts.status) {
          toast.className = `lc-sync-toast lc-sync-toast-${opts.status}`;
          const ic = toast.querySelector(".lc-sync-toast-icon");
          if (opts.status === "success") ic.textContent = "✅";
          else if (opts.status === "error") ic.textContent = "❌";
          else if (opts.status === "loading") ic.textContent = "🔄";
        }
        if (opts.link) {
          let a = toast.querySelector(".lc-sync-toast-link");
          if (!a) {
            a = document.createElement("a");
            a.className = "lc-sync-toast-link";
            a.target = "_blank";
            a.textContent = "View on GitHub ↗";
            toast.appendChild(a);
          }
          a.href = opts.link;
        }
        if (opts.autoDismiss) {
          setTimeout(() => {
            if (toast.parentElement) {
              toast.classList.add("lc-sync-toast-fadeout");
              setTimeout(() => toast.remove(), 300);
            }
          }, opts.autoDismiss);
        }
      },
      dismiss() {
        toast.classList.add("lc-sync-toast-fadeout");
        setTimeout(() => toast.remove(), 300);
      }
    };
  }

  // Listen for accepted event from inject.js
  document.addEventListener("LEETCODE_SYNC_ACCEPTED", (event) => {
    const detail = event.detail;
    if (!detail || detail.statusMsg !== "Accepted") return;
    if (!detail.code || !detail.code.trim()) return;

    const subId = detail.submissionId;
    if (subId && syncedSubmissions.has(subId)) return;
    if (subId) syncedSubmissions.add(subId);

    // Check if extension context is still valid (handles reload case)
    if (!isExtensionAlive()) {
      console.warn("[LeetCode-Sync] Extension was reloaded. Please refresh this LeetCode tab.");
      showToast({
        title: "Extension Reloaded",
        message: "Please refresh this page (F5) to reconnect the sync.",
        status: "error",
        autoDismiss: 10000
      });
      return;
    }

    const toast = showToast({
      title: "LeetCode Auto-Sync",
      message: `Accepted! Syncing to GitHub (${detail.slug || "solution"})...`,
      status: "loading",
      autoDismiss: 0
    });

    try {
      chrome.runtime.sendMessage(
        { action: "SYNC_SUBMISSION", payload: detail },
        (response) => {
          if (chrome.runtime.lastError) {
            toast.update({
              title: "Sync Failed",
              message: "Extension disconnected. Refresh this page (F5) and resubmit.",
              status: "error",
              autoDismiss: 8000
            });
            return;
          }

          if (response && response.success) {
            toast.update({
              title: "Pushed to GitHub! 🚀",
              message: `${response.repo}/${response.path} · +${response.xp || 25} EXP!`,
              status: "success",
              link: response.commitUrl || response.fileUrl,
              autoDismiss: 8000
            });
          } else {
            toast.update({
              title: "Sync Failed",
              message: response ? response.error : "Unknown error.",
              status: "error",
              autoDismiss: 8000
            });
          }
        }
      );
    } catch (err) {
      // Extension context invalidated — show friendly message
      toast.update({
        title: "Extension Reloaded",
        message: "Refresh this page (F5) to reconnect, then resubmit.",
        status: "error",
        autoDismiss: 10000
      });
    }
  });

  // Respond to popup slug queries
  try {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === "GET_CURRENT_PROBLEM_SLUG") {
        const match = window.location.pathname.match(/\/problems\/([^/]+)/);
        sendResponse({ slug: match ? match[1] : null });
      }
    });
  } catch (e) {
    // Extension context already gone — ignore
  }
})();
