/**
 * LeetCode GitHub Auto-Sync - Background Service Worker
 * Manages GitHub API integration, LeetCode GraphQL metadata queries,
 * automated commits, notifications, and profile repository workflow triggers.
 */

const DEFAULT_REPO = "yogender-ai/DSA-LeetCode-Journey";
const DEFAULT_BRANCH = "main";
const DEFAULT_PROFILE_REPO = "yogender-ai/yogender-ai";

const MONTH_NAMES = [
  "01-January", "02-February", "03-March", "04-April",
  "05-May", "06-June", "07-July", "08-August",
  "09-September", "10-October", "11-November", "12-December"
];

const LANG_CONFIG = {
  python: { ext: "py", comment: "py" },
  python3: { ext: "py", comment: "py" },
  cpp: { ext: "cpp", comment: "c" },
  "c++": { ext: "cpp", comment: "c" },
  c: { ext: "c", comment: "c" },
  csharp: { ext: "cs", comment: "c" },
  java: { ext: "java", comment: "c" },
  javascript: { ext: "js", comment: "c" },
  typescript: { ext: "ts", comment: "c" },
  sql: { ext: "sql", comment: "sql" },
  mysql: { ext: "sql", comment: "sql" },
  mssql: { ext: "sql", comment: "sql" },
  postgresql: { ext: "sql", comment: "sql" },
  oraclesql: { ext: "sql", comment: "sql" },
  golang: { ext: "go", comment: "c" },
  go: { ext: "go", comment: "c" },
  rust: { ext: "rs", comment: "c" },
  kotlin: { ext: "kt", comment: "c" },
  swift: { ext: "swift", comment: "c" },
  ruby: { ext: "rb", comment: "py" }
};

// Safe UTF-8 Base64 Encoder
function utf8ToBase64(str) {
  return btoa(
    encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
      return String.fromCharCode("0x" + p1);
    })
  );
}

// Infer pattern from tags and title
function inferPattern(tags, title) {
  const tLower = tags.map((t) => t.toLowerCase());
  const tStr = tLower.join(" ") + " " + title.toLowerCase();

  if (tLower.includes("two pointers") || tStr.includes("two pointer")) return "Two Pointers";
  if (tLower.includes("sliding window")) return "Sliding Window";
  if (tLower.includes("prefix sum")) return "Prefix Sum";
  if (tLower.includes("stack")) return "Stack";
  if (tLower.includes("binary search")) return "Binary Search";
  if (tLower.some((x) => x.includes("binary tree") || x.includes("tree"))) return "Trees & BST";
  if (tLower.some((x) => x.includes("graph") || x.includes("breadth-first search") || x.includes("depth-first search"))) return "Graphs & Search";
  if (tLower.includes("dynamic programming")) return "Dynamic Programming";
  if (tLower.includes("database") || tLower.includes("sql")) return "SQL";
  if (tLower.includes("hash table")) return "Arrays & Hashing";
  if (tStr.includes("matrix")) return "Matrix / Simulation";
  if (tLower.includes("string")) return "Strings";
  if (tLower.some((x) => x.includes("bit manipulation") || x.includes("bit"))) return "Bit Manipulation";
  return "Data Structures & Algorithms";
}

// Format date into IST (UTC+5:30) components
function getISTDateParts(timestamp = Date.now()) {
  const d = new Date(timestamp);
  // UTC + 5 hours 30 mins
  const istOffset = 5.5 * 60 * 60 * 1000;
  const ist = new Date(d.getTime() + istOffset);

  const year = ist.getUTCFullYear();
  const monthIdx = ist.getUTCMonth();
  const day = ist.getUTCDate();

  const monthFolder = MONTH_NAMES[monthIdx];
  const dayPad = String(day).padStart(2, "0");
  const monthPad = String(monthIdx + 1).padStart(2, "0");
  const yearShort = String(year).slice(-2);
  const dayFolder = `${dayPad}-${monthPad}-${yearShort}`;

  const monthShorts = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const dateDisplay = `${day} ${monthShorts[monthIdx]} ${year}`;

  return { year, monthFolder, dayFolder, dateDisplay };
}

// Fetch problem details from LeetCode GraphQL API
async function fetchLeetCodeQuestion(titleSlug) {
  const query = `
    query getQuestionDetail($titleSlug: String!) {
      question(titleSlug: $titleSlug) {
        questionId
        questionFrontendId
        title
        titleSlug
        difficulty
        topicTags {
          name
          slug
        }
      }
    }
  `;

  try {
    const res = await fetch("https://leetcode.com/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Referer: `https://leetcode.com/problems/${titleSlug}/`
      },
      body: JSON.stringify({ query, variables: { titleSlug } })
    });
    const data = await res.json();
    return data && data.data && data.data.question ? data.data.question : null;
  } catch (err) {
    console.error("[LeetCode-Sync] GraphQL error:", err);
    return null;
  }
}

// Generate the standardized solution file content with metadata header
function buildFileContent(q, payload, langConf, dateInfo, pattern) {
  const num = parseInt(q.questionFrontendId, 10);
  const title = q.title;
  const diff = q.difficulty;
  const slug = q.titleSlug;
  const url = `https://leetcode.com/problems/${slug}/`;

  let timeLine = "Time    : O(n)";
  if (payload.runtime) {
    timeLine += ` · Runtime: ${payload.runtime}`;
    if (payload.runtimePercentile) timeLine += ` (Beats ${payload.runtimePercentile}%)`;
  }

  let spaceLine = "Space   : O(1)";
  if (payload.memory) {
    spaceLine += ` · Memory: ${payload.memory}`;
    if (payload.memoryPercentile) spaceLine += ` (Beats ${payload.memoryPercentile}%)`;
  }

  const headerLines = [
    `LeetCode ${num} · ${title} · ${diff}`,
    url,
    "",
    `Pattern : ${pattern}`,
    `Solved  : ${dateInfo.dateDisplay}`,
    timeLine,
    spaceLine
  ];

  let header = "";
  if (langConf.comment === "py") {
    header = `"""\n${headerLines.join("\n")}\n"""\n\n`;
  } else if (langConf.comment === "c") {
    header = `/*\n${headerLines.map((l) => (l ? ` * ${l}` : " *")).join("\n")}\n */\n\n`;
  } else if (langConf.comment === "sql") {
    header = `${headerLines.map((l) => (l ? `-- ${l}` : "--")).join("\n")}\n\n`;
  }

  return header + (payload.code || "").trim() + "\n";
}

// Push file to GitHub repository via REST API
async function pushToGitHub({ token, repo, branch, filePath, content, commitMessage }) {
  const baseUrl = `https://api.github.com/repos/${repo}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28"
  };

  // Check if file already exists to get SHA
  let existingSha = null;
  try {
    const checkRes = await fetch(`${baseUrl}?ref=${branch}`, { headers });
    if (checkRes.ok) {
      const checkData = await checkRes.json();
      existingSha = checkData.sha;
    }
  } catch (e) {
    console.warn("[LeetCode-Sync] Error checking existing file SHA:", e);
  }

  const body = {
    message: commitMessage,
    content: utf8ToBase64(content),
    branch: branch
  };
  if (existingSha) body.sha = existingSha;

  const putRes = await fetch(baseUrl, {
    method: "PUT",
    headers,
    body: JSON.stringify(body)
  });

  if (!putRes.ok) {
    const errData = await putRes.json().catch(() => ({}));
    throw new Error(errData.message || `GitHub API error (HTTP ${putRes.status})`);
  }

  return await putRes.json();
}

// Optionally trigger profile repo sync workflow
async function triggerProfileWorkflow(token, profileRepo) {
  if (!profileRepo) return;
  try {
    const url = `https://api.github.com/repos/${profileRepo}/actions/workflows/sync_leetcode.yml/dispatches`;
    await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28"
      },
      body: JSON.stringify({ ref: "main" })
    });
    console.log(`[LeetCode-Sync] Triggered workflow sync_leetcode.yml in ${profileRepo}`);
  } catch (err) {
    console.warn("[LeetCode-Sync] Could not trigger profile workflow:", err);
  }
}

// Main submission sync handler
async function handleSyncSubmission(payload) {
  const syncStorage = await chrome.storage.sync.get([
    "githubToken",
    "targetRepo",
    "targetBranch",
    "profileRepo",
    "autoSync",
    "showNotifications",
    "syncProfile"
  ]);

  const token = syncStorage.githubToken;
  if (!token) {
    return {
      success: false,
      error: "GitHub Token not configured. Please open extension options to add your token."
    };
  }

  if (syncStorage.autoSync === false) {
    return { success: false, error: "Auto-sync is disabled in extension settings." };
  }

  const targetRepo = syncStorage.targetRepo || DEFAULT_REPO;
  const targetBranch = syncStorage.targetBranch || DEFAULT_BRANCH;
  const profileRepo = syncStorage.profileRepo || DEFAULT_PROFILE_REPO;
  const showNotifications = syncStorage.showNotifications !== false;
  const syncProfile = syncStorage.syncProfile !== false;

  // Reject non-Accepted, empty, or partial submissions
  if (!payload || payload.statusMsg !== "Accepted") {
    return { success: false, error: "Submission status is not Accepted." };
  }

  if (!payload.code || !payload.code.trim()) {
    return { success: false, error: "Empty code payload. Submission rejected." };
  }

  if (typeof payload.total_correct === "number" && typeof payload.total_testcases === "number") {
    if (payload.total_testcases === 0 || payload.total_correct !== payload.total_testcases) {
      return { success: false, error: `Only ${payload.total_correct}/${payload.total_testcases} testcases passed.` };
    }
  }

  // Resolve slug
  const slug = payload.slug;
  if (!slug) {
    return { success: false, error: "Missing problem slug." };
  }

  // 1. Fetch full Question details
  const q = await fetchLeetCodeQuestion(slug);
  if (!q) {
    return { success: false, error: `Could not fetch LeetCode details for '${slug}'.` };
  }

  const num = parseInt(q.questionFrontendId, 10);
  const tags = (q.topicTags || []).map((t) => t.name);
  const pattern = inferPattern(tags, q.title);

  // 2. Language mapping
  const rawLang = (payload.lang || "python3").toLowerCase();
  const langKey = Object.keys(LANG_CONFIG).find((k) => rawLang.includes(k)) || "python3";
  const langConf = LANG_CONFIG[langKey] || { ext: "py", comment: "py" };

  // 3. Path construction
  const dateInfo = getISTDateParts(payload.timestamp);
  const paddedNum = String(num).padStart(4, "0");
  const filename = `${paddedNum}-${slug}.${langConf.ext}`;
  const filePath = `${dateInfo.year}/${dateInfo.monthFolder}/${dateInfo.dayFolder}/${filename}`;

  // 4. File content assembly
  const fileContent = buildFileContent(q, payload, langConf, dateInfo, pattern);

  // 5. Commit to GitHub
  const commitMessage = `feat(leetcode): add ${num} - ${q.title} (${q.difficulty})`;
  const pushRes = await pushToGitHub({
    token,
    repo: targetRepo,
    branch: targetBranch,
    filePath,
    content: fileContent,
    commitMessage
  });

  // Calculate EXP gained
  const xpMap = { Easy: 10, Medium: 25, Hard: 50 };
  const xpGained = xpMap[q.difficulty] || 25;

  // 6. Update local history log
  const localStorage = await chrome.storage.local.get(["syncHistory", "todaySolves"]);
  const history = localStorage.syncHistory || [];
  history.unshift({
    num,
    title: q.title,
    slug,
    difficulty: q.difficulty,
    pattern,
    filePath,
    commitUrl: pushRes.commit ? pushRes.commit.html_url : null,
    fileUrl: `https://github.com/${targetRepo}/blob/${targetBranch}/${filePath}`,
    timestamp: Date.now(),
    runtime: payload.runtime,
    memory: payload.memory,
    xp: xpGained
  });
  if (history.length > 30) history.pop();

  await chrome.storage.local.set({
    syncHistory: history,
    lastSynced: Date.now()
  });

  // 7. Trigger profile sync if enabled
  if (syncProfile) {
    triggerProfileWorkflow(token, profileRepo);
  }

  // 8. Desktop Notification
  if (showNotifications) {
    try {
      chrome.notifications.create({
        type: "basic",
        iconUrl: "icons/icon128.png",
        title: `LeetCode Synced! (+${xpGained} EXP)`,
        message: `${num}. ${q.title} (${q.difficulty})\nSaved to ${filePath}`,
        priority: 1
      });
    } catch (e) {
      console.warn("Notification error:", e);
    }
  }

  return {
    success: true,
    repo: targetRepo,
    path: filePath,
    commitUrl: pushRes.commit ? pushRes.commit.html_url : null,
    fileUrl: `https://github.com/${targetRepo}/blob/${targetBranch}/${filePath}`,
    xp: xpGained,
    title: q.title,
    num
  };
}

// Background message listener
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "SYNC_SUBMISSION") {
    handleSyncSubmission(request.payload)
      .then((res) => sendResponse(res))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; // Keep message channel open for async response
  }

  if (request.action === "TEST_GITHUB_CONNECTION") {
    const { token, repo } = request;
    (async () => {
      try {
        const userRes = await fetch("https://api.github.com/user", {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json"
          }
        });
        if (!userRes.ok) throw new Error("Invalid GitHub token. Please verify permissions.");
        const user = await userRes.json();

        const repoRes = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/vnd.github+json"
          }
        });
        if (!repoRes.ok) throw new Error(`Cannot access repository '${repo}'. Verify repository name and permissions.`);
        const repoData = await repoRes.json();

        sendResponse({
          success: true,
          user: { login: user.login, avatar_url: user.avatar_url },
          repo: { full_name: repoData.full_name, default_branch: repoData.default_branch, permissions: repoData.permissions }
        });
      } catch (e) {
        sendResponse({ success: false, error: e.message });
      }
    })();
    return true;
  }
});
