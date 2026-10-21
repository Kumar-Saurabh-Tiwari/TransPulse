const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const RATE_LIMIT_WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 20;
const requestsByClient = new Map<string, { count: number; resetsAt: number }>();

function jsonResponse(body: { error: string } | { text: string }, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function isRateLimited(clientId: string, now: number) {
  if (requestsByClient.size > 1_000) {
    for (const [id, entry] of requestsByClient) {
      if (entry.resetsAt <= now) requestsByClient.delete(id);
    }
  }
  const current = requestsByClient.get(clientId);
  if (!current || current.resetsAt <= now) {
    requestsByClient.set(clientId, { count: 1, resetsAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (current.count >= MAX_REQUESTS_PER_WINDOW) return true;
  current.count += 1;
  return false;
}

export async function handleTranscriptionRequest(
  request: Request,
  apiKey?: string,
  model = "whisper-large-v3-turbo",
) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Use POST to submit microphone audio." }, 405);
  }

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).origin !== new URL(request.url).origin) {
        return jsonResponse({ error: "Cross-origin transcription requests are not allowed." }, 403);
      }
    } catch {
      return jsonResponse({ error: "The request origin is invalid." }, 403);
    }
  }

  if (!apiKey) {
    return jsonResponse(
      { error: "Transcription is not configured. Set the server-side GROQ_API_KEY secret." },
      503,
    );
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_AUDIO_BYTES + 64 * 1024) {
    return jsonResponse({ error: "The audio clip is too large. Try a shorter recording." }, 413);
  }

  const clientId = request.headers.get("cf-connecting-ip") ?? "unknown-client";
  if (isRateLimited(clientId, Date.now())) {
    return jsonResponse({ error: "Too many transcription requests. Wait a minute and try again." }, 429);
  }

  let submitted: FormData;
  try {
    submitted = await request.formData();
  } catch {
    return jsonResponse({ error: "Send a valid multipart audio recording." }, 400);
  }

  const audio = submitted.get("file");
  if (!audio || typeof audio === "string") {
    return jsonResponse({ error: "No audio recording was included in the request." }, 400);
  }
  if (audio.size === 0) {
    return jsonResponse({ error: "The audio recording was empty. Check the microphone and try again." }, 400);
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonResponse({ error: "The audio clip is too large. Try a shorter recording." }, 413);
  }

  const providerForm = new FormData();
  providerForm.append("file", audio, audio.name || "recording.webm");
  providerForm.append("model", model);
  providerForm.append("response_format", "verbose_json");
  const languageHint = submitted.get("language");
  if (typeof languageHint === "string" && /^[a-z]{2,3}$/.test(languageHint)) {
    providerForm.append("language", languageHint);
  }

  let providerResponse: Response;
  try {
    providerResponse = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: providerForm,
    });
  } catch (error) {
    console.error("Could not reach the speech transcription provider.", error);
    return jsonResponse({ error: "Could not reach the transcription service. Check the server connection." }, 502);
  }

  if (!providerResponse.ok) {
    console.error("Speech transcription provider returned an error.", {
      status: providerResponse.status,
    });
    if (providerResponse.status === 401) {
      return jsonResponse(
        {
          error:
            "Groq rejected GROQ_API_KEY. Create a valid key in the Groq Console, replace the value in .env, and restart the dev server. Never share the key in chat.",
        },
        502,
      );
    }
    return jsonResponse(
      { error: `The transcription service returned an error (${providerResponse.status}).` },
      providerResponse.status === 429 ? 429 : 502,
    );
  }

  let payload: unknown;
  try {
    payload = await providerResponse.json();
  } catch (error) {
    console.error("Speech transcription provider returned invalid JSON.", error);
    return jsonResponse({ error: "The transcription service returned an invalid response." }, 502);
  }

  if (
    typeof payload !== "object" ||
    payload === null ||
    !("text" in payload) ||
    typeof payload.text !== "string"
  ) {
    return jsonResponse({ error: "The transcription service returned no transcript." }, 502);
  }

  const language =
    "language" in payload && typeof payload.language === "string"
      ? payload.language
      : null;
  return jsonResponse({ text: payload.text.trim(), language });
}
