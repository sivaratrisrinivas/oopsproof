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
    if (request.method === "GET" && request.url === "/") {
      const appResponse = await createOopsProofResponse({ env, envFilePath, loadBufferData });
      response.writeHead(200, {
        "content-type": appResponse.contentType,
        "cache-control": appResponse.cacheControl,
      });
      response.end(appResponse.body);
      return;
    }

    if (request.method === "POST" && request.url === "/quarantine") {
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
} = {}) {
  const localEnv = await readLocalEnv(envFilePath);
  const bufferApiKey = env.BUFFER_API_KEY || localEnv.BUFFER_API_KEY || "";

  return responseFromState(await loadReadyState({ bufferApiKey, loadBufferData }));
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

function responseFromState(state) {
  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
    body: renderQueueTableShell(state),
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

  if (!confirmed) {
    quarantineResult = {
      kind: "failed",
      message: "Quarantine Confirmation Required",
      detail: "Confirm that the original Scheduled Post will remain in Buffer before creating a Draft Post.",
    };
  } else if (!target?.canQuarantine) {
    quarantineResult = {
      kind: "failed",
      message: "Failed Quarantine",
      detail: "Only risky Scheduled Posts can be quarantined.",
    };
  } else {
    quarantineResult = await createSafeDraftReplacement({
      post: target.post,
      createDraftPost: (draft) => createDraftPost({ bufferApiKey, ...draft }),
    });
  }

  return responseFromState({ ...state, quarantineResult });
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

function renderQueueTableShell(state) {
  const isError = state.kind === "missing-key" || state.kind === "invalid-key" || state.kind === "buffer-error";
  const assessedPosts = state.assessedPosts ?? [];
  const quarantineResult = state.quarantineResult;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>OopsProof</title>
    <style>
      :root {
        color-scheme: light;
        font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        background: #f6f8fb;
        color: #172033;
      }

      body {
        margin: 0;
      }

      main {
        max-width: 1120px;
        margin: 0 auto;
        padding: 32px 20px 48px;
      }

      header {
        display: flex;
        align-items: flex-end;
        justify-content: space-between;
        gap: 16px;
        margin-bottom: 24px;
      }

      h1 {
        margin: 0 0 6px;
        font-size: 2rem;
        line-height: 1.1;
      }

      h2 {
        margin: 0;
        font-size: 1.15rem;
      }

      p {
        margin: 0;
        color: #546179;
      }

      .status {
        border: 1px solid ${isError ? "#f3a8a8" : "#b8d2ff"};
        background: ${isError ? "#fff5f5" : "#eef6ff"};
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
      }

      .status strong {
        display: block;
        margin-bottom: 4px;
        color: ${isError ? "#9b1c1c" : "#134f94"};
      }

      .regions {
        display: grid;
        gap: 16px;
      }

      section {
        background: #ffffff;
        border: 1px solid #dce3ee;
        border-radius: 8px;
        padding: 18px;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 14px;
        table-layout: fixed;
      }

      th {
        text-align: left;
        color: #637089;
        font-size: 0.8rem;
        text-transform: uppercase;
      }

      th, td {
        border-bottom: 1px solid #e5eaf1;
        padding: 10px 8px;
      }

      .empty {
        color: #637089;
      }

      .meta {
        display: grid;
        gap: 4px;
      }

      .post-text {
        overflow-wrap: anywhere;
      }

      details {
        display: grid;
        gap: 8px;
      }

      summary {
        cursor: pointer;
        color: #134f94;
        font-weight: 700;
      }

      ul {
        margin: 8px 0 0;
        padding-left: 18px;
      }

      li + li {
        margin-top: 6px;
      }
    </style>
  </head>
  <body>
    <main>
      <header>
        <div>
          <h1>OopsProof</h1>
          <p>Queue Table</p>
        </div>
      </header>

      <div class="status" role="${isError ? "alert" : "status"}">
        <strong>${escapeHtml(state.message)}</strong>
        <span>${escapeHtml(state.detail)}</span>
      </div>

      ${quarantineResult ? renderQuarantineResult(quarantineResult) : ""}

      <div class="regions" aria-label="Queue Table experience">
        <section aria-labelledby="organization-heading">
          <h2 id="organization-heading">Selected Buffer Organization</h2>
          <p>${state.organization ? escapeHtml(state.organization.name) : "No Buffer Organization selected."}</p>
        </section>

        <section aria-labelledby="loading-heading">
          <h2 id="loading-heading">Loading</h2>
          <p>${isError ? "Stopped before loading Buffer data." : "Loaded scheduled posts from Buffer."}</p>
        </section>

        <section aria-labelledby="error-heading">
          <h2 id="error-heading">Error</h2>
          <p>${isError ? escapeHtml(state.message) : "No Buffer error."}</p>
        </section>

        <section aria-labelledby="empty-heading">
          <h2 id="empty-heading">Empty Queue</h2>
          <p class="empty">${assessedPosts.length === 0 ? "No scheduled posts found in the next 30 days" : "Scheduled posts found in the next 30 days"}</p>
        </section>

        <section aria-labelledby="table-heading">
          <h2 id="table-heading">Queue Table</h2>
          <table>
            <thead>
              <tr>
                <th>Scheduled Post</th>
                <th>Channel</th>
                <th>Due Time</th>
                <th>Risk Level</th>
                <th>Findings</th>
                <th>Quarantine</th>
              </tr>
            </thead>
            <tbody>${renderPostRows(assessedPosts)}</tbody>
          </table>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function renderPostRows(assessedPosts) {
  return assessedPosts
    .map(
      ({ post, riskLevel, findings, canQuarantine }) => `<tr>
                <td class="post-text">
                  ${escapeHtml(post.text)}
                  <div class="meta">
                    <span>${escapeHtml(post.service)} &middot; ${escapeHtml(post.status)}</span>
                    ${post.createdAt ? `<span>Created ${escapeHtml(post.createdAt)}</span>` : ""}
                  </div>
                </td>
                <td>${escapeHtml(post.channelName)}</td>
                <td>${escapeHtml(post.dueAt ?? "")}</td>
                <td>${escapeHtml(riskLevel)}</td>
                <td>${renderFindingSummaries(findings)}</td>
                <td>${canQuarantine ? renderQuarantineForm(post) : ""}</td>
              </tr>`,
    )
    .join("");
}

function renderQuarantineResult(result) {
  const isFailed = result.kind === "failed";
  return `<div class="status" role="${isFailed ? "alert" : "status"}">
        <strong>${escapeHtml(result.message)}</strong>
        <span>${escapeHtml(result.detail ?? "")}</span>
        ${result.draftPostId ? `<span>Draft Post ID: ${escapeHtml(result.draftPostId)}</span>` : ""}
      </div>`;
}

function renderQuarantineForm(post) {
  return `<form method="post" action="/quarantine">
                  <input type="hidden" name="postId" value="${escapeHtml(post.id)}">
                  <strong>Quarantine Confirmation</strong>
                  <p>The original Scheduled Post will remain in Buffer and must be removed manually.</p>
                  <label>
                    <input type="checkbox" name="confirmed" value="yes" required>
                    Create a same-channel Safe Draft Replacement.
                  </label>
                  <button type="submit">Quarantine</button>
                </form>`;
}

function sortPostsByDueTime(posts) {
  return [...posts].sort((left, right) => timestamp(left.dueAt) - timestamp(right.dueAt));
}

function timestamp(value) {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.POSITIVE_INFINITY : time;
}

function renderFindingSummaries(findings) {
  if (findings.length === 0) {
    return "No Findings";
  }

  return `<details>
                  <summary>Inspect Findings</summary>
                  <ul>${findings.map(renderFinding).join("")}</ul>
                </details>`;
}

function renderFinding(finding) {
  return `<li><strong>${escapeHtml(finding.rule)}</strong>: ${escapeHtml(finding.summary)}</li>`;
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
