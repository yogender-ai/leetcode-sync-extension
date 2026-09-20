/**
 * LeetCode GitHub Auto-Sync - Options Page Controller
 */

document.addEventListener("DOMContentLoaded", async () => {
  const statusBadge = document.getElementById("status-badge");
  const profileCard = document.getElementById("profile-card");
  const userAvatar = document.getElementById("user-avatar");
  const userLogin = document.getElementById("user-login");
  const repoLink = document.getElementById("repo-link");

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

  const localState = await chrome.storage.local.get(["githubUser"]);

  if (syncSettings.githubToken) tokenInput.value = syncSettings.githubToken;
  if (syncSettings.targetRepo) targetRepoInput.value = syncSettings.targetRepo;
  if (syncSettings.targetBranch) targetBranchInput.value = syncSettings.targetBranch;
  if (syncSettings.profileRepo) profileRepoInput.value = syncSettings.profileRepo;

  toggleAutoSync.checked = syncSettings.autoSync !== false;
  toggleNotifications.checked = syncSettings.showNotifications !== false;
  toggleProfile.checked = syncSettings.syncProfile !== false;

  if (syncSettings.githubToken && localState.githubUser) {
    statusBadge.className = "badge badge-connected";
    statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Connected</span>`;

    profileCard.classList.remove("hidden");
    userLogin.textContent = `@${localState.githubUser.login}`;
    if (localState.githubUser.avatar_url) userAvatar.src = localState.githubUser.avatar_url;

    const repoName = syncSettings.targetRepo || "yogender-ai/DSA-LeetCode-Journey";
    repoLink.textContent = repoName;
    repoLink.href = `https://github.com/${repoName}`;
  }

  // Toggle token mask
  toggleTokenVisibility.addEventListener("click", () => {
    if (tokenInput.type === "password") {
      tokenInput.type = "text";
      toggleTokenVisibility.textContent = "🙈";
    } else {
      tokenInput.type = "password";
      toggleTokenVisibility.textContent = "👁️";
    }
  });

  // Save settings & test
  saveBtn.addEventListener("click", async () => {
    const token = tokenInput.value.trim();
    const targetRepo = targetRepoInput.value.trim();
    const targetBranch = targetBranchInput.value.trim() || "main";
    const profileRepo = profileRepoInput.value.trim();

    if (!token) {
      feedbackMsg.className = "feedback-msg feedback-error";
      feedbackMsg.textContent = "Please provide your GitHub token.";
      feedbackMsg.classList.remove("hidden");
      return;
    }

    if (!targetRepo || !targetRepo.includes("/")) {
      feedbackMsg.className = "feedback-msg feedback-error";
      feedbackMsg.textContent = "Target repository must be in owner/repo format.";
      feedbackMsg.classList.remove("hidden");
      return;
    }

    saveBtn.disabled = true;
    saveBtn.querySelector(".btn-text").textContent = "Verifying Connection...";
    feedbackMsg.classList.add("hidden");

    chrome.runtime.sendMessage(
      {
        action: "TEST_GITHUB_CONNECTION",
        token,
        repo: targetRepo
      },
      async (response) => {
        saveBtn.disabled = false;
        saveBtn.querySelector(".btn-text").textContent = "Save & Verify Connection";

        if (response && response.success) {
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

          statusBadge.className = "badge badge-connected";
          statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Connected</span>`;

          profileCard.classList.remove("hidden");
          userLogin.textContent = `@${response.user.login}`;
          if (response.user.avatar_url) userAvatar.src = response.user.avatar_url;

          repoLink.textContent = targetRepo;
          repoLink.href = `https://github.com/${targetRepo}`;

          feedbackMsg.className = "feedback-msg feedback-success";
          feedbackMsg.textContent = `Successfully verified as @${response.user.login}! All configurations saved.`;
          feedbackMsg.classList.remove("hidden");
        } else {
          statusBadge.className = "badge badge-disconnected";
          statusBadge.innerHTML = `<span class="badge-dot"></span><span class="badge-text">Verification Failed</span>`;

          feedbackMsg.className = "feedback-msg feedback-error";
          feedbackMsg.textContent = response ? response.error : "Verification failed.";
          feedbackMsg.classList.remove("hidden");
        }
      }
    );
  });
});
