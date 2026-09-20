/**
 * LeetCode GitHub Auto-Sync - Popup Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  // Elements
  const statusBadge = document.getElementById("status-badge");
  const profileCard = document.getElementById("profile-card");
  const userAvatar = document.getElementById("user-avatar");
  const userLogin = document.getElementById("user-login");
  const repoLink = document.getElementById("repo-link");
  const statXp = document.getElementById("stat-xp");
  const statAuto = document.getElementById("stat-auto");

  const settingsPanel = document.getElementById("settings-panel");
  const toggleSettingsBtn = document.getElementById("toggle-settings-btn");
  const tokenInput = document.getElementById("github-token");
  const toggleTokenVisibility = document.getElementById("toggle-token-visibility");
  const targetRepoInput = document.getElementById("target-repo");
  const targetBranchInput = document.getElementById("target-branch");
  const profileRepoInput = document.getElementById("profile-repo");

  const toggleAutoSync = document.getElementById("toggle-autosync");
  const toggleNotifications = document.getElementById("toggle-notifications");
  const toggleProfile = document.getElementById("toggle-profile");

  const saveBtn = document.getElementById("save-btn");
  const feedbackMsg = document.getElementById("feedback-msg");
  const activityList = document.getElementById("activity-list");
  const syncCount = document.getElementById("sync-count");

  // Format relative time
  function timeAgo(ms) {
    const secs = Math.floor((Date.now() - ms) / 1000);
    if (secs < 60) return "just now";
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
  }

  // Render recent activity list
  function renderActivity(history) {
    if (!history || history.length === 0) {
      activityList.innerHTML = `<div class="empty-state">No submissions synced yet.<br>Solve a problem on LeetCode to test!</div>`;
      syncCount.textContent = "0 Synced";
      statXp.textContent = "+0 XP";
      return;
    }

    syncCount.textContent = `${history.length} Synced`;

    // Calculate today's XP
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayXp = history
      .filter((h) => h.timestamp >= startOfToday.getTime())
      .reduce((sum, h) => sum + (h.xp || 25), 0);
    statXp.textContent = `+${todayXp} XP`;

    activityList.innerHTML = history
      .map((item) => {
        const diffClass = `badge-${(item.difficulty || "medium").toLowerCase()}`;
        const diffText = item.difficulty || "Medium";
        const link = item.fileUrl || item.commitUrl || `https://leetcode.com/problems/${item.slug}/`;
        return `
          <a class="activity-item" href="${link}" target="_blank" rel="noopener noreferrer">
            <div class="activity-title-group">
              <span class="activity-title">${item.num ? item.num + ". " : ""}${item.title}</span>
              <div class="activity-meta">
                <span class="activity-badge ${diffClass}">${diffText}</span>
                <span>${item.pattern || "DSA"}</span>
                <span>• ${timeAgo(item.timestamp)}</span>
              </div>
            </div>
            <span class="text-lime" style="font-weight:700;font-size:11px;">+${item.xp || 25} XP</span>
          </a>
        `;
      })
      .join("");
  }

  // Load stored state
  const syncSettings = await chrome.storage.sync.get([
    "githubToken",
    "targetRepo",
    "targetBranch",
    "profileRepo",
    "autoSync",
    "showNotifications",
    "syncProfile"
  ]);

  const localState = await chrome.storage.local.get(["githubUser", "syncHistory"]);

  // Fill in inputs
  if (syncSettings.githubToken) tokenInput.value = syncSettings.githubToken;
  if (syncSettings.targetRepo) targetRepoInput.value = syncSettings.targetRepo;
  if (syncSettings.targetBranch) targetBranchInput.value = syncSettings.targetBranch;
  if (syncSettings.profileRepo) profileRepoInput.value = syncSettings.profileRepo;

  toggleAutoSync.checked = syncSettings.autoSync !== false;
  toggleNotifications.checked = syncSettings.showNotifications !== false;
  toggleProfile.checked = syncSettings.syncProfile !== false;

  statAuto.textContent = toggleAutoSync.checked ? "ACTIVE" : "OFF";
  statAuto.className = `stat-value ${toggleAutoSync.checked ? "text-cyan" : "text-secondary"}`;

  // If already authenticated and verified
  if (syncSettings.githubToken && localState.githubUser) {
    statusBadge.className = "badge badge-connected";
    statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Connected</span>`;

    profileCard.classList.remove("hidden");
    userLogin.textContent = `@${localState.githubUser.login}`;
    if (localState.githubUser.avatar_url) userAvatar.src = localState.githubUser.avatar_url;

    const repoName = syncSettings.targetRepo || "yogender-ai/DSA-LeetCode-Journey";
    repoLink.textContent = repoName.split("/")[1] || repoName;
    repoLink.href = `https://github.com/${repoName}`;

    // Auto-collapse settings panel if already connected
    settingsPanel.classList.add("hidden");
  } else {
    statusBadge.className = "badge badge-disconnected";
    statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Setup Needed</span>`;
    settingsPanel.classList.remove("hidden");
  }

  renderActivity(localState.syncHistory || []);

  // Toggle token password mask
  toggleTokenVisibility.addEventListener("click", () => {
    if (tokenInput.type === "password") {
      tokenInput.type = "text";
      toggleTokenVisibility.textContent = "🙈";
    } else {
      tokenInput.type = "password";
      toggleTokenVisibility.textContent = "👁️";
    }
  });

  // Toggle settings view
  toggleSettingsBtn.addEventListener("click", () => {
    settingsPanel.classList.toggle("hidden");
  });

  // Live toggle changes
  toggleAutoSync.addEventListener("change", () => {
    chrome.storage.sync.set({ autoSync: toggleAutoSync.checked });
    statAuto.textContent = toggleAutoSync.checked ? "ACTIVE" : "OFF";
    statAuto.className = `stat-value ${toggleAutoSync.checked ? "text-cyan" : "text-secondary"}`;
  });

  toggleNotifications.addEventListener("change", () => {
    chrome.storage.sync.set({ showNotifications: toggleNotifications.checked });
  });

  toggleProfile.addEventListener("change", () => {
    chrome.storage.sync.set({ syncProfile: toggleProfile.checked });
  });

  // Save & Test Connection
  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const targetRepo = targetRepoInput.value.trim();
    const targetBranch = targetBranchInput.value.trim() || "main";
    const profileRepo = profileRepoInput.value.trim();

    if (!token) {
      feedbackMsg.className = "feedback-msg feedback-error";
      feedbackMsg.textContent = "Please enter your GitHub Personal Access Token.";
      feedbackMsg.classList.remove("hidden");
      return;
    }

    if (!targetRepo || !targetRepo.includes("/")) {
      feedbackMsg.className = "feedback-msg feedback-error";
      feedbackMsg.textContent = "Please enter a valid target repository (e.g. username/repo).";
      feedbackMsg.classList.remove("hidden");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.querySelector(".btn-text").textContent = "Testing Connection...";
    feedbackMsg.classList.add("hidden");

    chrome.runtime.sendMessage(
      {
        action: "TEST_GITHUB_CONNECTION",
        token,
        repo: targetRepo
      },
      async (response) => {
        saveBtn.disabled = false;
        saveBtn.querySelector(".btn-text").textContent = "Save & Test Connection";

        if (response && response.success) {
          // Save to storage
          await chrome.storage.sync.set({
            githubToken: token,
            targetRepo,
            targetBranch,
            profileRepo,
            autoSync: toggleAutoSync.checked,
            showNotifications: toggleNotifications.checked,
            syncProfile: toggleProfile.checked
          });

          await chrome.storage.local.set({
            githubUser: response.user
          });

          // Update UI
          statusBadge.className = "badge badge-connected";
          statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Connected</span>`;

          profileCard.classList.remove("hidden");
          userLogin.textContent = `@${response.user.login}`;
          if (response.user.avatar_url) userAvatar.src = response.user.avatar_url;

          repoLink.textContent = targetRepo.split("/")[1] || targetRepo;
          repoLink.href = `https://github.com/${targetRepo}`;

          feedbackMsg.className = "feedback-msg feedback-success";
          feedbackMsg.textContent = `Connected as @${response.user.login}! Ready to auto-sync.`;
          feedbackMsg.classList.remove("hidden");

          setTimeout(() => {
            feedbackMsg.classList.add("hidden");
            settingsPanel.classList.add("hidden");
          }, 2500);
        } else {
          statusBadge.className = "badge badge-disconnected";
          statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Setup Failed</span>`;

          feedbackMsg.className = "feedback-msg feedback-error";
          feedbackMsg.textContent = response ? response.error : "Connection failed. Check token and repo permissions.";
          feedbackMsg.classList.remove("hidden");
        }
      }
    );
  });
});
