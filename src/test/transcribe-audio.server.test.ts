// @vitest-environment node

import { afterEach, describe, expect, it, vi } from "vitest";
import { handleTranscriptionRequest } from "@/lib/transcribe-audio.server";

function createRequest(clientId: string, formData?: FormData, origin = "https://example.test") {
  return new Request("https://example.test/api/transcribe", {
    method: "POST",
    headers: { origin, "cf-connecting-ip": clientId },
    ...(formData ? { body: formData } : {}),
  });
}

describe("handleTranscriptionRequest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports missing server credentials without contacting the provider", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await handleTranscriptionRequest(createRequest("missing-key"));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Transcription is not configured. Set the server-side GROQ_API_KEY secret.",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects cross-origin requests", async () => {
    const response = await handleTranscriptionRequest(
      createRequest("cross-origin", new FormData(), "https://attacker.test"),
      "test-key",
    );

    expect(response.status).toBe(403);
  });

  it("submits the microphone file to the transcription provider", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello, こんにちは", language: "english" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["audio bytes"], { type: "audio/webm" }), "recording.webm");

    const response = await handleTranscriptionRequest(createRequest("successful-request", formData), "test-key");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ text: "Hello, こんにちは", language: "english" });
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0]?.[0]).toBe("https://api.groq.com/openai/v1/audio/transcriptions");
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer test-key");
    const providerForm = init.body as FormData;
    expect(providerForm.get("model")).toBe("whisper-large-v3-turbo");
    expect(providerForm.get("response_format")).toBe("verbose_json");
    expect(providerForm.get("file")).toBeInstanceOf(Blob);
  });

  it("uses a configured transcription model", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["audio bytes"], { type: "audio/webm" }), "recording.webm");

    await handleTranscriptionRequest(createRequest("custom-model-request", formData), "test-key", "whisper-large-v3");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.body as FormData).get("model")).toBe("whisper-large-v3");
  });

  it("forwards a valid source-language hint to transcription", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: "Hello", language: "english" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["audio bytes"], { type: "audio/webm" }), "recording.webm");
    formData.append("language", "en");

    await handleTranscriptionRequest(createRequest("hinted-language-request", formData), "test-key");

    const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect((init.body as FormData).get("language")).toBe("en");
  });

  it("explains how to fix a rejected Groq API key without exposing provider details", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: { message: "invalid_api_key" } }), {
        status: 401,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const formData = new FormData();
    formData.append("file", new Blob(["audio bytes"], { type: "audio/webm" }), "recording.webm");

    const response = await handleTranscriptionRequest(createRequest("rejected-key-request", formData), "test-key");

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error:
        "Groq rejected GROQ_API_KEY. Create a valid key in the Groq Console, replace the value in .env, and restart the dev server. Never share the key in chat.",
    });
  });
});
