import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  BufferClientError,
  createDraftPost as createBufferDraftPost,
  loadLiveBufferQueue,
} from "./bufferClient.js";
import { createSafeDraftReplacement } from "./quarantineService.js";
import { assessQueuePosts } from "./riskEngine.js";

const DEFAULT_PORT = 3000;

export function createOopsProofServer({
  env = process.env,
  envFilePath = resolve(process.cwd(), ".env"),
  loadBufferData = loadLiveBufferQueue,
  createDraftPost = createBufferDraftPost,
} = {}) {
  return createServer(async (request, response) => {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && pathname === "/") {
      const appResponse = await createOopsProofResponse({ env, envFilePath, loadBufferData, url: request.url });
      response.writeHead(200, {
        "content-type": appResponse.contentType,
        "cache-control": appResponse.cacheControl,
      });
      response.end(appResponse.body);
      return;
    }

    if (request.method === "POST" && pathname === "/quarantine") {
      const appResponse = await createOopsProofActionResponse({
        env,
        envFilePath,
        loadBufferData,
        createDraftPost,
        formData: new URLSearchParams(await readRequestBody(request)),
      });
      response.writeHead(200, {
        "content-type": appResponse.contentType,
        "cache-control": appResponse.cacheControl,
      });
      response.end(appResponse.body);
      return;
    }

    {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
  });
}

export async function createOopsProofResponse({
  env = process.env,
  envFilePath = resolve(process.cwd(), ".env"),
  loadBufferData = loadLiveBufferQueue,
  url = "/",
} = {}) {
  const localEnv = await readLocalEnv(envFilePath);
  const bufferApiKey = env.BUFFER_API_KEY || localEnv.BUFFER_API_KEY || "";

  const state = await loadReadyState({ bufferApiKey, loadBufferData });
  const parsedUrl = new URL(url, "http://localhost");
  const inspectId = parsedUrl.searchParams.get("inspect");

  return responseFromState(state, { inspectId });
}

async function loadReadyState({ bufferApiKey, loadBufferData }) {
  if (!bufferApiKey.trim()) {
    return {
      kind: "missing-key",
      message: "Missing Local Buffer API Key",
      detail: "Add BUFFER_API_KEY to your local .env file, then restart OopsProof.",
    };
  }

  try {
    const queue = await loadBufferData({ bufferApiKey });
    return {
      kind: "ready",
      message: "Loaded live Buffer data",
      detail: "The Queue Table is ready for live scheduled posts from Buffer.",
      organization: queue.organization,
      assessedPosts: assessQueuePosts(sortPostsByDueTime(queue.posts ?? [])),
    };
  } catch (error) {
    return normalizeLoadError(error);
  }
}

function responseFromState(state, { inspectId, quarantineResult, quarantineTarget, showQuarantineConfirm = false } = {}) {
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
    body: renderApp(state, { inspectId, quarantineResult, quarantineTarget, showQuarantineConfirm }),
  };
}

export async function createOopsProofActionResponse({
  env = process.env,
  envFilePath = resolve(process.cwd(), ".env"),
  loadBufferData = loadLiveBufferQueue,
  createDraftPost = createBufferDraftPost,
  formData = new URLSearchParams(),
} = {}) {
  const localEnv = await readLocalEnv(envFilePath);
  const bufferApiKey = env.BUFFER_API_KEY || localEnv.BUFFER_API_KEY || "";
  const state = await loadReadyState({ bufferApiKey, loadBufferData });

  if (state.kind !== "ready") {
    return responseFromState(state);
  }

  const postId = formData.get("postId") ?? "";
  const confirmed = formData.get("confirmed") === "yes";
  const target = state.assessedPosts.find((assessedPost) => assessedPost.post.id === postId);
  let quarantineResult;

  let quarantineResultForRender = null;
  let showConfirmForm = false;

  if (!confirmed) {
    // Entering quarantine flow from Inspect screen — show the beautiful confirmation form (Screen 3)
    showConfirmForm = true;
  } else if (!target?.canQuarantine) {
    quarantineResultForRender = {
      kind: "failed",
      message: "Failed Quarantine",
      detail: "Only risky Scheduled Posts can be quarantined.",
    };
  } else {
    quarantineResultForRender = await createSafeDraftReplacement({
      post: target.post,
      createDraftPost: (draft) => createDraftPost({ bufferApiKey, ...draft }),
    });
  }

  // Always render dedicated quarantine screen for this flow (one action per screen)
  return responseFromState(state, {
    quarantineResult: quarantineResultForRender,
    quarantineTarget: target,
    showQuarantineConfirm: showConfirmForm,
  });
}

function normalizeLoadError(error) {
  if (error instanceof BufferClientError && error.kind === "invalid-key") {
    return {
      kind: "invalid-key",
      message: "Invalid Local Buffer API Key",
      detail: "Buffer rejected the Local Buffer API Key. Check BUFFER_API_KEY, then restart OopsProof.",
    };
  }

  return {
    kind: "buffer-error",
    message: "Buffer data could not load",
    detail: error.message || "Buffer returned an unexpected error.",
  };
}

async function readLocalEnv(envFilePath) {
  try {
    return parseDotEnv(await readFile(envFilePath, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

function parseDotEnv(source) {
  const values = {};

  for (const line of source.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    values[key] = rawValue.replace(/^["']|["']$/g, "");
  }

  return values;
}

// =====================================================
// NEW 3-SCREEN UI — One action per screen, ≤3 clicks to core goal
// Emil Kowalski + industrial designer level of detail
// =====================================================

function renderApp(state, { inspectId, quarantineResult, quarantineTarget, showQuarantineConfirm = false } = {}) {
  const isErrorState = state.kind === "missing-key" || state.kind === "invalid-key" || state.kind === "buffer-error";

  // Quarantine flow takes precedence (Screen 3)
  if (state.kind === "ready" && (quarantineResult || quarantineTarget || showQuarantineConfirm)) {
    const target = quarantineTarget || state.assessedPosts.find((a) => a.post.id === (quarantineResult?.postId || ""));
    return renderShell(state, renderQuarantineScreen(state, target, quarantineResult, { showConfirmForm: showQuarantineConfirm }), { isErrorState });
  }

  // Inspect screen (Screen 2) — triggered by ?inspect=ID on GET
  if (state.kind === "ready" && inspectId) {
    const assessed = state.assessedPosts.find((a) => a.post.id === inspectId);
    if (assessed) {
      return renderShell(state, renderInspectScreen(assessed, state.organization), { isErrorState });
    }
  }

  // Default: Queue (Screen 1)
  return renderShell(state, renderQueueScreen(state), { isErrorState });
}

function renderShell(state, content, { isErrorState = false } = {}) {
  const orgName = state.organization?.name || "No organization";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OopsProof</title>
  <style>
    :root {
      color-scheme: light;
      --font: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      --bg: #f8f7f4;
      --card: #ffffff;
      --text: #0f172a;
      --text-muted: #475569;
      --border: #e7e5e4;
      --primary: #0f172a;
      --primary-hover: #1e2937;
      --high: #9f1239;
      --high-bg: #fff1f2;
      --medium: #b45309;
      --medium-bg: #fffbeb;
      --clear: #166534;
      --clear-bg: #f0fdf4;
      --success: #166534;
      --success-bg: #f0fdf4;
      --error: #9f1239;
      --error-bg: #fff1f2;

      /* Emil-grade easings */
      --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
      --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);
    }

    * { box-sizing: border-box; }
    html, body { margin: 0; padding: 0; }

    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--text);
      line-height: 1.6;
      -webkit-font-smoothing: antialiased;
    }

    .app {
      max-width: 720px;
      margin: 0 auto;
      padding: 48px 20px 80px;
      min-height: 100vh;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 32px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }

    .brand {
      font-size: 21px;
      font-weight: 700;
      letter-spacing: -0.02em;
    }

    .org {
      font-size: 13px;
      color: var(--text-muted);
      background: #f1f0ed;
      padding: 4px 10px;
      border-radius: 999px;
      font-weight: 500;
    }

    .refresh-btn {
      appearance: none;
      border: 1px solid var(--border);
      background: var(--card);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 14px;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 120ms var(--ease-out), background 120ms ease, border-color 120ms ease;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .refresh-btn:hover { background: #f8f7f4; border-color: #d4d2cf; }
    .refresh-btn:active { transform: scale(0.985); }

    .card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04);
    }

    .section-title {
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 10px;
    }

    .post-text-hero {
      font-size: 17px;
      line-height: 1.55;
      white-space: pre-wrap;
      word-break: break-word;
      font-weight: 500;
    }

    .meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      margin-top: 16px;
      font-size: 13px;
      color: var(--text-muted);
    }
    .meta-row span {
      display: inline-flex;
      align-items: center;
      gap: 5px;
    }

    .badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 9px;
      border-radius: 999px;
      letter-spacing: 0.03em;
    }
    .badge-high { background: var(--high-bg); color: var(--high); }
    .badge-medium { background: var(--medium-bg); color: var(--medium); }
    .badge-clear { background: var(--clear-bg); color: var(--clear); }

    .risk-pill {
      font-size: 12px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 999px;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }

    .finding {
      border-left: 3px solid var(--border);
      padding-left: 14px;
      margin-bottom: 14px;
    }
    .finding.high { border-left-color: var(--high); }
    .finding.medium { border-left-color: var(--medium); }

    .finding .rule {
      font-weight: 700;
      font-size: 13px;
      display: block;
      margin-bottom: 2px;
    }

    .primary-btn {
      appearance: none;
      border: none;
      background: var(--primary);
      color: white;
      font: inherit;
      font-weight: 600;
      font-size: 15px;
      padding: 14px 28px;
      border-radius: 10px;
      cursor: pointer;
      transition: transform 140ms var(--ease-out), background 140ms ease;
      box-shadow: 0 1px 2px rgba(15, 23, 42, 0.1);
      width: 100%;
      max-width: 420px;
      margin-top: 8px;
    }
    .primary-btn:hover { background: var(--primary-hover); }
    .primary-btn:active { transform: scale(0.985); }
    .primary-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
      transform: none;
    }

    .ghost-btn {
      appearance: none;
      background: transparent;
      border: 1px solid var(--border);
      color: var(--text);
      font: inherit;
      font-size: 13px;
      font-weight: 600;
      padding: 8px 16px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 120ms var(--ease-out);
    }
    .ghost-btn:hover { background: #f8f7f4; }

    .back-link {
      font-size: 13px;
      color: var(--text-muted);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
      margin-bottom: 20px;
      font-weight: 500;
    }
    .back-link:hover { color: var(--text); }

    .status-banner {
      border-radius: 12px;
      padding: 18px 20px;
      margin-bottom: 24px;
      font-size: 14px;
    }
    .status-banner.error {
      background: var(--error-bg);
      border: 1px solid #fecdd3;
      color: var(--error);
    }
    .status-banner.success {
      background: var(--success-bg);
      border: 1px solid #bbf7d0;
      color: var(--success);
    }
    .status-banner strong { display: block; margin-bottom: 4px; font-size: 15px; }

    .queue-list { display: flex; flex-direction: column; gap: 10px; }
    .queue-card {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 18px 20px;
      transition: transform 160ms var(--ease-out), box-shadow 160ms var(--ease-out), border-color 160ms ease;
      cursor: pointer;
    }
    .queue-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 4px 12px -2px rgb(15 23 42 / 0.08);
      border-color: #d4d2cf;
    }
    .queue-card.risky { border-left: 4px solid var(--high); }
    .queue-card.medium { border-left: 4px solid var(--medium); }
    .queue-card.clear { border-left: 4px solid #a3a3a3; opacity: 0.92; }

    .queue-card .text {
      font-size: 15px;
      line-height: 1.45;
      margin-bottom: 10px;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .queue-meta {
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: var(--text-muted);
    }

    .due {
      font-feature-settings: "tnum";
    }

    .empty-state {
      text-align: center;
      padding: 60px 20px;
      color: var(--text-muted);
    }
    .empty-state h3 {
      font-size: 17px;
      color: var(--text);
      margin: 16px 0 8px;
      font-weight: 600;
    }

    .confirm-box {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 20px;
      background: #fafaf9;
      margin: 20px 0;
    }

    .draft-preview {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: white;
      border: 1px solid var(--border);
      padding: 14px 16px;
      border-radius: 8px;
      font-size: 13.5px;
      line-height: 1.5;
      margin: 12px 0;
      color: #334155;
    }

    .draft-id {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
      background: #0f172a;
      color: #e0f2fe;
      padding: 10px 14px;
      border-radius: 8px;
      font-size: 14px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    .copy-btn {
      font-size: 11px;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.25);
      color: #bae6fd;
      padding: 4px 10px;
      border-radius: 6px;
      cursor: pointer;
      font-weight: 600;
      transition: all 120ms ease;
    }
    .copy-btn:hover { background: rgba(255,255,255,0.18); }

    .checkbox-label {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      cursor: pointer;
      font-size: 14px;
      line-height: 1.4;
      user-select: none;
    }
    .checkbox-label input {
      margin-top: 3px;
      accent-color: var(--primary);
    }

    .screen-title {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-muted);
      margin-bottom: 6px;
    }

    .post-header {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 12px;
    }

    .divider { height: 1px; background: var(--border); margin: 24px 0; }

    @media (prefers-reduced-motion: reduce) {
      .queue-card, .primary-btn, .refresh-btn { transition: none !important; }
    }
  </style>
</head>
<body>
  <div class="app">
    <div class="header">
      <div>
        <div class="brand">OopsProof</div>
        <div style="font-size:12px; color:#64748b; margin-top:1px;">Publishing safety for Buffer</div>
      </div>
      <div style="display:flex; align-items:center; gap:12px;">
        <div class="org">${escapeHtml(orgName)}</div>
        <form method="get" action="/">
          <button type="submit" class="refresh-btn" aria-label="Refresh live Buffer data">
            ↻ Refresh
          </button>
        </form>
      </div>
    </div>

    ${content}
  </div>

  <script>
    // Minimal progressive enhancement for "wow" details (no external deps)
    (function() {
      // 1. Checkbox enables the primary action button on quarantine screen
      const confirmCheckbox = document.querySelector('#confirm-checkbox');
      const actionBtn = document.querySelector('#quarantine-action-btn');
      if (confirmCheckbox && actionBtn) {
        const update = () => {
          actionBtn.disabled = !confirmCheckbox.checked;
          actionBtn.style.opacity = confirmCheckbox.checked ? '1' : '0.5';
        };
        confirmCheckbox.addEventListener('change', update);
        update(); // initial state
      }

      // 2. Copy draft ID with nice feedback
      const copyBtn = document.querySelector('#copy-draft-id');
      if (copyBtn) {
        copyBtn.addEventListener('click', async (e) => {
          e.preventDefault();
          const idEl = document.querySelector('#draft-id-value');
          if (!idEl) return;
          const text = idEl.textContent.trim();
          try {
            await navigator.clipboard.writeText(text);
            const orig = copyBtn.textContent;
            copyBtn.textContent = 'Copied';
            copyBtn.style.background = 'rgba(16, 185, 129, 0.2)';
            copyBtn.style.borderColor = 'rgba(16, 185, 129, 0.4)';
            setTimeout(() => {
              copyBtn.textContent = orig;
              copyBtn.style.background = '';
              copyBtn.style.borderColor = '';
            }, 1600);
          } catch (_) {
            // fallback: select text
            const range = document.createRange();
            range.selectNode(idEl);
            window.getSelection().removeAllRanges();
            window.getSelection().addRange(range);
          }
        });
      }

      // 3. Subtle active press feedback on all primary buttons (Emil principle)
      document.querySelectorAll('.primary-btn, .refresh-btn').forEach(btn => {
        btn.addEventListener('mousedown', () => {
          btn.style.transform = 'scale(0.985)';
        });
        ['mouseup', 'mouseleave'].forEach(evt => {
          btn.addEventListener(evt, () => {
            btn.style.transform = '';
          });
        });
      });

      // 4. Make whole queue cards feel clickable (the form inside handles it)
      document.querySelectorAll('.queue-card[data-clickable="true"]').forEach(card => {
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            const form = card.querySelector('form');
            if (form) form.submit();
          }
        });
        card.setAttribute('tabindex', '0');
        card.setAttribute('role', 'button');
      });
    })();
  </script>
</body>
</html>`;
}

// -------------------- SCREEN 1: QUEUE --------------------
function renderQueueScreen(state) {
  const isError = state.kind === "missing-key" || state.kind === "invalid-key" || state.kind === "buffer-error";
  const assessed = state.assessedPosts ?? [];

  if (isError) {
    const msg = state.kind === "missing-key"
      ? "Add BUFFER_API_KEY to your local .env file, then restart OopsProof."
      : state.kind === "invalid-key"
        ? "Buffer rejected the Local Buffer API Key. Check BUFFER_API_KEY, then restart OopsProof."
        : (state.detail || "Buffer returned an unexpected error.");

    return `
      <div class="status-banner error" role="alert">
        <strong>${escapeHtml(state.message)}</strong>
        <div style="margin-top:4px; opacity:0.9;">${escapeHtml(msg)}</div>
      </div>

      <div class="card" style="text-align:center; padding:48px 32px;">
        <div style="font-size:42px; line-height:1; margin-bottom:16px; opacity:0.6;">!</div>
        <div style="font-size:17px; font-weight:600; margin-bottom:8px;">Cannot load live data</div>
        <p style="max-width:320px; margin:0 auto 20px; color:var(--text-muted);">OopsProof only works with real Buffer scheduled posts.</p>
        <form method="get" action="/">
          <button type="submit" class="primary-btn" style="max-width:200px; margin:0 auto;">Retry</button>
        </form>
      </div>
    `;
  }

  const risky = assessed.filter(a => a.canQuarantine);
  const clear = assessed.filter(a => !a.canQuarantine);

  let listHtml = '';

  if (risky.length === 0 && clear.length === 0) {
    listHtml = `
      <div class="empty-state">
        <div style="font-size:48px; opacity:0.5; margin-bottom:8px;">📭</div>
        <h3>No scheduled posts found in the next 30 days</h3>
        <p style="max-width:280px; margin:8px auto 0;">The live Buffer queue is clear in the scan window.</p>
      </div>
    `;
  } else {
    listHtml = `<div class="queue-list">`;

    // Risky posts first — primary focus
    risky.forEach(item => {
      listHtml += renderQueueCard(item, true);
    });

    // Clear posts — visible for context but de-emphasized
    if (clear.length > 0) {
      listHtml += `<div style="margin-top:24px; margin-bottom:8px;" class="section-title">Clear — no action needed</div>`;
      clear.forEach(item => {
        listHtml += renderQueueCard(item, false);
      });
    }
    listHtml += `</div>`;
  }

  const headerText = risky.length > 0 
    ? `Review the ${risky.length} post${risky.length > 1 ? 's' : ''} that need attention`
    : "All upcoming posts are clear";

  return `
    <div class="card" style="margin-bottom:12px; padding:18px 22px;">
      <div class="section-title">Your Queue</div>
      <div style="font-size:15px; font-weight:600;">${headerText}</div>
      <div style="font-size:12px; color:#64748b; margin-top:2px;">Live from Buffer • sorted by due time</div>
    </div>

    ${listHtml}

    <div style="margin-top:28px; font-size:11px; color:#94a3b8; text-align:center;">
      One action per screen. Core goal in 3 clicks.
    </div>
  `;
}

function renderQueueCard(assessed, isRisky) {
  const { post, riskLevel, findings, canQuarantine } = assessed;
  const riskClass = riskLevel === "High" ? "risky" : riskLevel === "Medium" ? "medium" : "clear";
  const badgeClass = riskLevel === "High" ? "badge-high" : riskLevel === "Medium" ? "badge-medium" : "badge-clear";

  const due = formatDue(post.dueAt);
  const excerpt = post.text.length > 140 ? post.text.slice(0, 137) + "…" : post.text;

  const action = canQuarantine 
    ? `<form method="get" action="/"><input type="hidden" name="inspect" value="${escapeHtml(post.id)}"><button type="submit" class="primary-btn" style="width:auto; font-size:13px; padding:8px 18px; max-width:none;">Review →</button></form>`
    : `<form method="get" action="/"><input type="hidden" name="inspect" value="${escapeHtml(post.id)}"><button type="submit" class="ghost-btn" style="font-size:11px; padding:4px 10px;">View</button></form>`;

  return `
    <div class="queue-card ${riskClass}" data-clickable="${canQuarantine}" onclick="this.querySelector('form')?.submit()">
      <div class="text">${escapeHtml(excerpt)}</div>

      <div class="queue-meta">
        <span><strong>${escapeHtml(post.channelName)}</strong> · ${escapeHtml(post.service)}</span>
        <span class="due">${escapeHtml(due)}</span>
        <span class="badge ${badgeClass}">${escapeHtml(riskLevel)}</span>
      </div>

      <div style="margin-top:14px; display:flex; justify-content:space-between; align-items:center; gap:8px;">
        ${findings.length > 0 
          ? `<div style="font-size:12px; color:#64748b; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(findings[0].summary)}</div>` 
          : `<div></div>`}
        ${action}
      </div>
    </div>
  `;
}

// -------------------- SCREEN 2: INSPECT --------------------
function renderInspectScreen(assessed, organization) {
  const { post, riskLevel, findings, canQuarantine } = assessed;
  const isHigh = riskLevel === "High";
  const badgeClass = isHigh ? "badge-high" : riskLevel === "Medium" ? "badge-medium" : "badge-clear";

  const due = formatDue(post.dueAt);
  const created = post.createdAt ? new Date(post.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : null;

  const findingsHtml = findings.length > 0 
    ? findings.map(f => `
        <div class="finding ${f.riskLevel.toLowerCase()}">
          <div class="rule">${escapeHtml(f.rule)}</div>
          <div style="font-size:14px; color:#334155;">${escapeHtml(f.summary)}</div>
        </div>
      `).join("")
    : `<div style="color:#64748b; font-size:14px;">No findings. This post is clear.</div>`;

  const actionHtml = canQuarantine 
    ? `<form method="post" action="/quarantine" style="margin-top:28px;">
         <input type="hidden" name="postId" value="${escapeHtml(post.id)}">
         <button type="submit" class="primary-btn">Quarantine this post</button>
         <div style="font-size:11px; color:#64748b; margin-top:8px; text-align:center;">This is the only action on this screen.</div>
       </form>`
    : `<div style="margin-top:24px; padding:16px; background:#f8f7f4; border-radius:10px; font-size:13px; color:#475569;">
         This post has no risk findings. No quarantine action available.
       </div>`;

  return `
    <a href="/" class="back-link">← Back to queue</a>

    <div class="screen-title">Inspect Scheduled Post</div>
    <div class="card">
      <div class="post-header">
        <span class="risk-pill" style="background:${isHigh ? 'var(--high-bg)' : '#fefce8'}; color:${isHigh ? 'var(--high)' : '#854d0e'}">
          ${isHigh ? '⚠' : '●'} ${escapeHtml(riskLevel)} Risk
        </span>
        <span class="badge ${badgeClass}">${escapeHtml(riskLevel)}</span>
      </div>

      <div class="post-text-hero">${escapeHtml(post.text)}</div>

      <div class="meta-row">
        <span><strong>Channel</strong> ${escapeHtml(post.channelName)} <span style="opacity:0.6">(${escapeHtml(post.service)})</span></span>
        <span><strong>Due</strong> ${escapeHtml(due)}</span>
        ${created ? `<span><strong>Created</strong> ${escapeHtml(created)}</span>` : ''}
        <span><strong>Status</strong> ${escapeHtml(post.status)}</span>
      </div>

      <div class="divider"></div>

      <div class="section-title">Findings — why this was flagged</div>
      ${findingsHtml}
    </div>

    ${actionHtml}

    <div style="margin-top:32px; font-size:11px; color:#94a3b8; text-align:center;">
      Every finding is deterministic. No AI involved.
    </div>
  `;
}

// -------------------- SCREEN 3: QUARANTINE (one action) --------------------
function renderQuarantineScreen(state, target, result, { showConfirmForm = false } = {}) {
  const post = target?.post;

  // Success or failure result state
  if (result && result.kind === "success") {
    return `
      <a href="/" class="back-link">← Back to queue</a>

      <div class="status-banner success" role="status">
        <strong>${escapeHtml(result.message)}</strong>
        <div style="margin-top:6px;">${escapeHtml(result.detail || "")}</div>
      </div>

      <div class="card">
        <div class="section-title" style="color:#166534;">Safe Draft Created</div>
        
        <div style="margin:16px 0 8px; font-size:13px; color:#475569;">Draft Post ID</div>
        <div class="draft-id">
          <span id="draft-id-value">${escapeHtml(result.draftPostId)}</span>
          <button id="copy-draft-id" class="copy-btn" type="button">Copy</button>
        </div>

        <div style="margin-top:24px; padding:16px; background:#f0fdf4; border-radius:10px; font-size:14px; line-height:1.5;">
          <strong>Next step:</strong> Go to Buffer and remove the original scheduled post manually.<br>
          The draft is on the same channel for easy review.
        </div>
      </div>

      <form method="get" action="/" style="margin-top:20px;">
        <button type="submit" class="primary-btn" style="background:#166534;">Return to Queue</button>
      </form>
    `;
  }

  if (result && result.kind === "failed" && !showConfirmForm) {
    return `
      <a href="/" class="back-link">← Back to queue</a>

      <div class="status-banner error" role="alert">
        <strong>${escapeHtml(result.message)}</strong>
        <div style="margin-top:4px;">${escapeHtml(result.detail || "Buffer draft creation failed.")}</div>
      </div>

      <div class="card">
        <p style="margin:0 0 16px;">The original Scheduled Post was left untouched.</p>
        <form method="get" action="/">
          <button type="submit" class="ghost-btn">Return to Queue</button>
        </form>
      </div>
    `;
  }

  // Confirmation form state — the one action on this screen
  if (!post) {
    return `<div class="card">No post selected for quarantine.</div>`;
  }

  const draftPreview = `Needs review before publishing: ${String(post.text || "").slice(0, 80)}`;

  return `
    <a href="/?inspect=${encodeURIComponent(post.id)}" class="back-link">← Back to inspection</a>

    <div class="screen-title">Quarantine — one action</div>

    <div class="card">
      <div style="font-size:15px; line-height:1.5; margin-bottom:16px;">
        This will create a <strong>Safe Draft Replacement</strong> on the same channel.
      </div>

      <div class="confirm-box">
        <div style="font-size:12px; font-weight:700; color:#475569; margin-bottom:6px;">DRAFT TEXT THAT WILL BE CREATED</div>
        <div class="draft-preview">${escapeHtml(draftPreview)}</div>
        <div style="font-size:12px; color:#64748b;">(first 80 characters of original + conservative prefix)</div>
      </div>

      <div style="font-size:13.5px; line-height:1.55; color:#334155; margin:16px 0 20px;">
        <strong>Important:</strong> The original Scheduled Post will <strong>remain in Buffer</strong>. 
        You must remove it yourself after the draft is created.
      </div>

      <form method="post" action="/quarantine">
        <input type="hidden" name="postId" value="${escapeHtml(post.id)}">

        <label class="checkbox-label">
          <input type="checkbox" id="confirm-checkbox" name="confirmed" value="yes" required>
          <span>I understand that the original Scheduled Post will remain in Buffer and I must remove it manually.</span>
        </label>

        <button id="quarantine-action-btn" type="submit" class="primary-btn" disabled style="opacity:0.5; margin-top:20px;">
          Create Safe Draft
        </button>
        <div style="font-size:10px; text-align:center; margin-top:8px; color:#94a3b8;">This is the only action on this screen.</div>
      </form>
    </div>
  `;
}

// -------------------- HELPERS --------------------
function formatDue(dueAt) {
  if (!dueAt) return "";
  const d = new Date(dueAt);
  if (isNaN(d.getTime())) return dueAt;
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + " • " +
         d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function sortPostsByDueTime(posts) {
  return [...posts].sort((left, right) => timestamp(left.dueAt) - timestamp(right.dueAt));
}

function timestamp(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  createOopsProofServer().listen(port, () => {
    console.log(`OopsProof listening on http://localhost:${port}`);
  });
}
