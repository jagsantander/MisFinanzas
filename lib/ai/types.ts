export type AiProvider = "openai" | "anthropic" | "gemini";

export type JsonSchema = Record<string, unknown>;

export type StructuredRequest = {
  system: string;
  user: string;
  schema: JsonSchema;
  schemaName: string;
  maxOutputTokens: number;
  timeoutMs?: number;
};

export type StructuredResult = {
  data: unknown;
  inputTokens: number | null;
  outputTokens: number | null;
};

export type ModelInfo = { id: string; label: string };

/** Errores clasificados para decidir: reintentar, pausar o pedir acción al usuario. */
export class AiError extends Error {
  constructor(
    message: string,
    public kind: "auth" | "quota" | "rate_limit" | "invalid_request" | "unavailable" | "timeout" | "bad_output",
    public status?: number,
  ) { super(message); }
  get retryable() { return this.kind === "rate_limit" || this.kind === "unavailable" || this.kind === "timeout"; }
}

export interface AiAdapter {
  provider: AiProvider;
  /** Lista modelos accesibles con la clave del usuario (prueba la conexión). */
  listModels(apiKey: string): Promise<ModelInfo[]>;
  structured(apiKey: string, model: string, req: StructuredRequest): Promise<StructuredResult>;
  /**
   * ¿Ofrece el proveedor una API oficial para crear tareas programadas en la cuenta del usuario?
   * Verificado en la documentación oficial (octubre 2026): ninguno de los tres lo ofrece con
   * claves de API. Por eso la automatización siempre corre en el servidor de MisFinanzas.
   */
  nativeScheduling: false;
}
