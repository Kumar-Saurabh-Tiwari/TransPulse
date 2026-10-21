import "./lib/error-capture";

import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";
import { handleTranscriptionRequest } from "./lib/transcribe-audio.server";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// h3 swallows in-handler throws into a normal 500 Response with body
// {"unhandled":true,"message":"HTTPError"} — try/catch alone never fires for those.
async function normalizeCatastrophicSsrResponse(response: Response): Promise<Response> {
  if (response.status < 500) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return response;

  const body = await response.clone().text();
  if (!isH3SwallowedErrorBody(body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`h3 swallowed SSR error: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function isH3SwallowedErrorBody(body: string): boolean {
  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

function getTranscriptionApiKey(env: unknown) {
  if (typeof env === "object" && env !== null && "GROQ_API_KEY" in env) {
    const key = env["GROQ_API_KEY"];
    if (typeof key === "string" && key) return key;
  }
  return typeof process !== "undefined" ? process.env["GROQ_API_KEY"] : undefined;
}

function getTranscriptionModel(env: unknown) {
  if (typeof env === "object" && env !== null && "GROQ_TRANSCRIPTION_MODEL" in env) {
    const model = env["GROQ_TRANSCRIPTION_MODEL"];
    if (typeof model === "string" && model) return model;
  }
  return typeof process !== "undefined"
    ? process.env["GROQ_TRANSCRIPTION_MODEL"] || "whisper-large-v3-turbo"
    : "whisper-large-v3-turbo";
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      if (new URL(request.url).pathname === "/api/transcribe") {
        return await handleTranscriptionRequest(
          request,
          getTranscriptionApiKey(env),
          getTranscriptionModel(env),
        );
      }
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return await normalizeCatastrophicSsrResponse(response);
    } catch (error) {
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
};
