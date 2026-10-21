import { afterEach, describe, expect, it, vi } from "vitest";
import { translateCaption } from "@/lib/translate-caption";

describe("translateCaption", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns the original text when the selected languages match", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateCaption("Hello", "en-US", "en-GB")).resolves.toBe("Hello");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("translates all text segments returned by the service", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        [
          ["Bonjour", "Hello"],
          [" tout le monde", " everyone"],
        ],
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateCaption("Hello everyone", "en-US", "fr-FR")).resolves.toBe(
      "Bonjour tout le monde",
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("uses Hindi language codes for Hindi-to-English translation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [[["Hello", "नमस्ते"]]],
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(translateCaption("नमस्ते", "hi-IN", "en-US")).resolves.toBe("Hello");
    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.searchParams.get("sl")).toBe("hi");
    expect(requestUrl.searchParams.get("tl")).toBe("en");
  });

  it("reports a service failure instead of silently echoing the source text", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));

    await expect(translateCaption("Hello", "en-US", "fr-FR")).rejects.toThrow(
      "Translation service returned 503.",
    );
  });
});
