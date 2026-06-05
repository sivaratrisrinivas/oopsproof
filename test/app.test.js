import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { BufferClientError } from "../src/bufferClient.js";
import {
  createOopsProofActionResponse,
  createOopsProofResponse,
  createOopsProofRequestHandler,
  createOopsProofServer,
  createQueueCache,
} from "../src/server.js";

test("initial route shows missing Local Buffer API Key state without fake fallback data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "oopsproof-"));

  const response = await createOopsProofResponse({
    env: {},
    envFilePath: join(directory, ".env"),
    loadBufferData: async () => {
      throw new Error("Buffer data should not load without a Local Buffer API Key");
    },
  });

  const html = response.body;

  assert.equal(response.status, 200);
  assert.match(html, /OopsProof/);
  assert.match(html, /Missing Local Buffer API Key/);
  assert.match(html, /Add BUFFER_API_KEY to your local \.env file/);
  assert.doesNotMatch(html, /fake post|seeded post|demo fallback/i);
});

test("Local Buffer API Key is read from .env for server-side loading without appearing in browser output", async () => {
  const secret = "buffer_secret_for_test";
  const directory = await mkdtemp(join(tmpdir(), "oopsproof-"));
  const envFilePath = join(directory, ".env");
  await writeFile(envFilePath, `BUFFER_API_KEY=${secret}\n`, "utf8");

  let loadedWithKey = "";
  const response = await createOopsProofResponse({
    env: {},
    envFilePath,
    loadBufferData: async ({ bufferApiKey }) => {
      loadedWithKey = bufferApiKey;
      return { posts: [] };
    },
  });

  assert.equal(loadedWithKey, secret);
  assert.doesNotMatch(response.body, new RegExp(secret));
  assert.match(response.body, /Launch Team|Your Queue|OopsProof/);
});

test("Queue shows loaded and empty states when live Buffer data has no Scheduled Posts", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  assert.match(response.body, /No scheduled posts found in the next 30 days/);
  assert.doesNotMatch(response.body, /fake post|seeded post|demo fallback/i);
});

test("Queue includes a manual Refresh control for fetching live Buffer data", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  assert.match(response.body, /<form method="get" action="\/"/);
  assert.match(response.body, /↻ Refresh/);
});

test("manual Refresh fetches live Buffer data again and re-runs deterministic diagnosis", async () => {
  let loadCount = 0;
  const options = {
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => {
      loadCount += 1;
      return {
        organization: { id: "org-first", name: "Launch Team" },
        posts:
          loadCount === 1
            ? [
                {
                  id: "post-clear",
                  text: "A simple evergreen update for the queue",
                  channelId: "channel-x",
                  channelName: "Founder X",
                  service: "twitter",
                  status: "scheduled",
                  dueAt: "2026-07-10T12:00:00.000Z",
                  createdAt: "2026-06-01T09:00:00.000Z",
                },
              ]
            : [
                {
                  id: "post-risky",
                  text: "LaunchKit ships today for early partners",
                  channelId: "channel-x",
                  channelName: "Founder X",
                  service: "twitter",
                  status: "scheduled",
                  dueAt: "2026-06-10T12:00:00.000Z",
                  createdAt: "2026-06-01T09:00:00.000Z",
                },
              ],
      };
    },
  };

  const initialResponse = await createOopsProofResponse(options);
  const refreshedResponse = await createOopsProofResponse(options);

  assert.equal(loadCount, 2);
  assert.match(initialResponse.body, /A simple evergreen update for the queue/);
  assert.match(initialResponse.body, /Clear/);
  assert.doesNotMatch(initialResponse.body, /LaunchKit ships today/);
  assert.match(refreshedResponse.body, /LaunchKit ships today for early partners/);
  assert.match(refreshedResponse.body, /High/);
  assert.match(refreshedResponse.body, /embargo term LaunchKit|Mentions embargo/);
});

test("manual Refresh failure shows a Buffer error without keeping the previous queue", async () => {
  let loadCount = 0;
  const options = {
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => {
      loadCount += 1;
      if (loadCount === 2) {
        throw new Error("Buffer refresh failed");
      }

      return {
        organization: { id: "org-first", name: "Launch Team" },
        posts: [
          {
            id: "post-clear",
            text: "A simple evergreen update for the queue",
            channelId: "channel-x",
            channelName: "Founder X",
            service: "twitter",
            status: "scheduled",
            dueAt: "2026-07-10T12:00:00.000Z",
            createdAt: "2026-06-01T09:00:00.000Z",
          },
        ],
      };
    },
  };

  const initialResponse = await createOopsProofResponse(options);
  const refreshedResponse = await createOopsProofResponse(options);

  assert.match(initialResponse.body, /A simple evergreen update for the queue/);
  assert.match(refreshedResponse.body, /Buffer data could not load/);
  assert.match(refreshedResponse.body, /Buffer refresh failed/);
  assert.doesNotMatch(refreshedResponse.body, /A simple evergreen update for the queue/);
});

test("Queue does not auto-refresh or render Quarantine History", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  // Tiny progressive script for copy feedback + checkbox (intentional polish). No auto polling or history.
  assert.doesNotMatch(response.body, /setInterval|EventSource|WebSocket|auto-refresh|polling|Quarantine History/i);
  assert.doesNotMatch(response.body, /http-equiv=["']refresh["']/i);
  assert.doesNotMatch(response.body, /audit log|action log|database|persisted quarantine/i);
});

test("initial route shows selected Buffer Organization and normalized Scheduled Posts", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      channels: [{ id: "channel-x", name: "Founder X", service: "twitter" }],
      posts: [
        {
          id: "post-1",
          text: "LaunchKit ships soon",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
  });

  assert.match(response.body, /Launch Team/);
  assert.match(response.body, /LaunchKit ships soon/);
  assert.match(response.body, /Founder X/);
  assert.match(response.body, /twitter/);
  assert.match(response.body, /Jun 10|12:00/); // formatted due time in new UI
});

test("Queue cards show highest Risk Level and Finding summaries from deterministic diagnosis", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
  });

  assert.match(response.body, /High/);
  assert.match(response.body, /Mentions embargo term LaunchKit|embargo term LaunchKit/);
  assert.match(response.body, /stale before publishing|today/);
});

test("risky Scheduled Posts can be opened to inspect every Finding", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
  });

  // In new 3-screen design, click "Review" on queue takes you to inspect screen which shows all findings
  assert.match(response.body, /Review →/); // action that leads to inspect screen with full findings
  // Note: full rule details are on the dedicated Inspect screen (one action per screen)
});

test("Queue orders Scheduled Posts by due time and shows created time when available", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-later",
          text: "Later post",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-20T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
        {
          id: "post-earlier",
          text: "Earlier post",
          channelId: "channel-y",
          channelName: "Company LinkedIn",
          service: "linkedin",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-05-30T08:00:00.000Z",
        },
      ],
    }),
  });

  assert.ok(response.body.indexOf("Earlier post") < response.body.indexOf("Later post"));
  assert.match(response.body, /May 30|Jun 1/);
});

test("Clear Posts remain visible without Quarantine or other action controls", async () => {
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-clear",
          text: "A simple evergreen update for the queue",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-07-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
  });

  assert.match(response.body, /A simple evergreen update for the queue/);
  assert.match(response.body, /Clear/);
  // In new design, clear cards have no primary action button for quarantine
  assert.doesNotMatch(response.body, /Quarantine this post|Create Safe Draft/i);
});

test("risky Scheduled Posts offer Quarantine Confirmation before draft creation", async () => {
  let draftCreationCount = 0;
  // First go through inspect flow to trigger the quarantine screen
  const queueRes = await createOopsProofResponse({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
  });

  // Simulate clicking "Review" then "Quarantine this post" (posts without confirmed)
  const actionRes = await createOopsProofActionResponse({
    env: { BUFFER_API_KEY: "server-key" },
    formData: new URLSearchParams("postId=post-risky"),
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
    createDraftPost: async () => {
      draftCreationCount += 1;
      return { id: "draft-123" };
    },
  });

  assert.equal(draftCreationCount, 0);
  assert.match(actionRes.body, /Create Safe Draft/);
  assert.match(actionRes.body, /I understand that the original Scheduled Post will remain in Buffer and I must remove it manually\./);
});

test("confirmed Quarantine creates a Safe Draft Replacement and shows the Draft Post ID", async () => {
  const createdDrafts = [];
  const originalText = "LaunchKit ships today for early partners";
  const response = await createOopsProofActionResponse({
    env: { BUFFER_API_KEY: "server-key" },
    formData: new URLSearchParams("postId=post-risky&confirmed=yes"),
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: originalText,
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
    createDraftPost: async (draft) => {
      createdDrafts.push(draft);
      return { id: "draft-123" };
    },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(createdDrafts, [
    {
      bufferApiKey: "server-key",
      channelId: "channel-x",
      text: `Needs review before publishing: ${originalText.slice(0, 80)}`,
    },
  ]);
  assert.match(response.body, /Safe draft created\. Remove the original scheduled post in Buffer\./);
  assert.match(response.body, /draft-123/); // Draft ID visible on success screen
  assert.doesNotMatch(response.body, /Risk removed from queue|delete|deleted|removed the original/i);
});

test("Failed Quarantine shows the Buffer error without false success copy", async () => {
  const response = await createOopsProofActionResponse({
    env: { BUFFER_API_KEY: "server-key" },
    formData: new URLSearchParams("postId=post-risky&confirmed=yes"),
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
    createDraftPost: async () => {
      throw new Error("Buffer draft creation failed");
    },
  });

  assert.match(response.body, /Failed Quarantine|Buffer draft creation failed/);
  assert.doesNotMatch(response.body, /Safe draft created\. Remove the original scheduled post in Buffer\./);
});

test("initial route shows invalid Local Buffer API Key state for Buffer auth failures", async () => {
  const secret = "bad_buffer_secret";
  const response = await createOopsProofResponse({
    env: { BUFFER_API_KEY: secret },
    loadBufferData: async () => {
      throw new BufferClientError("invalid-key", "Not authorized");
    },
  });

  assert.match(response.body, /Invalid Local Buffer API Key/);
  assert.match(response.body, /Buffer rejected the Local Buffer API Key/);
  assert.doesNotMatch(response.body, new RegExp(secret));
});

test("HTTP Refresh route renders the Queue Table even when the request URL has a query string", async () => {
  const server = createOopsProofServer({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  const response = await requestServer(server, { method: "GET", url: "/?refresh=manual" });

  assert.equal(response.status, 200);
  assert.match(response.body, /Your Queue|OopsProof/);
  assert.doesNotMatch(response.body, /Not found/);
});

test("normal navigation and Quarantine reuse cached Buffer queue data to protect Free tier limits", async () => {
  let loadCount = 0;
  let draftCount = 0;
  const handler = createOopsProofRequestHandler({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => {
      loadCount += 1;
      return {
        organization: { id: "org-first", name: "Launch Team" },
        posts: [
          {
            id: "post-risky",
            text: "LaunchKit ships today for early partners",
            channelId: "channel-x",
            channelName: "Founder X",
            service: "twitter",
            status: "scheduled",
            dueAt: "2026-06-10T12:00:00.000Z",
            createdAt: "2026-06-01T09:00:00.000Z",
          },
        ],
      };
    },
    createDraftPost: async () => {
      draftCount += 1;
      return { id: "draft-123" };
    },
  });

  await requestHandler(handler, { method: "GET", url: "/" });
  await requestHandler(handler, { method: "GET", url: "/?inspect=post-risky" });
  await requestHandler(handler, {
    method: "POST",
    url: "/quarantine",
    body: "postId=post-risky",
  });
  await requestHandler(handler, {
    method: "POST",
    url: "/quarantine",
    body: "postId=post-risky&confirmed=yes",
  });

  assert.equal(loadCount, 1);
  assert.equal(draftCount, 1);
});

test("manual Refresh bypasses cached Buffer queue data", async () => {
  let loadCount = 0;
  const handler = createOopsProofRequestHandler({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => {
      loadCount += 1;
      return {
        organization: { id: "org-first", name: "Launch Team" },
        posts: [],
      };
    },
  });

  await requestHandler(handler, { method: "GET", url: "/" });
  await requestHandler(handler, { method: "GET", url: "/" });
  await requestHandler(handler, { method: "GET", url: "/?refresh=1" });

  assert.equal(loadCount, 2);
});

test("cached Buffer queue data expires after the cache TTL", async () => {
  let currentTime = 0;
  let loadCount = 0;
  const handler = createOopsProofRequestHandler({
    env: { BUFFER_API_KEY: "server-key" },
    queueCache: createQueueCache({
      ttlMs: 1000,
      now: () => currentTime,
    }),
    loadBufferData: async () => {
      loadCount += 1;
      return {
        organization: { id: "org-first", name: "Launch Team" },
        posts: [],
      };
    },
  });

  await requestHandler(handler, { method: "GET", url: "/" });
  currentTime = 500;
  await requestHandler(handler, { method: "GET", url: "/" });
  currentTime = 1001;
  await requestHandler(handler, { method: "GET", url: "/" });

  assert.equal(loadCount, 2);
});

test("serverless-compatible request handler renders the root app route", async () => {
  const handler = createOopsProofRequestHandler({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  const response = await requestHandler(handler, { method: "GET", url: "/" });

  assert.equal(response.status, 200);
  assert.match(response.body, /OopsProof/);
  assert.match(response.body, /Launch Team/);
});

test("HTTP Quarantine route accepts form posts even when the request URL has a query string", async () => {
  const createdDrafts = [];
  const server = createOopsProofServer({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [
        {
          id: "post-risky",
          text: "LaunchKit ships today for early partners",
          channelId: "channel-x",
          channelName: "Founder X",
          service: "twitter",
          status: "scheduled",
          dueAt: "2026-06-10T12:00:00.000Z",
          createdAt: "2026-06-01T09:00:00.000Z",
        },
      ],
    }),
    createDraftPost: async (draft) => {
      createdDrafts.push(draft);
      return { id: "draft-123" };
    },
  });

  const response = await requestServer(server, {
    method: "POST",
    url: "/quarantine?from=queue",
    body: "postId=post-risky&confirmed=yes",
  });

  assert.equal(response.status, 200);
  assert.equal(createdDrafts.length, 1);
  assert.match(response.body, /Safe draft created\. Remove the original scheduled post in Buffer\./);
  assert.match(response.body, /draft-123/);
  assert.doesNotMatch(response.body, /Not found/);
});

async function requestServer(server, { method, url, body = "" }) {
  const requestHandler = server.listeners("request")[0];
  return requestHandlerForTest(requestHandler, { method, url, body });
}

async function requestHandler(handler, { method, url, body = "" }) {
  return requestHandlerForTest(handler, { method, url, body });
}

async function requestHandlerForTest(handler, { method, url, body = "" }) {
  let status = 0;
  let responseBody = "";
  const request = {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield body;
      }
    },
  };
  const response = {
    writeHead(nextStatus) {
      status = nextStatus;
    },
    end(nextBody) {
      responseBody = nextBody;
    },
  };

  await handler(request, response);

  return { status, body: responseBody };
}
