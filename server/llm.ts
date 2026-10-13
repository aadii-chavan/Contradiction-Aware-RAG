export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

export function llmConfigFromEnv(env: Record<string, string>): LlmConfig {
  return {
    baseUrl: (env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
    apiKey: env.LLM_API_KEY || '',
    model: env.LLM_MODEL || '',
  };
}

export function assertConfigured(cfg: LlmConfig): void {
  if (!cfg.model) throw new Error('LLM_MODEL is not set. Copy .env.example to .env and fill it in, then restart the dev server.');
  if (!cfg.apiKey && cfg.baseUrl.includes('api.openai.com')) {
    throw new Error('LLM_API_KEY is not set. Copy .env.example to .env and fill it in, then restart the dev server.');
  }
}

/** Calls any OpenAI-compatible /chat/completions endpoint (OpenAI, OpenRouter, Groq, Ollama, vLLM, ...). */
export async function chat(cfg: LlmConfig, system: string, user: string): Promise<string> {
  assertConfigured(cfg);
  const res = await fetch(`${cfg.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: cfg.model,
      temperature: 0,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    throw new Error(`LLM request failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('LLM returned an empty response.');
  return content.trim();
}
