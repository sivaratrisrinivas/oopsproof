import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const DEFAULT_PORT = 3000;

export function createOopsProofServer({
  env = process.env,
  envFilePath = resolve(process.cwd(), ".env"),
  loadBufferData = async () => ({ posts: [] }),
} = {}) {
  return createServer(async (request, response) => {
    if (request.method !== "GET" || request.url !== "/") {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }

    const appResponse = await createOopsProofResponse({ env, envFilePath, loadBufferData });
    response.writeHead(200, {
      "content-type": appResponse.contentType,
      "cache-control": appResponse.cacheControl,
    });
    response.end(appResponse.body);
  });
}

export async function createOopsProofResponse({
  env = process.env,
  envFilePath = resolve(process.cwd(), ".env"),
  loadBufferData = async () => ({ posts: [] }),
} = {}) {
  const localEnv = await readLocalEnv(envFilePath);
  const bufferApiKey = env.BUFFER_API_KEY || localEnv.BUFFER_API_KEY || "";

  let state;
  if (!bufferApiKey.trim()) {
    state = {
      kind: "missing-key",
      message: "Missing Local Buffer API Key",
      detail: "Add BUFFER_API_KEY to your local .env file, then restart OopsProof.",
    };
  } else {
    await loadBufferData({ bufferApiKey });
    state = {
      kind: "ready",
      message: "Loading live Buffer data",
      detail: "The Queue Table is ready for live scheduled posts from Buffer.",
    };
  }

  return {
    status: 200,
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-store",
    body: renderQueueTableShell(state),
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
  const isMissingKey = state.kind === "missing-key";

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
        border: 1px solid ${isMissingKey ? "#f3a8a8" : "#b8d2ff"};
        background: ${isMissingKey ? "#fff5f5" : "#eef6ff"};
        border-radius: 8px;
        padding: 16px;
        margin-bottom: 20px;
      }

      .status strong {
        display: block;
        margin-bottom: 4px;
        color: ${isMissingKey ? "#9b1c1c" : "#134f94"};
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

      <div class="status" role="${isMissingKey ? "alert" : "status"}">
        <strong>${escapeHtml(state.message)}</strong>
        <span>${escapeHtml(state.detail)}</span>
      </div>

      <div class="regions" aria-label="Queue Table experience">
        <section aria-labelledby="loading-heading">
          <h2 id="loading-heading">Loading</h2>
          <p>${isMissingKey ? "Stopped before loading Buffer data." : "Loading scheduled posts from Buffer."}</p>
        </section>

        <section aria-labelledby="error-heading">
          <h2 id="error-heading">Error</h2>
          <p>${isMissingKey ? escapeHtml(state.message) : "No Buffer error."}</p>
        </section>

        <section aria-labelledby="empty-heading">
          <h2 id="empty-heading">Empty Queue</h2>
          <p class="empty">No scheduled posts found in the next 30 days</p>
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
              </tr>
            </thead>
            <tbody></tbody>
          </table>
        </section>
      </div>
    </main>
  </body>
</html>`;
}

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT || DEFAULT_PORT);
  createOopsProofServer().listen(port, () => {
    console.log(`OopsProof listening on http://localhost:${port}`);
  });
}
