import { aiFetch, parseJsonOutput } from "./http";
import { AiError, type AiAdapter } from "./types";

const BASE = "https://api.openai.com/v1";

/** OpenAI Responses API con Structured Outputs (text.format json_schema, strict). */
export const openaiAdapter: AiAdapter = {
  provider: "openai",
  nativeScheduling: false,
  async listModels(apiKey) {
    const body = (await aiFetch(`${BASE}/models`, { headers: { Authorization: `Bearer ${apiKey}` }, timeoutMs: 15_000 })) as { data: { id: string }[] };
    return body.data
      .map((m) => m.id)
      .filter((id) => /^(gpt-|o\d)/.test(id) && !/(audio|realtime|transcribe|tts|image|search|embedding|instruct|codex)/.test(id))
      .sort()
      .reverse()
      .map((id) => ({ id, label: id }));
  },
  async structured(apiKey, model, req) {
    const body = (await aiFetch(`${BASE}/responses`, {
      method: "POST",
      timeoutMs: req.timeoutMs,
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        store: false,
        max_output_tokens: req.maxOutputTokens,
        input: [
          { role: "system", content: req.system },
          { role: "user", content: req.user },
        ],
        text: { format: { type: "json_schema", name: req.schemaName, schema: req.schema, strict: true } },
      }),
    })) as {
      status?: string;
      output?: { type: string; content?: { type: string; text?: string; refusal?: string }[] }[];
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const content = body.output?.find((o) => o.type === "message")?.content ?? [];
    const refusal = content.find((c) => c.type === "refusal");
    if (refusal) throw new AiError("La IA rechazó la solicitud", "bad_output");
    if (body.status === "incomplete") throw new AiError("Respuesta incompleta (límite de tokens)", "bad_output");
    const text = content.find((c) => c.type === "output_text")?.text;
    return { data: parseJsonOutput(text), inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null };
  },
};
