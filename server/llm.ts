export interface LlmConfig {
  apiKey: string;
  model: string;
}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models';

export function llmConfigFromEnv(env: Record<string, string>): LlmConfig {
  return {
    apiKey: env.GEMINI_API_KEY || '',
    model: env.GEMINI_MODEL || 'gemini-2.5-flash',
  };
}

export const isConfigured = (cfg: LlmConfig) => Boolean(cfg.apiKey);

export function assertConfigured(cfg: LlmConfig): void {
  if (!isConfigured(cfg)) {
    throw new Error('GEMINI_API_KEY is not set. Add it to .env and restart the dev server.');
  }
}

interface ChatOptions {
  /** Ask Gemini for a JSON-only response. */
  json?: boolean;
}

/** Calls the Gemini generateContent API. */
export async function chat(cfg: LlmConfig, system: string, user: string, opts: ChatOptions = {}): Promise<string> {
  assertConfigured(cfg);
  const res = await fetch(`${ENDPOINT}/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0,
        // Skip 2.5 Flash's reasoning pass so latency reflects the prompt, not thinking time.
        thinkingConfig: { thinkingBudget: 0 },
        ...(opts.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`Gemini request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim();
  if (!text) {
    const reason = data.promptFeedback?.blockReason ?? data.candidates?.[0]?.finishReason ?? 'unknown';
    throw new Error(`Gemini returned no text (${reason}).`);
  }
  return text;
}
