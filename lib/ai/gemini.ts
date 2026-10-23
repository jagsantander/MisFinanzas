import { aiFetch, parseJsonOutput } from "./http";
import { AiError, type AiAdapter } from "./types";

const BASE = "https://generativelanguage.googleapis.com/v1beta";

/** Gemini API (generateContent) con salida JSON según esquema. Clave en cabecera x-goog-api-key. */
export const geminiAdapter: AiAdapter = {
  provider: "gemini",
  nativeScheduling: false,
  async listModels(apiKey) {
    const body = (await aiFetch(`${BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": apiKey }, timeoutMs: 15_000 })) as {
      models: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    return body.models
      .filter((m) => m.supportedGenerationMethods?.includes("generateContent") && /gemini/.test(m.name) && !/(embedding|image|tts|audio|live)/.test(m.name))
      .map((m) => ({ id: m.name.replace(/^models\//, ""), label: m.displayName ?? m.name }));
  },
  async structured(apiKey, model, req) {
    const body = (await aiFetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      timeoutMs: req.timeoutMs,
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: "user", parts: [{ text: req.user }] }],
        generationConfig: { responseMimeType: "application/json", responseJsonSchema: req.schema, maxOutputTokens: req.maxOutputTokens },
      }),
    })) as {
      candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
      promptFeedback?: { blockReason?: string };
      usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number };
    };
    if (body.promptFeedback?.blockReason) throw new AiError("La IA bloqueó la solicitud", "bad_output");
    const cand = body.candidates?.[0];
    if (cand?.finishReason === "MAX_TOKENS") throw new AiError("Respuesta incompleta (límite de tokens)", "bad_output");
    const text = cand?.content?.parts?.map((p) => p.text ?? "").join("");
    const u = body.usageMetadata;
    return {
      data: parseJsonOutput(text),
      inputTokens: u?.promptTokenCount ?? null,
      outputTokens: u ? (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0) : null,
    };
  },
};
