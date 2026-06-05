import { createOopsProofActionResponse, createOopsProofResponse } from "../src/server.js";

export function createVercelHandler({
  env = process.env,
  loadBufferData,
  createDraftPost,
} = {}) {
  return async function handler(request, response) {
    const pathname = new URL(request.url ?? "/", "http://localhost").pathname;

    if (request.method === "GET" && pathname === "/") {
      return sendAppResponse(
        response,
        await createOopsProofResponse({
          env,
          loadBufferData,
          url: request.url,
        }),
      );
    }

    if (request.method === "POST" && pathname === "/quarantine") {
      return sendAppResponse(
        response,
        await createOopsProofActionResponse({
          env,
          loadBufferData,
          createDraftPost,
          formData: await readFormData(request),
        }),
      );
    }

    response.statusCode = 404;
    response.setHeader?.("content-type", "text/plain; charset=utf-8");
    response.end("Not found");
  };
}

async function readFormData(request) {
  if (request.body instanceof URLSearchParams) {
    return request.body;
  }
  if (typeof request.body === "string") {
    return new URLSearchParams(request.body);
  }
  if (request.body && typeof request.body === "object" && !Buffer.isBuffer(request.body)) {
    return new URLSearchParams(request.body);
  }

  return new URLSearchParams(await readRequestBody(request));
}

function sendAppResponse(response, appResponse) {
  response.statusCode = appResponse.status;
  response.setHeader?.("content-type", appResponse.contentType);
  response.setHeader?.("cache-control", appResponse.cacheControl);
  response.end(appResponse.body);
}

async function readRequestBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
  }
  return body;
}

export default createVercelHandler();
