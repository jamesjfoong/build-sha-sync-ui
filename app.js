const APP_ACCESS_HASH = "25badaffdd37d10271b46c44520b5f7b92299fd710662ef9d259b540e964497b";
const ACCESS_SESSION_KEY = "build_sha_sync_access_ok";

const form = document.getElementById("sync-form");
const previewBtn = document.getElementById("preview-btn");
const applyBtn = document.getElementById("apply-btn");
const resultEl = document.getElementById("result");
const tokenInput = document.getElementById("token");

const sourceRepoEl = document.getElementById("source-repo");
const sourceBranchEl = document.getElementById("source-branch");
const targetGroupEl = document.getElementById("target-group");
const envScopeEl = document.getElementById("env-scope");
const targetBranchEl = document.getElementById("target-branch");
const modeEl = document.getElementById("mode");
const sourceOwnerEl = document.getElementById("source-owner");
const targetOwnerEl = document.getElementById("target-owner");
const targetRepoEl = document.getElementById("target-repo");

init();

async function init() {
  await enforceAccessGate();

  previewBtn.addEventListener("click", async () => {
    await runPreview();
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runApply();
  });
}

async function enforceAccessGate() {
  if (sessionStorage.getItem(ACCESS_SESSION_KEY) === "yes") {
    return;
  }

  const password = window.prompt("Enter app passphrase:") || "";
  const hash = await sha256Hex(password);

  if (hash !== APP_ACCESS_HASH) {
    document.body.innerHTML = "<main class=\"app\"><section class=\"card\"><h2>Access denied</h2><p>Wrong passphrase.</p></section></main>";
    throw new Error("Unauthorized access.");
  }

  sessionStorage.setItem(ACCESS_SESSION_KEY, "yes");
}

function setBusy(isBusy) {
  previewBtn.disabled = isBusy;
  applyBtn.disabled = isBusy;
}

function writeResult(lines, isError = false) {
  resultEl.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines);
  resultEl.classList.toggle("error", isError);
}

function readConfig() {
  const token = tokenInput.value.trim();
  if (!token) {
    throw new Error("GitHub token is required.");
  }

  const sourceOwner = sourceOwnerEl.value.trim();
  const sourceBranch = sourceBranchEl.value.trim();
  const targetOwner = targetOwnerEl.value.trim();
  const targetRepo = targetRepoEl.value.trim();
  const targetBranch = targetBranchEl.value.trim();

  if (!sourceOwner || !sourceBranch || !targetOwner || !targetRepo || !targetBranch) {
    throw new Error("Owner, branch, and repo fields cannot be empty.");
  }

  return {
    token,
    sourceOwner,
    sourceRepo: sourceRepoEl.value,
    sourceBranch,
    targetOwner,
    targetRepo,
    targetGroup: targetGroupEl.value,
    envScope: envScopeEl.value,
    targetBranch,
    mode: modeEl.value,
  };
}

async function runPreview() {
  setBusy(true);
  try {
    const config = readConfig();
    writeResult(["Fetching source SHA and scanning target files..."]);
    const preview = await computeChanges(config);

    if (preview.changedFiles.length === 0) {
      writeResult([
        `Source SHA: ${preview.shortSha}`,
        `No BUILD_SHA changes needed for ${preview.scannedCount} env file(s).`,
      ]);
      return;
    }

    const lines = [
      `Source SHA: ${preview.shortSha}`,
      `Scanned: ${preview.scannedCount} env file(s)`,
      `Will change: ${preview.changedFiles.length} file(s)`,
      "",
      ...preview.changedFiles.slice(0, 50).map((file) => `- ${file.path}`),
    ];
    if (preview.changedFiles.length > 50) {
      lines.push(`...and ${preview.changedFiles.length - 50} more`);
    }
    writeResult(lines);
  } catch (error) {
    writeResult(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function runApply() {
  setBusy(true);
  try {
    const config = readConfig();
    writeResult(["Computing and applying changes atomically..."]);

    const preview = await computeChanges(config);
    if (preview.changedFiles.length === 0) {
      writeResult([
        `Source SHA: ${preview.shortSha}`,
        "No changes needed. Skipping commit.",
      ]);
      return;
    }

    if (config.mode === "commit") {
      await assertDirectCommitConfirmed(config);
    }

    const baseRef = await getRef(config, config.targetBranch);
    const baseCommitSha = baseRef.object.sha;
    const baseCommit = await getCommit(config, baseCommitSha);
    const baseTreeSha = baseCommit.tree.sha;

    let workingBranch = config.targetBranch;
    if (config.mode === "pr") {
      const created = await createWorkingBranch(config, baseCommitSha, preview.shortSha);
      workingBranch = created.branchName;
    }

    const treeSha = await createTreeFromChanges({
      config,
      baseTreeSha,
      changedFiles: preview.changedFiles,
    });

    const commitMessage = `chore: sync BUILD_SHA=${preview.shortSha} from ${config.sourceRepo}@${config.sourceBranch}`;
    const newCommitSha = await createCommit({
      config,
      message: commitMessage,
      treeSha,
      parentSha: baseCommitSha,
    });

    await updateRef({
      config,
      branch: workingBranch,
      commitSha: newCommitSha,
    });

    const lines = [
      `Source SHA: ${preview.shortSha}`,
      `Updated: ${preview.changedFiles.length} file(s)`,
    ];

    if (config.mode === "pr") {
      const pr = await createPullRequest({
        config,
        headBranch: workingBranch,
        baseBranch: config.targetBranch,
        shortSha: preview.shortSha,
      });
      lines.push(`PR: ${pr.html_url}`);
    } else {
      lines.push(
        `Commit: https://github.com/${config.targetOwner}/${config.targetRepo}/commit/${newCommitSha}`
      );
    }

    writeResult(lines);
  } catch (error) {
    writeResult(error.message, true);
  } finally {
    setBusy(false);
  }
}

async function computeChanges(config) {
  const sourceBranchData = await githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.sourceOwner)}/${encodeURIComponent(config.sourceRepo)}/branches/${encodeURIComponent(config.sourceBranch)}`,
  });
  const sourceSha = sourceBranchData?.commit?.sha;
  if (!sourceSha) {
    throw new Error("Unable to read source commit SHA.");
  }
  const shortSha = sourceSha.slice(0, 6);

  const targetBranchData = await githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/branches/${encodeURIComponent(config.targetBranch)}`,
  });
  const targetTreeSha = targetBranchData?.commit?.commit?.tree?.sha;
  if (!targetTreeSha) {
    throw new Error("Unable to read target tree SHA.");
  }

  const treeData = await githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/trees/${encodeURIComponent(targetTreeSha)}?recursive=1`,
  });

  const envPaths = (treeData.tree || [])
    .filter((item) => item.type === "blob")
    .map((item) => item.path)
    .filter((path) => isEnvPath(path))
    .filter((path) => isInTargetGroup(path, config.targetGroup))
    .filter((path) => isInEnvScope(path, config.envScope));

  const changedFiles = [];
  for (const path of envPaths) {
    const contentResp = await githubRequest({
      config,
      method: "GET",
      path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/contents/${encodePath(path)}?ref=${encodeURIComponent(config.targetBranch)}`,
    });

    const original = decodeBase64Utf8(contentResp.content || "");
    const updated = applyBuildSha(original, shortSha);
    if (updated !== original) {
      changedFiles.push({
        path,
        newText: updated,
      });
    }
  }

  return {
    shortSha,
    scannedCount: envPaths.length,
    changedFiles,
  };
}

async function assertDirectCommitConfirmed(config) {
  const protectedBranch = /^(main|master)$/i.test(config.targetBranch);
  if (!protectedBranch) {
    return;
  }

  const expected = `${config.targetOwner}/${config.targetRepo}:${config.targetBranch}`;
  const typed = window.prompt(
    `Direct commit to protected branch requires confirmation. Type exactly:\n${expected}`
  );
  if (typed !== expected) {
    throw new Error("Direct commit confirmation failed. No changes were applied.");
  }
}

async function getRef(config, branch) {
  return githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/ref/heads/${encodeURIComponent(branch)}`,
  });
}

async function getCommit(config, commitSha) {
  return githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/commits/${encodeURIComponent(commitSha)}`,
  });
}

async function createWorkingBranch(config, baseCommitSha, shortSha) {
  const branchName = `sync/build-sha-${shortSha}-${Date.now()}`;
  await githubRequest({
    config,
    method: "POST",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/refs`,
    body: {
      ref: `refs/heads/${branchName}`,
      sha: baseCommitSha,
    },
  });
  return { branchName };
}

async function createTreeFromChanges({ config, baseTreeSha, changedFiles }) {
  const tree = [];

  for (const file of changedFiles) {
    const blob = await githubRequest({
      config,
      method: "POST",
      path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/blobs`,
      body: {
        content: file.newText,
        encoding: "utf-8",
      },
    });

    tree.push({
      path: file.path,
      mode: "100644",
      type: "blob",
      sha: blob.sha,
    });
  }

  const newTree = await githubRequest({
    config,
    method: "POST",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/trees`,
    body: {
      base_tree: baseTreeSha,
      tree,
    },
  });

  return newTree.sha;
}

async function createCommit({ config, message, treeSha, parentSha }) {
  const commit = await githubRequest({
    config,
    method: "POST",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/commits`,
    body: {
      message,
      tree: treeSha,
      parents: [parentSha],
    },
  });
  return commit.sha;
}

async function updateRef({ config, branch, commitSha }) {
  await githubRequest({
    config,
    method: "PATCH",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/git/refs/heads/${encodeURIComponent(branch)}`,
    body: {
      sha: commitSha,
      force: false,
    },
  });
}

async function createPullRequest({ config, headBranch, baseBranch, shortSha }) {
  const title = `chore: sync BUILD_SHA to ${shortSha} from ${config.sourceRepo}@${config.sourceBranch}`;
  const body = [
    "## Summary",
    `- Sync BUILD_SHA to \`${shortSha}\``,
    `- Source: ${config.sourceOwner}/${config.sourceRepo}@${config.sourceBranch}`,
    `- Scope: ${config.targetGroup} (${config.envScope})`,
  ].join("\n");

  return githubRequest({
    config,
    method: "POST",
    path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/pulls`,
    body: {
      title,
      head: `${config.targetOwner}:${headBranch}`,
      base: baseBranch,
      body,
    },
  });
}

function isEnvPath(path) {
  const file = path.split("/").pop() || "";
  return file === ".env" || file.endsWith(".env") || file.includes(".env.");
}

function isInTargetGroup(path, targetGroup) {
  if (targetGroup === "ALL") {
    return path.startsWith("CATAPA-EXTENSION/") || path.startsWith("CATAPA-WEB/");
  }
  return path.startsWith(`${targetGroup}/`);
}

function isInEnvScope(path, envScope) {
  if (envScope === "all") {
    return true;
  }
  return path.includes(`/${envScope}/`);
}

function applyBuildSha(text, shortSha) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let replaced = false;

  for (let index = 0; index < lines.length; index += 1) {
    if (/^\s*export\s+BUILD_SHA=/.test(lines[index])) {
      lines[index] = `export BUILD_SHA=${shortSha}`;
      replaced = true;
      break;
    }
    if (/^\s*BUILD_SHA=/.test(lines[index])) {
      lines[index] = `BUILD_SHA=${shortSha}`;
      replaced = true;
      break;
    }
  }

  if (!replaced) {
    if (lines.length > 0 && lines[lines.length - 1] !== "") {
      lines.push("");
    }
    lines.push(`export BUILD_SHA=${shortSha}`);
  }

  return `${lines.join("\n")}\n`;
}

function encodePath(path) {
  return path
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function decodeBase64Utf8(base64) {
  const cleaned = (base64 || "").replace(/\n/g, "");
  if (!cleaned) {
    return "";
  }
  const binary = atob(cleaned);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function githubRequest({ config, method, path, body }) {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    let detail = "";
    try {
      const parsed = await response.json();
      detail = parsed.message ? `: ${parsed.message}` : "";
    } catch (_error) {
      detail = "";
    }
    throw new Error(`GitHub API ${method} ${path} failed (${response.status})${detail}`);
  }

  return response.status === 204 ? {} : response.json();
}

async function sha256Hex(value) {
  const buffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(buffer))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
