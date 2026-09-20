# ⚡ LeetCode GitHub Auto-Sync & RPG Dashboard Extension

A powerful, high-performance browser extension for **Chrome, Brave, Edge, Arc, and all Chromium browsers** that automatically pushes your accepted LeetCode solutions directly to your GitHub repository in real time.

Built specifically to integrate seamlessly with **`yogender-ai/DSA-LeetCode-Journey`** and **`yogender-ai/yogender-ai`**.

---

## 🚀 What It Does

1. **Zero-Friction Auto-Commit**: Whenever you submit a problem on LeetCode and get **Accepted**, the extension instantly captures:
   - Solution code
   - Runtime, Memory, and Percentile beats
   - Difficulty (Easy, Medium, Hard)
   - Topic tags and inferred algorithmic pattern
2. **Standardized Chronological Hierarchy**: Saves your solution in the exact Date- and Streak-first directory architecture:
   ```text
   DSA-LeetCode-Journey/
   └── 2026/
       └── 09-September/
           └── 20-09-26/
               └── 1047-remove-all-adjacent-duplicates-in-string.py
   ```
3. **Structured Solution Headers**: Prepends standardized problem headers formatted with time/space complexities:
   ```python
   """
   LeetCode 1047 · Remove All Adjacent Duplicates In String · Easy
   https://leetcode.com/problems/remove-all-adjacent-duplicates-in-string/

   Pattern : Stack
   Solved  : 20 Sep 2026
   Time    : O(n) · Runtime: 3 ms (Beats 87.2%)
   Space   : O(1) · Memory: 17.4 MB (Beats 65.5%)
   """
   ```
4. **Live Profile & RPG Trigger**:
   - Committing triggers GitHub Actions in `DSA-LeetCode-Journey` to regenerate `README.md` and all 4 gamer SVG cards (`streak.svg`, `rpg_card.svg`, `banner.svg`, `topics.svg`).
   - Automatically dispatches `sync_leetcode.yml` in your GitHub profile repo (`yogender-ai/yogender-ai`) so your profile stays 100% in sync!
5. **In-Page Gamer HUD & Toast**:
   - An animated cyberpunk HUD badge appears directly inside LeetCode with the solve confirmation, XP gained (`+10 XP`, `+25 XP`, or `+50 XP`), and a direct link to the GitHub commit.

---

## 🛠️ Quick Installation (Takes 30 Seconds)

### Step 1: Open Extensions Page in Your Browser
- **Google Chrome**: Go to `chrome://extensions/`
- **Brave Browser**: Go to `brave://extensions/`
- **Microsoft Edge**: Go to `edge://extensions/`

### Step 2: Enable Developer Mode
- In the top-right corner of the Extensions page, toggle **Developer mode** to **ON**.

### Step 3: Load the Extension
1. Click the **"Load unpacked"** button in the top-left corner.
2. Select the folder:
   ```
   A:\projects\leetcode-sync-extension
   ```
3. The extension **"LeetCode GitHub Auto-Sync & RPG Dashboard"** will appear in your extensions list! Pin it to your browser toolbar for quick access.

---

## 🔑 Configuration & GitHub Token

1. Click the extension icon in your toolbar to open the popup.
2. If you don't already have a GitHub Personal Access Token:
   - Click **[Generate 1-click token](https://github.com/settings/tokens/new?scopes=repo&description=LeetCode+Sync+Extension)**.
   - Ensure the **`repo`** scope (and optionally **`workflow`** scope) is checked.
   - Click **Generate token** and copy the token string (`ghp_...`).
3. Paste your token into the extension popup:
   - **Target Solution Repo**: `yogender-ai/DSA-LeetCode-Journey`
   - **Target Branch**: `main`
   - **Profile Repo**: `yogender-ai/yogender-ai`
4. Click **"Save & Test Connection"**.
   - You will see the badge turn **🟢 Connected** with your avatar and username!

---

## 🎮 How to Test

1. Go to any LeetCode problem (e.g. [Two Sum](https://leetcode.com/problems/two-sum/) or [Remove Duplicates](https://leetcode.com/problems/remove-all-adjacent-duplicates-in-string/)).
2. Hit **Submit**.
3. Once the submission is **Accepted**:
   - A glowing HUD toast pops up on the bottom-right corner:
     ```
     ⚡ Pushed to GitHub! 🚀
     Committed to yogender-ai/DSA-LeetCode-Journey/2026/... · +25 EXP!
     [View on GitHub ↗]
     ```
   - Your solution is immediately pushed to GitHub, and the GitHub Action rebuilds your dashboard, streak, and RPG cards automatically!

---

## 📂 Project Structure

```text
leetcode-sync-extension/
├── manifest.json       # Manifest V3 extension definition
├── background.js       # Service worker handling GitHub REST API & LeetCode GraphQL
├── content.js          # Content script running on LeetCode & rendering toasts
├── content.css         # Cyberpunk gamer styling for in-page HUD
├── inject.js           # Page hook (MAIN world) intercepting submission responses
├── popup.html          # Popup UI dashboard
├── popup.css           # Dark-theme RPG gamer stylesheet
├── popup.js            # Authentication, settings & activity history controller
├── options.html        # Full-page settings management
├── options.js          # Options controller
├── icons/              # Extension app icons (16px, 48px, 128px)
└── README.md           # Documentation & instructions
```

---

*Made for Yogender's LeetCode & DSA Journey.*
