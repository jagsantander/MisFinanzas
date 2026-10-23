import { aiFetch, parseJsonOutput } from "./http";
import { AiError, type AiAdapter } from "./types";

const BASE = "https://api.anthropic.com/v1";
const headers = (apiKey: string) => ({ "x-api-key": apiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" });

/** Anthropic Messages API con structured outputs (output_config.format json_schema). */
export const anthropicAdapter: AiAdapter = {
  provider: "anthropic",
  nativeScheduling: false,
  async listModels(apiKey) {
    const body = (await aiFetch(`${BASE}/models?limit=100`, { headers: headers(apiKey), timeoutMs: 15_000 })) as { data: { id: string; display_name?: string }[] };
    return body.data.map((m) => ({ id: m.id, label: m.display_name ?? m.id }));
  },
  async structured(apiKey, model, req) {
    const body = (await aiFetch(`${BASE}/messages`, {
      method: "POST",
      timeoutMs: req.timeoutMs,
      headers: headers(apiKey),
      body: JSON.stringify({
        model,
        max_tokens: req.maxOutputTokens,
        system: req.system,
        messages: [{ role: "user", content: req.user }],
        output_config: { format: { type: "json_schema", schema: req.schema } },
      }),
    })) as { stop_reason?: string; content?: { type: string; text?: string }[]; usage?: { input_tokens?: number; output_tokens?: number } };
    if (body.stop_reason === "refusal") throw new AiError("La IA rechazó la solicitud", "bad_output");
    if (body.stop_reason === "max_tokens") throw new AiError("Respuesta incompleta (límite de tokens)", "bad_output");
    const text = body.content?.find((c) => c.type === "text")?.text;
    return { data: parseJsonOutput(text), inputTokens: body.usage?.input_tokens ?? null, outputTokens: body.usage?.output_tokens ?? null };
  },
};
