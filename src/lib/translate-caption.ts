export async function translateCaption(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  signal?: AbortSignal,
) {
  const source = sourceLanguage.split("-")[0] ?? sourceLanguage;
  const target = targetLanguage.split("-")[0] ?? targetLanguage;
  if (source === target) return text;

  const query = new URLSearchParams({
    client: "gtx",
    sl: source,
    tl: target,
    dt: "t",
    q: text,
  });
  const requestOptions: RequestInit = signal ? { signal } : {};
  const response = await fetch(
    `https://translate.googleapis.com/translate_a/single?${query}`,
    requestOptions,
  );
  if (!response.ok) {
    throw new Error(`Translation service returned ${response.status}.`);
  }

  const payload: unknown = await response.json();
  if (!Array.isArray(payload) || !Array.isArray(payload[0])) {
    throw new Error("Translation service returned an invalid response.");
  }

  const translation = payload[0]
    .filter(
      (segment): segment is [string] => Array.isArray(segment) && typeof segment[0] === "string",
    )
    .map(([segment]) => segment)
    .join("");
  if (!translation) {
    throw new Error("Translation service returned no translated text.");
  }

  return translation;
}
