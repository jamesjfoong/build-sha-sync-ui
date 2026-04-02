const APP_ACCESS_HASH = "bcb7aefd1c4be238b24c37fdcd2c8b17a182a4be0e9f2898da0e7d15095154cf";
const ACCESS_SESSION_KEY = "build_sha_sync_access_ok";
const THEME_STORAGE_KEY = "build_sha_sync_theme";
const TOKEN_SESSION_KEY = "build_sha_sync_token_session";
const TOKEN_PERSIST_KEY = "build_sha_sync_token_persist";
const TOKEN_VALUE_KEY = "build_sha_sync_token_value";
const TOKEN_EXPIRES_AT_KEY = "build_sha_sync_token_expires_at";
const TOKEN_PERSIST_DAYS = 14;
const SHA_LENGTH = 7;
const AUTO_COMMIT_FETCH_DEBOUNCE_MS = 500;

const form = document.getElementById("sync-form");
const previewBtn = document.getElementById("preview-btn");
const applyBtn = document.getElementById("apply-btn");
const loadCommitsBtn = document.getElementById("load-commits-btn");
const refreshRepoOptionsBtn = document.getElementById("refresh-repo-options-btn");
const clearResultBtn = document.getElementById("clear-result-btn");
const copyResultBtn = document.getElementById("copy-result-btn");
const selectAllFilesBtn = document.getElementById("select-all-files-btn");
const selectNoneFilesBtn = document.getElementById("select-none-files-btn");
const fileSelectionListEl = document.getElementById("file-selection-list");
const filesCardEl = document.getElementById("files-card");
const clearTokenBtn = document.getElementById("clear-token-btn");
const tokenStorageNoteEl = document.getElementById("token-storage-note");
const tokenFormatErrorEl = document.getElementById("token-format-error");
const fileFilterInputEl = document.getElementById("file-filter-input");
const selectionSummaryEl = document.getElementById("selection-summary");
const resultEl = document.getElementById("result");
const progressHintEl = document.getElementById("progress-hint");
const tokenInput = document.getElementById("token");
const rememberTokenEl = document.getElementById("remember-token");
const commitMessageTemplateEl = document.getElementById("commit-message-template");
const yoloModeEl = document.getElementById("yolo-mode");
const accessDetailsEl = document.getElementById("access-details");
const accessSummaryChipEl = document.getElementById("access-summary-chip");
const modeHintEl = document.getElementById("mode-hint");
const previewNoteEl = document.getElementById("preview-note");
const appRootEl = document.getElementById("app-root");
const accessOverlayEl = document.getElementById("access-overlay");
const accessPassphraseInputEl = document.getElementById("access-passphrase");
const accessSubmitBtn = document.getElementById("access-submit-btn");
const accessErrorEl = document.getElementById("access-error");
const togglePassphraseBtn = document.getElementById("toggle-passphrase-btn");
const confirmOverlayEl = document.getElementById("confirm-overlay");
const confirmTitleEl = document.getElementById("confirm-title");
const confirmBodyEl = document.getElementById("confirm-body");
const confirmInputRowEl = document.getElementById("confirm-input-row");
const confirmInputEl = document.getElementById("confirm-input");
const confirmErrorEl = document.getElementById("confirm-error");
const confirmCancelBtn = document.getElementById("confirm-cancel-btn");
const confirmAcceptBtn = document.getElementById("confirm-accept-btn");

const sourceRepoEl = document.getElementById("source-repo");
const sourceBranchEl = document.getElementById("source-branch");
const sourceCommitEl = document.getElementById("source-commit");
const sourceCommitInfoEl = document.getElementById("source-commit-info");
const targetGroupEl = document.getElementById("target-group");
const envScopeEl = document.getElementById("env-scope");
const targetBranchEl = document.getElementById("target-branch");
const modeEl = document.getElementById("mode");
const sourceOwnerEl = document.getElementById("source-owner");
const targetOwnerEl = document.getElementById("target-owner");
const targetRepoEl = document.getElementById("target-repo");

let lastPreview = null;
let commitFetchDebounceId = null;
let lastResultText = "Ready.";
let accessFocusCleanup = null;
let confirmFocusCleanup = null;
let confirmResolve = null;
let confirmCleanup = null;

const TOKEN_PREFIX_REGEX = /^(ghp_|github_pat_)/;

init();

async function init() {
  enforceDarkModeOnly();
  initializeTokenPersistence();
  hideFilesCard();
  setPreviewNoteVisible(true);
  clearSourceCommitSelection();
  await refreshRepoAndGroupOptions({ silent: true });
  initializeDropdowns();
  await reloadSourceBranches();
  await reloadTargetBranches();
  await reloadSourceCommits();

  bindEventHandlers();

  updateModeUi();
  updateSelectionSummary();
  updateAccessSummary();
  renderResult("Ready.");
}

function bindEventHandlers() {
  bindAccessHandlers();
  bindTokenHandlers();
  bindSourceHandlers();
  bindTargetHandlers();
  bindPreviewHandlers();
  bindFormHandlers();
  bindFileSelectionHandlers();
  bindResultHandlers();
}

function bindAccessHandlers() {
  if (!accessOverlayEl) {
    return;
  }

  togglePassphraseBtn.addEventListener("click", () => {
    const isPassword = accessPassphraseInputEl.type === "password";
    accessPassphraseInputEl.type = isPassword ? "text" : "password";
    togglePassphraseBtn.textContent = isPassword ? "Hide" : "Show";
  });

  accessSubmitBtn.addEventListener("click", async () => {
    await attemptAccessUnlock();
  });

  accessPassphraseInputEl.addEventListener("keydown", async (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      await attemptAccessUnlock();
    }
  });
}

function bindTokenHandlers() {
  clearTokenBtn.addEventListener("click", clearToken);
  tokenInput.addEventListener("blur", validateTokenFormat);
}

function bindSourceHandlers() {
  loadCommitsBtn.addEventListener("click", async () => {
    await reloadSourceCommits();
  });

  refreshRepoOptionsBtn.addEventListener("click", async () => {
    await refreshRepoAndGroupOptions({ silent: false });
    await reloadSourceBranches();
    await reloadTargetBranches();
    await reloadSourceCommits();
  });

  sourceOwnerEl.addEventListener("input", async () => {
    clearSourceCommitSelection();
    await refreshSourceRepoOptions();
    await refreshSourceBranchOptions();
    await reloadSourceBranches();
    await reloadSourceCommits();
  });
  sourceRepoEl.addEventListener("change", () => {
    clearSourceCommitSelection();
    refreshSourceBranchOptions();
    reloadSourceBranches();
    scheduleAutoCommitFetch();
  });
  sourceBranchEl.addEventListener("change", () => {
    clearSourceCommitSelection();
    scheduleAutoCommitFetch();
  });
}

function bindTargetHandlers() {
  targetOwnerEl.addEventListener("input", async () => {
    await refreshTargetBranchOptions();
    await reloadTargetBranches();
    await refreshTargetGroupOptions();
  });
  targetRepoEl.addEventListener("input", async () => {
    await refreshTargetBranchOptions();
    await reloadTargetBranches();
    await refreshTargetGroupOptions();
  });
  targetBranchEl.addEventListener("change", async () => {
    await refreshTargetGroupOptions();
  });
  modeEl.addEventListener("change", () => {
    updateModeUi();
    updateSelectionSummary();
  });
}

function bindPreviewHandlers() {
  previewBtn.addEventListener("click", async () => {
    await runPreview();
  });
}

function bindFormHandlers() {
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runApply();
  });

  form.addEventListener("keydown", async (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      await runApply();
    }
  });
}

function bindFileSelectionHandlers() {
  selectAllFilesBtn.addEventListener("click", () => setAllFileSelections(true));
  selectNoneFilesBtn.addEventListener("click", () => setAllFileSelections(false));
  fileFilterInputEl.addEventListener("input", applyFileFilter);
  fileSelectionListEl.addEventListener("change", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === "checkbox") {
      updateSelectionSummary();
    }
  });
}

function bindResultHandlers() {
  clearResultBtn.addEventListener("click", () => {
    writeResult("Ready.");
  });

  copyResultBtn.addEventListener("click", async () => {
    await copyResultToClipboard();
  });
}

function enforceDarkModeOnly() {
  document.body.dataset.theme = "dark";
  localStorage.setItem(THEME_STORAGE_KEY, "dark");
}

function initializeTokenPersistence() {
  clearExpiredRememberedToken();

  const persisted = localStorage.getItem(TOKEN_PERSIST_KEY) === "yes";
  const rememberedToken = localStorage.getItem(TOKEN_VALUE_KEY) || "";
  const sessionToken = sessionStorage.getItem(TOKEN_SESSION_KEY) || "";
  const initialToken = rememberedToken || sessionToken;

  if (initialToken) {
    tokenInput.value = initialToken;
  }
  rememberTokenEl.checked = persisted;

  tokenInput.addEventListener("input", syncTokenStorage);
  rememberTokenEl.addEventListener("change", syncTokenStorage);
  updateTokenStorageNote();
  updateAccessSummary();
}

function syncTokenStorage() {
  const token = tokenInput.value.trim();
  if (!token) {
    sessionStorage.removeItem(TOKEN_SESSION_KEY);
    localStorage.removeItem(TOKEN_VALUE_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
    if (!rememberTokenEl.checked) {
      localStorage.removeItem(TOKEN_PERSIST_KEY);
    }
    updateTokenStorageNote();
    clearTokenFormatError();
    updateAccessSummary();
    return;
  }

  sessionStorage.setItem(TOKEN_SESSION_KEY, token);

  if (rememberTokenEl.checked) {
    const expiresAt = Date.now() + TOKEN_PERSIST_DAYS * 24 * 60 * 60 * 1000;
    localStorage.setItem(TOKEN_PERSIST_KEY, "yes");
    localStorage.setItem(TOKEN_VALUE_KEY, token);
    localStorage.setItem(TOKEN_EXPIRES_AT_KEY, String(expiresAt));
    updateTokenStorageNote();
    return;
  }

  localStorage.removeItem(TOKEN_VALUE_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  localStorage.removeItem(TOKEN_PERSIST_KEY);
  updateTokenStorageNote();
  updateAccessSummary();
}

function clearToken() {
  tokenInput.value = "";
  sessionStorage.removeItem(TOKEN_SESSION_KEY);
  localStorage.removeItem(TOKEN_VALUE_KEY);
  localStorage.removeItem(TOKEN_PERSIST_KEY);
  localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  rememberTokenEl.checked = false;
  updateTokenStorageNote();
  clearTokenFormatError();
  updateAccessSummary();
}

function clearExpiredRememberedToken() {
  const expiresAtRaw = localStorage.getItem(TOKEN_EXPIRES_AT_KEY);
  if (!expiresAtRaw) {
    return;
  }

  const expiresAt = Number.parseInt(expiresAtRaw, 10);
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    localStorage.removeItem(TOKEN_VALUE_KEY);
    localStorage.removeItem(TOKEN_PERSIST_KEY);
    localStorage.removeItem(TOKEN_EXPIRES_AT_KEY);
  }
}

function updateTokenStorageNote() {
  if (rememberTokenEl.checked) {
    tokenStorageNoteEl.textContent =
      "Token storage: Remember on this device (local storage, expires in 14 days).";
    return;
  }

  tokenStorageNoteEl.textContent =
    "Token storage: Session only (recommended; cleared when tab closes).";
}

function setTokenFormatError(message) {
  tokenFormatErrorEl.textContent = message;
  tokenFormatErrorEl.hidden = false;
  tokenInput.setAttribute("aria-invalid", "true");
}

function clearTokenFormatError() {
  tokenFormatErrorEl.hidden = true;
  tokenInput.removeAttribute("aria-invalid");
}

function validateTokenFormat() {
  const token = tokenInput.value.trim();
  if (!token) {
    clearTokenFormatError();
    return;
  }
  if (!TOKEN_PREFIX_REGEX.test(token)) {
    setTokenFormatError("Token format looks wrong. Expected ghp_... or github_pat_...");
    return;
  }
  clearTokenFormatError();
}

function updateAccessSummary() {
  const token = tokenInput.value.trim();
  if (!token || !TOKEN_PREFIX_REGEX.test(token)) {
    accessSummaryChipEl.textContent = "";
    accessSummaryChipEl.classList.remove("visible");
    accessSummaryChipEl.setAttribute("aria-hidden", "true");
    if (accessDetailsEl) {
      accessDetailsEl.open = true;
    }
    return;
  }

  const tail = token.slice(-4);
  accessSummaryChipEl.textContent = `Token ****${tail}`;
  accessSummaryChipEl.classList.add("visible");
  accessSummaryChipEl.setAttribute("aria-hidden", "false");
  if (accessDetailsEl.open) {
    accessDetailsEl.open = false;
  }
}

function setButtonLabel(button, label) {
  button.textContent = label;
  button.dataset.baseLabel = label;
}

function createLoadingLabel(label) {
  if (/^Preview/i.test(label)) {
    return label.replace(/^Preview/i, "Previewing");
  }
  if (/^Apply/i.test(label)) {
    return label.replace(/^Apply/i, "Applying");
  }
  return `${label}...`;
}

function setButtonLoading(button, isLoading) {
  const baseLabel = button.dataset.baseLabel || button.textContent;
  if (isLoading) {
    button.dataset.baseLabel = baseLabel;
    button.classList.add("is-loading");
    button.textContent = createLoadingLabel(baseLabel);
    return;
  }

  button.classList.remove("is-loading");
  if (button.dataset.baseLabel) {
    button.textContent = button.dataset.baseLabel;
  }
}

function setProgress(message) {
  progressHintEl.textContent = message || "";
}

function handleScanProgress(scanned, total) {
  if (!total) {
    setProgress("No matching env files found.");
    return;
  }
  setProgress(`Scanning ${scanned} of ${total} env files...`);
}

function setPreviewNoteVisible(visible) {
  previewNoteEl.classList.toggle("is-hidden", !visible);
}

function showFilesCard() {
  filesCardEl.classList.remove("is-hidden");
}

function hideFilesCard() {
  filesCardEl.classList.add("is-hidden");
}

async function enforceAccessGate() {
  if (sessionStorage.getItem(ACCESS_SESSION_KEY) === "yes") {
    return;
  }

  if (!accessOverlayEl) {
    throw new Error("Access overlay not found.");
  }

  showAccessOverlay();
  return new Promise((resolve) => {
    const cleanup = () => {
      hideAccessOverlay();
      resolve();
    };

    const unlockListener = () => {
      cleanup();
      accessSubmitBtn.removeEventListener("access-unlocked", unlockListener);
    };

    accessSubmitBtn.addEventListener("access-unlocked", unlockListener);
  });
}

function showAccessOverlay() {
  accessErrorEl.hidden = true;
  accessPassphraseInputEl.value = "";
  accessPassphraseInputEl.type = "password";
  togglePassphraseBtn.textContent = "Show";
  accessOverlayEl.classList.remove("is-hidden");
  if (appRootEl) {
    appRootEl.setAttribute("aria-hidden", "true");
    if ("inert" in appRootEl) {
      appRootEl.inert = true;
    }
  }
  accessFocusCleanup = trapFocus(accessOverlayEl, accessPassphraseInputEl);
}

function hideAccessOverlay() {
  accessOverlayEl.classList.add("is-hidden");
  if (appRootEl) {
    appRootEl.removeAttribute("aria-hidden");
    if ("inert" in appRootEl) {
      appRootEl.inert = false;
    }
  }
  if (accessFocusCleanup) {
    accessFocusCleanup();
    accessFocusCleanup = null;
  }
}

async function attemptAccessUnlock() {
  const password = accessPassphraseInputEl.value || "";
  const hash = await sha256Hex(password);
  if (hash !== APP_ACCESS_HASH) {
    accessErrorEl.hidden = false;
    accessPassphraseInputEl.focus();
    accessPassphraseInputEl.select();
    return;
  }

  sessionStorage.setItem(ACCESS_SESSION_KEY, "yes");
  accessSubmitBtn.dispatchEvent(new Event("access-unlocked"));
}

function trapFocus(container, initialFocusEl) {
  const handleKeydown = (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(container);
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
      return;
    }

    if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  container.addEventListener("keydown", handleKeydown);
  if (initialFocusEl) {
    initialFocusEl.focus();
  }

  return () => {
    container.removeEventListener("keydown", handleKeydown);
  };
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll(
      "button, [href], input, select, textarea, [tabindex]:not([tabindex='-1'])"
    )
  ).filter((el) => !el.disabled && !el.hidden);
}

function showConfirmDialog({ title, body, confirmLabel, cancelLabel, requireTyped }) {
  if (!confirmOverlayEl) {
    return Promise.resolve(false);
  }

  confirmTitleEl.textContent = title;
  confirmBodyEl.textContent = body;
  confirmAcceptBtn.textContent = confirmLabel || "Confirm";
  confirmCancelBtn.textContent = cancelLabel || "Cancel";
  confirmErrorEl.hidden = true;
  confirmErrorEl.textContent = "";

  if (requireTyped) {
    confirmInputRowEl.classList.remove("is-hidden");
    confirmInputEl.value = "";
    confirmInputEl.placeholder = requireTyped;
    confirmAcceptBtn.disabled = true;
  } else {
    confirmInputRowEl.classList.add("is-hidden");
    confirmAcceptBtn.disabled = false;
  }

  confirmOverlayEl.classList.remove("is-hidden");
  if (appRootEl) {
    appRootEl.setAttribute("aria-hidden", "true");
    if ("inert" in appRootEl) {
      appRootEl.inert = true;
    }
  }

  if (confirmFocusCleanup) {
    confirmFocusCleanup();
  }
  confirmFocusCleanup = trapFocus(
    confirmOverlayEl,
    requireTyped ? confirmInputEl : confirmAcceptBtn
  );

  return new Promise((resolve) => {
    confirmResolve = resolve;

    const onCancel = () => {
      closeConfirmDialog(null);
    };

    const onConfirm = () => {
      if (requireTyped) {
        const typed = confirmInputEl.value.trim();
        if (typed !== requireTyped) {
          confirmErrorEl.textContent = "Confirmation text does not match.";
          confirmErrorEl.hidden = false;
          confirmInputEl.focus();
          return;
        }
        closeConfirmDialog(typed);
        return;
      }
      closeConfirmDialog(true);
    };

    const onInput = () => {
      if (!requireTyped) {
        return;
      }
      const typed = confirmInputEl.value.trim();
      confirmAcceptBtn.disabled = typed !== requireTyped;
      if (typed === requireTyped) {
        confirmErrorEl.hidden = true;
      }
    };

    confirmCancelBtn.addEventListener("click", onCancel);
    confirmAcceptBtn.addEventListener("click", onConfirm);
    confirmInputEl.addEventListener("input", onInput);

    confirmCleanup = () => {
      confirmCancelBtn.removeEventListener("click", onCancel);
      confirmAcceptBtn.removeEventListener("click", onConfirm);
      confirmInputEl.removeEventListener("input", onInput);
    };
  });
}

function closeConfirmDialog(result) {
  confirmOverlayEl.classList.add("is-hidden");
  if (confirmCleanup) {
    confirmCleanup();
    confirmCleanup = null;
  }
  if (appRootEl) {
    appRootEl.removeAttribute("aria-hidden");
    if ("inert" in appRootEl) {
      appRootEl.inert = false;
    }
  }
  if (confirmFocusCleanup) {
    confirmFocusCleanup();
    confirmFocusCleanup = null;
  }
  if (confirmResolve) {
    confirmResolve(result);
    confirmResolve = null;
  }
}

function translateGitHubError(message) {
  const statusMatch = String(message).match(/\((\d{3})\)/);
  if (!statusMatch) {
    return null;
  }
  const status = statusMatch[1];
  switch (status) {
    case "401":
      return "Token is invalid or expired. Clear your token and re-enter.";
    case "403":
      return "Token lacks required permissions (Contents: write, Pull requests: write).";
    case "404":
      return "Repository or branch not found. Check source/target settings.";
    case "422":
      return "Branch already exists or ref conflict. Try refreshing and re-running.";
    default:
      return null;
  }
}

function renderResult(lines, isError = false) {
  const rawText = Array.isArray(lines) ? lines.join("\n") : String(lines);
  const friendly = isError ? translateGitHubError(rawText) : null;
  const displayText = friendly ? `${friendly}\n\nDetails: ${rawText}` : rawText;

  lastResultText = rawText;
  resultEl.classList.toggle("error", isError);
  resultEl.innerHTML = "";
  resultEl.append(buildResultFragment(displayText));
}

function buildResultFragment(text) {
  const fragment = document.createDocumentFragment();
  const lines = String(text).split("\n");
  const urlRegex = /(https?:\/\/[^\s]+)/g;

  lines.forEach((line) => {
    const lineEl = document.createElement("div");
    lineEl.className = "result-line";

    urlRegex.lastIndex = 0;
    let lastIndex = 0;
    let match = urlRegex.exec(line);
    while (match !== null) {
      const url = match[0];
      const start = match.index;
      if (start > lastIndex) {
        lineEl.append(document.createTextNode(line.slice(lastIndex, start)));
      }
      if (url.startsWith("https://github.com/")) {
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = url;
        lineEl.append(link);
      } else {
        lineEl.append(document.createTextNode(url));
      }
      lastIndex = start + url.length;
      match = urlRegex.exec(line);
    }
    if (lastIndex < line.length) {
      lineEl.append(document.createTextNode(line.slice(lastIndex)));
    }
    if (line.length === 0) {
      lineEl.append(document.createTextNode(" "));
    }
    fragment.append(lineEl);
  });

  return fragment;
}

async function copyResultToClipboard() {
  const text = lastResultText || resultEl.textContent || "";
  if (!text) {
    return;
  }

  const originalLabel = copyResultBtn.textContent;
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "true");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    copyResultBtn.textContent = "Copied";
  } catch (_error) {
    copyResultBtn.textContent = "Copy failed";
  } finally {
    setTimeout(() => {
      copyResultBtn.textContent = originalLabel;
    }, 1400);
  }
}

function setBusy(isBusy) {
  previewBtn.disabled = isBusy;
  applyBtn.disabled = isBusy;
  loadCommitsBtn.disabled = isBusy;
  setButtonLoading(previewBtn, isBusy);
  setButtonLoading(applyBtn, isBusy);
  if (!isBusy) {
    setProgress("");
  }
}

function writeResult(lines, isError = false) {
  renderResult(lines, isError);
}

function readConfig() {
  const sourceConfig = readSourceConfig();
  const targetOwner = targetOwnerEl.value.trim();
  const targetRepo = targetRepoEl.value.trim();
  const targetBranch = targetBranchEl.value.trim();

  if (!targetOwner || !targetRepo || !targetBranch) {
    throw new Error("Owner, branch, and repo fields cannot be empty.");
  }

  return {
    ...sourceConfig,
    sourceCommitSha: sourceCommitEl.value || null,
    targetOwner,
    targetRepo,
    targetGroup: targetGroupEl.value,
    envScope: envScopeEl.value,
    targetBranch,
    mode: modeEl.value,
    commitMessageTemplate: commitMessageTemplateEl.value,
    yoloMode: yoloModeEl.checked,
  };
}

function readSourceConfig() {
  syncTokenStorage();

  const token = tokenInput.value.trim();
  if (!token) {
    throw new Error("GitHub token is required.");
  }

  const sourceOwner = sourceOwnerEl.value.trim();
  const sourceBranch = sourceBranchEl.value.trim();

  if (!sourceOwner || !sourceBranch) {
    throw new Error("Source owner and source branch cannot be empty.");
  }

  return {
    token,
    sourceOwner,
    sourceRepo: sourceRepoEl.value,
    sourceBranch,
  };
}

function clearSourceCommitSelection() {
  sourceCommitEl.innerHTML = "";
  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = "Latest on source branch (HEAD)";
  sourceCommitEl.append(defaultOption);
  sourceCommitEl.value = "";
  refreshSelect2(sourceCommitEl);
  sourceCommitInfoEl.textContent = "Commits auto-refresh when source branch changes.";
}

function updateModeUi() {
  const isCherryPick = modeEl.value === "cherry-pick";
  setSelectDisabled(targetGroupEl, isCherryPick);
  setSelectDisabled(envScopeEl, isCherryPick);
  fileFilterInputEl.disabled = isCherryPick;
  selectAllFilesBtn.disabled = isCherryPick;
  selectNoneFilesBtn.disabled = isCherryPick;
  setButtonLabel(previewBtn, isCherryPick ? "Preview commit" : "Preview changes");

  modeHintEl.textContent = isCherryPick
    ? "Cherry-pick replays a commit from source to target. Source and target must be the same repository."
    : "";

  if (isCherryPick) {
    selectionSummaryEl.textContent = "Cherry-pick applies full commit";
    setButtonLabel(applyBtn, "Apply cherry-pick");
    fileSelectionListEl.textContent =
      "Not used in cherry-pick mode. Preview shows files touched by selected source commit.";
  }
}

function renderFileSelection(preview) {
  lastPreview = preview;
  fileSelectionListEl.innerHTML = "";
  fileFilterInputEl.value = "";
  showFilesCard();
  setPreviewNoteVisible(false);

  if (!preview || preview.changedFiles.length === 0) {
    fileSelectionListEl.textContent = "No editable files from latest preview.";
    updateSelectionSummary();
    return;
  }

  for (const file of preview.changedFiles) {
    const row = document.createElement("label");
    row.className = "file-item";
    row.dataset.path = file.path.toLowerCase();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.dataset.path = file.path;
    checkbox.setAttribute("aria-label", `Select ${file.path}`);

    const pathText = document.createElement("span");
    pathText.className = "file-path";
    pathText.textContent = file.path;

    row.append(checkbox, pathText);
    fileSelectionListEl.append(row);
  }

  updateSelectionSummary();
}

function setAllFileSelections(checked) {
  const checkboxes = fileSelectionListEl.querySelectorAll('input[type="checkbox"][data-path]');
  for (const box of checkboxes) {
    box.checked = checked;
  }
  updateSelectionSummary();
}

function getSelectedFilePaths() {
  const checked = fileSelectionListEl.querySelectorAll(
    'input[type="checkbox"][data-path]:checked'
  );
  return Array.from(checked).map((node) => node.dataset.path);
}

function applyFileFilter() {
  const keyword = fileFilterInputEl.value.trim().toLowerCase();
  const rows = fileSelectionListEl.querySelectorAll(".file-item");

  for (const row of rows) {
    const path = row.dataset.path || "";
    row.style.display = path.includes(keyword) ? "grid" : "none";
  }
}

function updateSelectionSummary() {
  if (modeEl.value === "cherry-pick") {
    selectionSummaryEl.textContent = "Cherry-pick applies full commit";
    setButtonLabel(applyBtn, "Apply cherry-pick");
    return;
  }

  const all = fileSelectionListEl.querySelectorAll('input[type="checkbox"][data-path]');
  const selected = fileSelectionListEl.querySelectorAll(
    'input[type="checkbox"][data-path]:checked'
  );

  const allCount = all.length;
  const selectedCount = selected.length;
  selectionSummaryEl.textContent = `Selected ${selectedCount} of ${allCount}`;
  setButtonLabel(applyBtn, selectedCount > 0 ? `Apply (${selectedCount})` : "Apply");
}

function getDetectedScopeForChanges(changes) {
  return detectScopeFromPaths(changes.map((file) => file.path));
}

function getSelectedChanges(preview) {
  const selectedPaths = new Set(getSelectedFilePaths());
  return preview.changedFiles.filter((file) => selectedPaths.has(file.path));
}

function buildPreviewLines(preview, detectedScope) {
  const lines = [
    `Source SHA: ${preview.shortSha}`,
    `Source ref: ${preview.sourceRefText}`,
    `Detected scope: ${detectedScope}`,
    `Scanned: ${preview.scannedCount} env file(s)`,
    `Will change: ${preview.changedFiles.length} file(s)`,
    "",
    ...preview.changedFiles.slice(0, 50).map((file) => `- ${file.path}`),
  ];
  if (preview.changedFiles.length > 50) {
    lines.push(`...and ${preview.changedFiles.length - 50} more`);
  }
  return lines;
}

function scheduleAutoCommitFetch() {
  if (commitFetchDebounceId) {
    clearTimeout(commitFetchDebounceId);
  }

  commitFetchDebounceId = setTimeout(async () => {
    const hasToken = tokenInput.value.trim().length > 0;
    const hasBranch = sourceBranchEl.value.trim().length > 0;
    const hasRepo = sourceRepoEl.value.trim().length > 0;
    if (!hasToken || !hasBranch || !hasRepo) {
      return;
    }

    await reloadSourceCommits();
  }, AUTO_COMMIT_FETCH_DEBOUNCE_MS);
}

async function refreshRepoAndGroupOptions({ silent = true } = {}) {
  const sourceOk = await refreshSourceRepoOptions();
  const sourceBranchOk = await refreshSourceBranchOptions();
  const targetBranchOk = await refreshTargetBranchOptions();
  const targetOk = await refreshTargetGroupOptions();

  if (!silent) {
    if (sourceOk && sourceBranchOk && targetBranchOk && targetOk) {
      writeResult(["Refreshed source repos and target groups from API."]);
      return;
    }

    writeResult([
      "Could not fully refresh repo/group options from API.",
      "Using existing values shown in the form.",
    ], true);
  }
}

async function refreshSourceRepoOptions() {
  try {
    const sourceConfig = readSourceConfig();
    const repos = await fetchOwnerRepos(sourceConfig, sourceConfig.sourceOwner);
    const names = repos
      .map((repo) => repo?.name)
      .filter((name) => typeof name === "string" && name.startsWith("CATAPA-"))
      .sort((a, b) => a.localeCompare(b));

    if (names.length === 0) {
      return false;
    }

    const current = sourceRepoEl.value;
    replaceSelectOptions(sourceRepoEl, names, names.includes(current) ? current : names[0]);
    return true;
  } catch (_error) {
    return false;
  }
}

async function refreshSourceBranchOptions() {
  try {
    const sourceConfig = readSourceConfig();
    const branches = await fetchRepoBranchesPage(
      sourceConfig,
      sourceConfig.sourceOwner,
      sourceConfig.sourceRepo,
      1,
      1
    );
    if (!branches.data.length) {
      sourceBranchEl.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No branches found";
      sourceBranchEl.append(option);
      refreshSelect2(sourceBranchEl);
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
}

async function refreshTargetGroupOptions() {
  try {
    const config = readConfig();
    const rootEntries = await githubRequest({
      config,
      method: "GET",
      path: `/repos/${encodeURIComponent(config.targetOwner)}/${encodeURIComponent(config.targetRepo)}/contents?ref=${encodeURIComponent(config.targetBranch)}`,
    });

    if (!Array.isArray(rootEntries)) {
      return;
    }

    const groups = rootEntries
      .filter((entry) => entry?.type === "dir")
      .map((entry) => entry.name)
      .filter((name) => typeof name === "string" && name.startsWith("CATAPA-"))
      .sort((a, b) => a.localeCompare(b));

    if (groups.length === 0) {
      return false;
    }

    const current = targetGroupEl.value;
    const options = ["ALL", ...groups];
    const nextValue = current === "ALL" || groups.includes(current) ? current : groups[0];

    replaceSelectOptions(targetGroupEl, options, nextValue);
    return true;
  } catch (_error) {
    return false;
  }
}

async function refreshTargetBranchOptions() {
  try {
    const config = readConfig();
    const branches = await fetchRepoBranchesPage(
      config,
      config.targetOwner,
      config.targetRepo,
      1,
      1
    );
    if (!branches.data.length) {
      targetBranchEl.innerHTML = "";
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No branches found";
      targetBranchEl.append(option);
      refreshSelect2(targetBranchEl);
      return false;
    }
    return true;
  } catch (_error) {
    return false;
  }
}

function initializeDropdowns() {
  if (!window.jQuery || !window.jQuery.fn || !window.jQuery.fn.select2) {
    return;
  }

  const baseConfig = {
    width: "100%",
    minimumResultsForSearch: 0,
  };

  window.jQuery(sourceRepoEl).select2(baseConfig);
  window.jQuery(targetGroupEl).select2(baseConfig);
  window.jQuery(envScopeEl).select2(baseConfig);
  window.jQuery(modeEl).select2(baseConfig);

  window.jQuery(sourceBranchEl).select2(createBranchSelect2Config(() => ({
    token: tokenInput.value.trim(),
    owner: sourceOwnerEl.value.trim(),
    repo: sourceRepoEl.value,
  })));

  window.jQuery(targetBranchEl).select2(createBranchSelect2Config(() => ({
    token: tokenInput.value.trim(),
    owner: targetOwnerEl.value.trim(),
    repo: targetRepoEl.value.trim(),
  })));

  window.jQuery(sourceCommitEl).select2(createCommitSelect2Config(() => ({
    token: tokenInput.value.trim(),
    owner: sourceOwnerEl.value.trim(),
    repo: sourceRepoEl.value,
    branch: sourceBranchEl.value,
  })));
}

function createBranchSelect2Config(getContext) {
  return {
    width: "100%",
    minimumInputLength: 0,
    language: {
      searching: () => "Loading...",
      noResults: () => "",
      errorLoading: () => "Unable to load",
      loadingMore: () => "Loading more...",
    },
    ajax: {
      delay: 250,
      transport: (params, success, failure) => {
        const ctx = getContext();
        if (!ctx?.token || !ctx.owner || !ctx.repo) {
          success({
            results: [{ id: "__empty__", text: "Enter token and repo to load", disabled: true }],
            pagination: { more: false },
          });
          return null;
        }

        const term = (params?.data?.term || "").trim();
        const page = Number(params?.data?.page || 1);
        const url = buildBranchesUrl(ctx.owner, ctx.repo, 50, page);
        const request = window.jQuery.ajax({
          url,
          dataType: "json",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ctx.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        request
          .done((data, _status, xhr) => {
            const options = filterBranchOptions(data, term);
            const linkHeader = xhr.getResponseHeader("Link");
            const hasNext = hasNextPageLink(linkHeader);
            const results =
              options.length === 0 && !hasNext && page === 1
                ? ensureNonEmptyResults(options, "No data found")
                : options;
            success({
              results,
              pagination: { more: hasNext },
            });
          })
          .fail((_xhr, _status, error) => {
            failure(error || "Request failed");
          });
        return request;
      },
      processResults: (data) => data,
    },
  };
}

function createCommitSelect2Config(getContext) {
  return {
    width: "100%",
    minimumInputLength: 0,
    language: {
      searching: () => "Loading...",
      noResults: () => "",
      errorLoading: () => "Unable to load",
      loadingMore: () => "Loading more...",
    },
    ajax: {
      delay: 250,
      transport: (params, success, failure) => {
        const ctx = getContext();
        if (!ctx?.token || !ctx.owner || !ctx.repo || !ctx.branch) {
          success({
            results: [{ id: "__empty__", text: "Enter token and branch to load", disabled: true }],
            pagination: { more: false },
          });
          return null;
        }

        const term = (params?.data?.term || "").trim();
        const page = Number(params?.data?.page || 1);
        const url = buildCommitsUrl(ctx.owner, ctx.repo, ctx.branch, 30, page);
        const request = window.jQuery.ajax({
          url,
          dataType: "json",
          headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${ctx.token}`,
            "X-GitHub-Api-Version": "2022-11-28",
          },
        });
        request
          .done((data, _status, xhr) => {
            const options = filterCommitOptions(data, term);
            const linkHeader = xhr.getResponseHeader("Link");
            const hasNext = hasNextPageLink(linkHeader);
            const results =
              options.length === 0 && !hasNext && page === 1
                ? ensureNonEmptyResults(options, "No data found")
                : options;
            sourceCommitInfoEl.textContent = buildCommitInfoText(
              ctx,
              options.length,
              term,
              hasNext
            );
            success({
              results,
              pagination: { more: hasNext },
            });
          })
          .fail((_xhr, _status, error) => {
            failure(error || "Request failed");
          });
        return request;
      },
      processResults: (data) => data,
    },
  };
}

function replaceSelectOptions(selectEl, values, selectedValue) {
  selectEl.innerHTML = "";
  const nextValue = values.includes(selectedValue) ? selectedValue : values[0];
  for (const value of values) {
    const option = new Option(value, value, value === nextValue, value === nextValue);
    selectEl.add(option);
  }
  if (window.jQuery?.fn?.select2) {
    window.jQuery(selectEl).trigger("change.select2");
  }
}

function buildBranchesUrl(owner, repo, perPage, page) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}&page=${page}`;
}

function buildCommitsUrl(owner, repo, branch, perPage, page) {
  return `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}&page=${page}`;
}

function setSelectDisabled(selectEl, disabled) {
  selectEl.disabled = disabled;
  if (window.jQuery?.fn?.select2) {
    window.jQuery(selectEl).prop("disabled", disabled).trigger("change.select2");
  }
}

function refreshSelect2(selectEl) {
  if (window.jQuery?.fn?.select2) {
    window.jQuery(selectEl).trigger("change.select2");
  }
}

function clearSelect2Selection(selectEl) {
  selectEl.value = "";
  if (window.jQuery?.fn?.select2) {
    window.jQuery(selectEl).val(null).trigger("change.select2");
  }
}

async function reloadSourceBranches() {
  clearSelect2Selection(sourceBranchEl);
}

async function reloadTargetBranches() {
  refreshSelect2(targetBranchEl);
}

async function reloadSourceCommits() {
  clearSourceCommitSelection();
  refreshSelect2(sourceCommitEl);
}


function filterBranchOptions(branches, query) {
  const normalized = query.trim().toLowerCase();
  return (Array.isArray(branches) ? branches : [])
    .map((branch) => ({ id: branch?.name || "", text: branch?.name || "" }))
    .filter((option) => option.id)
    .filter((option) => !normalized || option.text.toLowerCase().includes(normalized));
}

function filterCommitOptions(commits, query) {
  const normalized = query.trim().toLowerCase();
  return (Array.isArray(commits) ? commits : [])
    .map((commit) => {
      const sha = commit?.sha || "";
      const shortSha = sha.slice(0, SHA_LENGTH);
      const title = (commit?.commit?.message || "").split("\n")[0] || "No message";
      const date = (commit?.commit?.author?.date || "").slice(0, 10);
      const text = `${shortSha} - ${title}${date ? ` (${date})` : ""}`;
      return {
        id: sha,
        text,
      };
    })
    .filter((option) => option.id)
    .filter(
      (option) =>
        !normalized ||
        option.text.toLowerCase().includes(normalized) ||
        option.id.toLowerCase().includes(normalized)
    );
}

function ensureNonEmptyResults(results, message) {
  if (results.length > 0) {
    return results;
  }
  return [{ id: "__empty__", text: message, disabled: true }];
}

function buildCommitInfoText(ctx, count, query, hasNext) {
  const suffix = hasNext ? " (more available)" : "";
  if (query) {
    return `Found ${count} matching commit(s) in ${ctx.repo}/${ctx.branch}.${suffix}`;
  }
  return `Loaded ${count} commit(s) from ${ctx.repo}/${ctx.branch}.${suffix}`;
}

async function fetchRepoBranchesPage(config, owner, repo, page, perPage) {
  const response = await githubRequestWithHeaders({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/branches?per_page=${perPage}&page=${page}`,
  });
  return {
    data: Array.isArray(response.data) ? response.data : [],
    headers: response.headers,
  };
}


async function fetchOwnerRepos(config, owner) {
  try {
    return await githubRequest({
      config,
      method: "GET",
      path: `/orgs/${encodeURIComponent(owner)}/repos?per_page=100&type=all`,
    });
  } catch (error) {
    const message = String(error?.message || "");
    if (!message.includes("(404)")) {
      throw error;
    }

    return githubRequest({
      config,
      method: "GET",
      path: `/users/${encodeURIComponent(owner)}/repos?per_page=100&type=all`,
    });
  }
}




function parseLinkHeader(value) {
  return value.split(",").reduce((acc, part) => {
    const section = part.split(";");
    if (section.length < 2) {
      return acc;
    }
    const url = section[0].trim().replace(/^<|>$/g, "");
    const name = section[1].trim().replace(/rel="(.*)"/, "$1");
    if (name) {
      acc[name] = url;
    }
    return acc;
  }, {});
}

function hasNextPageLink(linkHeader) {
  if (!linkHeader) {
    return false;
  }
  return Boolean(parseLinkHeader(linkHeader).next);
}

async function runPreview() {
  setBusy(true);
  try {
    const config = readConfig();

    if (config.mode === "cherry-pick") {
      setProgress("Loading selected source commit...");
      writeResult(["Loading selected source commit for cherry-pick preview..."]);
      const plan = await buildCherryPickPlan(config);
      renderCherryPickPreview(plan);

      const lines = [
        `Source SHA: ${plan.shortSha}`,
        `Source ref: ${plan.sourceRefText}`,
        `Target: ${config.targetOwner}/${config.targetRepo}@${config.targetBranch}`,
        `Will replay: ${plan.changedPaths.length} file change(s)`,
        "",
        ...plan.changedPaths.slice(0, 50).map((path) => `- ${path}`),
      ];
      if (plan.changedPaths.length > 50) {
        lines.push(`...and ${plan.changedPaths.length - 50} more`);
      }
      writeResult(lines);
      return;
    }

    setProgress("Fetching source SHA and scanning target files...");
    writeResult(["Fetching source SHA and scanning target files..."]);
    const preview = await computeChanges(config, handleScanProgress);
    renderFileSelection(preview);
    const detectedScope = getDetectedScopeForChanges(preview.changedFiles);

    if (preview.changedFiles.length === 0) {
      writeResult([
        `Source SHA: ${preview.shortSha}`,
        `Source ref: ${preview.sourceRefText}`,
        `Detected scope: ${detectedScope}`,
        `No BUILD_SHA changes needed for ${preview.scannedCount} env file(s).`,
      ]);
      return;
    }

    writeResult(buildPreviewLines(preview, detectedScope));
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

    if (config.mode === "cherry-pick") {
      await runCherryPickApply(config);
      return;
    }

    setProgress("Computing and applying changes...");
    writeResult(["Computing and applying changes atomically..."]);

    const preview = await computeChanges(config, handleScanProgress);
    if (!lastPreview) {
      renderFileSelection(preview);
    }

    const selectedChanges = getSelectedChanges(preview);
    const detectedScope = getDetectedScopeForChanges(selectedChanges);

    if (preview.changedFiles.length > 0 && selectedChanges.length === 0) {
      throw new Error("No files selected. Choose at least one file in 'Files to update'.");
    }

    if (!config.yoloMode && config.envScope === "auto" && detectedScope === "mixed") {
      const accepted = await showConfirmDialog({
        title: "Mixed scope detected",
        body: "Selected files span multiple scopes. Continue applying update?",
        confirmLabel: "Apply anyway",
        cancelLabel: "Cancel",
      });
      if (!accepted) {
        throw new Error("Apply canceled because detected scope is mixed.");
      }
    }

    if (preview.changedFiles.length === 0) {
      writeResult([
        `Source SHA: ${preview.shortSha}`,
        `Source ref: ${preview.sourceRefText}`,
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
      changedFiles: selectedChanges,
    });

    const commitMessage = buildCommitMessage(config, preview, detectedScope);
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
      `Source ref: ${preview.sourceRefText}`,
      `Detected scope: ${detectedScope}`,
      `Updated: ${selectedChanges.length} file(s)`,
      `Commit message: ${commitMessage.split("\n")[0]}`,
    ];

    if (config.mode === "pr") {
      const pr = await createPullRequest({
        config,
        headBranch: workingBranch,
        baseBranch: config.targetBranch,
        shortSha: preview.shortSha,
        sourceRefText: preview.sourceRefText,
        commitMessage,
        detectedScope,
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

async function computeChanges(config, onProgress) {
  const sourceSha = await resolveSourceCommitSha(config);

  if (!sourceSha) {
    throw new Error("Unable to read source commit SHA.");
  }
  const shortSha = sourceSha.slice(0, SHA_LENGTH);
  const sourceRefText = `${config.sourceOwner}/${config.sourceRepo}@${config.sourceBranch} (${sourceSha.slice(0, SHA_LENGTH)})`;

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
  if (onProgress) {
    onProgress(0, envPaths.length);
  }
  let scanned = 0;
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
    scanned += 1;
    if (onProgress) {
      onProgress(scanned, envPaths.length);
    }
  }

  return {
    shortSha,
    sourceRefText,
    scannedCount: envPaths.length,
    changedFiles,
  };
}

async function assertDirectCommitConfirmed(config) {
  if (config.yoloMode) {
    return;
  }

  const protectedBranch = /^(main|master)$/i.test(config.targetBranch);
  if (!protectedBranch) {
    return;
  }

  const expected = `${config.targetOwner}/${config.targetRepo}:${config.targetBranch}`;
  const typed = await showConfirmDialog({
    title: "Direct commit confirmation",
    body: `Direct commit to a protected branch requires confirmation. Type exactly: ${expected}`,
    confirmLabel: "Confirm direct commit",
    cancelLabel: "Cancel",
    requireTyped: expected,
  });
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

  return createTreeFromEntries({
    config,
    baseTreeSha,
    tree,
  });
}

async function createTreeFromEntries({ config, baseTreeSha, tree }) {
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

function renderCherryPickPreview(plan) {
  lastPreview = null;
  fileFilterInputEl.value = "";
  fileSelectionListEl.innerHTML = "";
  showFilesCard();
  setPreviewNoteVisible(false);

  if (plan.changedPaths.length === 0) {
    fileSelectionListEl.textContent = "Selected source commit has no file changes to replay.";
    selectionSummaryEl.textContent = "Cherry-pick applies full commit";
    return;
  }

  for (const path of plan.changedPaths) {
    const row = document.createElement("div");
    row.className = "file-item";

    const pathText = document.createElement("p");
    pathText.className = "file-path";
    pathText.textContent = path;

    row.append(pathText);
    fileSelectionListEl.append(row);
  }

  selectionSummaryEl.textContent = `Cherry-pick replays ${plan.changedPaths.length} path(s)`;
}

async function runCherryPickApply(config) {
  assertCherryPickSameRepo(config);
  setProgress("Applying cherry-pick to target branch...");
  writeResult(["Applying cherry-pick to target branch..."]);

  const plan = await buildCherryPickPlan(config);
  if (plan.treeEntries.length === 0) {
    writeResult([
      `Source SHA: ${plan.shortSha}`,
      "Selected source commit has no file changes. Nothing to apply.",
    ]);
    return;
  }

  await assertDirectCommitConfirmed(config);

  const baseRef = await getRef(config, config.targetBranch);
  const baseCommitSha = baseRef.object.sha;
  const baseCommit = await getCommit(config, baseCommitSha);
  const baseTreeSha = baseCommit.tree.sha;
  const treeSha = await createTreeFromEntries({
    config,
    baseTreeSha,
    tree: plan.treeEntries,
  });

  const commitMessage = buildCherryPickCommitMessage(config, plan);
  const newCommitSha = await createCommit({
    config,
    message: commitMessage,
    treeSha,
    parentSha: baseCommitSha,
  });

  await updateRef({
    config,
    branch: config.targetBranch,
    commitSha: newCommitSha,
  });

  writeResult([
    `Source SHA: ${plan.shortSha}`,
    `Source ref: ${plan.sourceRefText}`,
    `Replayed changes: ${plan.changedPaths.length} path(s)`,
    `Commit message: ${commitMessage.split("\n")[0]}`,
    `Commit: https://github.com/${config.targetOwner}/${config.targetRepo}/commit/${newCommitSha}`,
  ]);
}

function assertCherryPickSameRepo(config) {
  const sameOwner = config.sourceOwner === config.targetOwner;
  const sameRepo = config.sourceRepo === config.targetRepo;
  if (!sameOwner || !sameRepo) {
    throw new Error(
      "Cherry-pick mode requires source and target to be the same repository. Set Source owner/repo equal to Target owner/repo."
    );
  }
}

async function resolveSourceCommitSha(config) {
  if (config.sourceCommitSha) {
    return config.sourceCommitSha;
  }

  const sourceBranchData = await githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.sourceOwner)}/${encodeURIComponent(config.sourceRepo)}/branches/${encodeURIComponent(config.sourceBranch)}`,
  });
  return sourceBranchData?.commit?.sha || null;
}

async function buildCherryPickPlan(config) {
  assertCherryPickSameRepo(config);
  const sourceSha = await resolveSourceCommitSha(config);
  if (!sourceSha) {
    throw new Error("Unable to read source commit SHA for cherry-pick.");
  }

  const commitData = await githubRequest({
    config,
    method: "GET",
    path: `/repos/${encodeURIComponent(config.sourceOwner)}/${encodeURIComponent(config.sourceRepo)}/commits/${encodeURIComponent(sourceSha)}`,
  });

  if (Array.isArray(commitData.parents) && commitData.parents.length > 1) {
    throw new Error("Cherry-pick mode does not support merge commits. Pick a non-merge commit.");
  }

  const files = Array.isArray(commitData.files) ? commitData.files : [];
  const treeEntries = [];
  const changedPaths = [];

  for (const file of files) {
    const status = file?.status;
    const filename = file?.filename;
    if (!filename || typeof filename !== "string") {
      continue;
    }

    if (status === "removed") {
      treeEntries.push({
        path: filename,
        mode: "100644",
        type: "blob",
        sha: null,
      });
      changedPaths.push(filename);
      continue;
    }

    if (status === "added" || status === "modified" || status === "renamed") {
      if (!file.sha || typeof file.sha !== "string") {
        throw new Error(`Cherry-pick cannot read blob SHA for ${filename}.`);
      }

      treeEntries.push({
        path: filename,
        mode: "100644",
        type: "blob",
        sha: file.sha,
      });
      changedPaths.push(filename);

      if (status === "renamed" && file.previous_filename) {
        treeEntries.push({
          path: file.previous_filename,
          mode: "100644",
          type: "blob",
          sha: null,
        });
        changedPaths.push(file.previous_filename);
      }
      continue;
    }

    throw new Error(
      `Cherry-pick cannot process file status "${status || "unknown"}" on ${filename}.`
    );
  }

  const uniquePaths = [...new Set(changedPaths)];
  const sourceRefText = `${config.sourceOwner}/${config.sourceRepo}@${config.sourceBranch} (${sourceSha.slice(0, SHA_LENGTH)})`;

  return {
    sourceSha,
    shortSha: sourceSha.slice(0, SHA_LENGTH),
    sourceRefText,
    changedPaths: uniquePaths,
    treeEntries,
    sourceTitle: (commitData.commit?.message || "").split("\n")[0] || "",
  };
}

function buildCherryPickCommitMessage(config, plan) {
  const firstLine = `chore: cherry-pick ${plan.shortSha} from ${config.sourceBranch} to ${config.targetBranch}`;
  const originalTitle = plan.sourceTitle ? `\n\nOriginal: ${plan.sourceTitle}` : "";
  return `${firstLine}\n\nSource: ${plan.sourceRefText}${originalTitle}`;
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

async function createPullRequest({
  config,
  headBranch,
  baseBranch,
  shortSha,
  sourceRefText,
  commitMessage,
  detectedScope,
}) {
  const title = commitMessage.split("\n")[0] || `chore: sync BUILD_SHA to ${shortSha}`;
  const body = [
    "## Summary",
    `- Sync BUILD_SHA to \`${shortSha}\``,
    `- Source: ${sourceRefText}`,
    `- Scope: ${config.targetGroup} (${detectedScope})`,
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

function buildCommitMessage(config, preview, detectedScope) {
  const template =
    (config.commitMessageTemplate || "").trim() ||
    "ci(scope): {commit_sha_7_digit} to dev";

  const map = {
    commit_sha_7_digit: preview.shortSha,
    shortSha: preview.shortSha,
    sourceRef: preview.sourceRefText,
    sourceOwner: config.sourceOwner,
    sourceRepo: config.sourceRepo,
    sourceBranch: config.sourceBranch,
    targetGroup: config.targetGroup,
    envScope: detectedScope,
    scope: detectedScope,
    targetRepo: config.targetRepo,
    targetBranch: config.targetBranch,
  };

  return template.replace(/\{(commit_sha_7_digit|shortSha|sourceRef|sourceOwner|sourceRepo|sourceBranch|targetGroup|envScope|scope|targetRepo|targetBranch)\}/g, (_match, key) => map[key] || "");
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
  if (envScope === "all" || envScope === "auto") {
    return true;
  }
  return path.includes(`/${envScope}/`);
}

function detectScopeFromPaths(paths) {
  const scopes = new Set();
  for (const path of paths) {
    if (path.includes("/dev/")) {
      scopes.add("dev");
    }
    if (path.includes("/demo/")) {
      scopes.add("demo");
    }
    if (path.includes("/prod/")) {
      scopes.add("prod");
    }
  }

  if (scopes.size === 0) {
    return "all";
  }
  if (scopes.size === 1) {
    return [...scopes][0];
  }
  return "mixed";
}

function applyBuildSha(text, shortSha) {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }
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

async function githubRequestWithHeaders({ config, method, path, body }) {
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

  const data = response.status === 204 ? {} : await response.json();
  return { data, headers: response.headers };
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
