import assert from "node:assert/strict";
import { test } from "node:test";

import { createVercelHandler } from "../api/index.js";

test("Vercel handler renders the app at the root route", async () => {
  const handler = createVercelHandler({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  const response = await requestHandler(handler, { method: "GET", url: "/" });

  assert.equal(response.status, 200);
  assert.equal(response.headers["content-type"], "text/html; charset=utf-8");
  assert.equal(response.headers["cache-control"], "no-store");
  assert.match(response.body, /OopsProof/);
  assert.match(response.body, /Launch Team/);
});

test("Vercel handler creates a Safe Draft Replacement from Quarantine form posts", async () => {
  const createdDrafts = [];
  const handler = createVercelHandler({
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

  const response = await requestHandler(handler, {
    method: "POST",
    url: "/quarantine",
    body: "postId=post-risky&confirmed=yes",
  });

  assert.equal(response.status, 200);
  assert.deepEqual(createdDrafts, [
    {
      bufferApiKey: "server-key",
      channelId: "channel-x",
      text: "Needs review before publishing: LaunchKit ships today for early partners",
    },
  ]);
  assert.match(response.body, /Safe draft created\. Remove the original scheduled post in Buffer\./);
  assert.match(response.body, /draft-123/);
});

test("Vercel handler reuses cached Buffer queue data across navigation and Quarantine", async () => {
  let loadCount = 0;
  let draftCount = 0;
  const handler = createVercelHandler({
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

test("Vercel handler returns Not found for unsupported routes", async () => {
  const handler = createVercelHandler({
    env: { BUFFER_API_KEY: "server-key" },
    loadBufferData: async () => ({
      organization: { id: "org-first", name: "Launch Team" },
      posts: [],
    }),
  });

  const response = await requestHandler(handler, { method: "GET", url: "/missing" });

  assert.equal(response.status, 404);
  assert.equal(response.body, "Not found");
});

async function requestHandler(handler, { method, url, body = "" }) {
  const request = {
    method,
    url,
    body,
    async *[Symbol.asyncIterator]() {
      if (body) {
        yield body;
      }
    },
  };
  const response = {
    statusCode: 0,
    headers: {},
    body: "",
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    end(nextBody) {
      this.body = nextBody;
    },
  };

  await handler(request, response);

  return {
    status: response.statusCode,
    headers: response.headers,
    body: response.body,
  };
}
