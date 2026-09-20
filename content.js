/**
 * LeetCode GitHub Auto-Sync - Content Script
 * Runs on leetcode.com/problems/* in ISOLATED world.
 * - Injects inject.js into the main DOM
 * - Listens for accepted submissions
 * - Communicates with background service worker
 * - Renders a cyberpunk gamer notification toast and HUD
 */

(function () {
  console.log("%c[LeetCode-Sync] Content script initialized 🚀", "color: #8b5cf6; font-weight: bold;");

  // Prevent multiple injections
  if (window.__LEETCODE_SYNC_CONTENT_LOADED__) return;
  window.__LEETCODE_SYNC_CONTENT_LOADED__ = true;

  // 1. Inject inject.js into page context (MAIN world)
  try {
    const s = document.createElement("script");
    s.src = chrome.runtime.getURL("inject.js");
    s.onload = function () {
      this.remove();
    };
    (document.head || document.documentElement).appendChild(s);
  } catch (err) {
    console.error("[LeetCode-Sync] Failed to inject interceptor script:", err);
  }

  // Deduplication cache
  const syncedSubmissions = new Set();

  // Create or get HUD container
  function getHudContainer() {
    let container = document.getElementById("leetcode-sync-hud-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "leetcode-sync-hud-container";
      document.body.appendChild(container);
    }
    return container;
  }

  // Show rich interactive toast
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
      ${link ? `<a class="lc-sync-toast-link" href="${link}" target="_blank" rel="noopener noreferrer">View on GitHub ↗</a>` : ""}
      <div class="lc-sync-toast-progress"></div>
    `;

    const closeBtn = toast.querySelector(".lc-sync-toast-close");
    closeBtn.addEventListener("click", () => {
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
      update: (newOpts) => {
        if (newOpts.title) toast.querySelector(".lc-sync-toast-title").textContent = newOpts.title;
        if (newOpts.message) toast.querySelector(".lc-sync-toast-body").textContent = newOpts.message;
        if (newOpts.status) {
          toast.className = `lc-sync-toast lc-sync-toast-${newOpts.status}`;
          const iconElem = toast.querySelector(".lc-sync-toast-icon");
          if (newOpts.status === "success") iconElem.textContent = "✅";
          else if (newOpts.status === "error") iconElem.textContent = "❌";
          else if (newOpts.status === "loading") iconElem.textContent = "🔄";
        }
        if (newOpts.link) {
          let linkEl = toast.querySelector(".lc-sync-toast-link");
          if (!linkEl) {
            linkEl = document.createElement("a");
            linkEl.className = "lc-sync-toast-link";
            linkEl.target = "_blank";
            linkEl.rel = "noopener noreferrer";
            linkEl.textContent = "View on GitHub ↗";
            toast.insertBefore(linkEl, toast.querySelector(".lc-sync-toast-progress"));
          }
          linkEl.href = newOpts.link;
        }
        if (newOpts.autoDismiss) {
          setTimeout(() => {
            if (toast.parentElement) {
              toast.classList.add("lc-sync-toast-fadeout");
              setTimeout(() => toast.remove(), 300);
            }
          }, newOpts.autoDismiss);
        }
      },
      dismiss: () => {
        toast.classList.add("lc-sync-toast-fadeout");
        setTimeout(() => toast.remove(), 300);
      }
    };
  }

  // Handle accepted event from inject.js
  document.addEventListener("LEETCODE_SYNC_ACCEPTED", (event) => {
    const detail = event.detail;
    if (!detail) return;

    const subId = detail.submissionId;
    if (subId && syncedSubmissions.has(subId)) {
      console.log(`[LeetCode-Sync] Submission #${subId} already handled.`);
      return;
    }

    if (subId) syncedSubmissions.add(subId);

    const toast = showToast({
      title: "LeetCode Auto-Sync",
      message: `Accepted! Syncing to GitHub (${detail.slug || "solution"})...`,
      status: "loading",
      autoDismiss: 0
    });

    chrome.runtime.sendMessage(
      {
        action: "SYNC_SUBMISSION",
        payload: detail
      },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error("[LeetCode-Sync] Runtime error:", chrome.runtime.lastError);
          toast.update({
            title: "Sync Failed",
            message: `Extension background disconnected: ${chrome.runtime.lastError.message}`,
            status: "error",
            autoDismiss: 8000
          });
          return;
        }

        if (response && response.success) {
          toast.update({
            title: "Pushed to GitHub! 🚀",
            message: `Committed to ${response.repo}/${response.path} · +${response.xp || 25} EXP!`,
            status: "success",
            link: response.commitUrl || response.fileUrl,
            autoDismiss: 8000
          });
        } else {
          toast.update({
            title: "Sync Skipped / Failed",
            message: response ? response.error : "Unknown sync error. Check extension settings.",
            status: "error",
            autoDismiss: 10000
          });
        }
      }
    );
  });

  // Also check for manual sync trigger requests from popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_CURRENT_PROBLEM_SLUG") {
      const match = window.location.pathname.match(/\/problems\/([^/]+)/);
      sendResponse({ slug: match ? match[1] : null });
    }
  });
})();
