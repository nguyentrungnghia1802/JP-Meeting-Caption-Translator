const OPENAI_ENDPOINT = 'https://api.openai.com/v1/chat/completions';
const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';

// Maps display language names → BCP-47 codes used by Google Translate
const LANG_CODES: Record<string, string> = {
  Japanese: 'ja',
  Vietnamese: 'vi',
  English: 'en',
  Chinese: 'zh-CN',
  'Chinese (Simplified)': 'zh-CN',
  Korean: 'ko',
};

export interface TranslateParams {
  text: string;
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
}

/**
 * Translates text using the free, unofficial Google Translate endpoint.
 * No API key required.  Retries once on transient network errors.
 */
export async function translateWithGoogle(
  text: string,
  sourceLanguage: string,
  targetLanguage: string,
  signal?: AbortSignal,
): Promise<string> {
  const sl = LANG_CODES[sourceLanguage] ?? 'ja';
  const tl = LANG_CODES[targetLanguage] ?? 'vi';
  const url = `${GOOGLE_ENDPOINT}?client=gtx&sl=${sl}&tl=${tl}&dt=t&q=${encodeURIComponent(text)}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { signal });
      if (!res.ok) throw new Error(`Google Translate error: HTTP ${res.status}`);

      // Response: [[["translated","original",null,null,1],...],null,"ja"]
      const data = await res.json() as Array<unknown>;
      const segments = data[0] as Array<[string, ...unknown[]]>;
      return segments.map((s) => s[0]).join('').trim();
    } catch (err) {
      // Never retry on user-initiated abort or HTTP errors (no point retrying 4xx/5xx)
      if (err instanceof Error && (err.name === 'AbortError' || /HTTP \d{3}/.test(err.message))) {
        throw err;
      }
      lastErr = err;
      // Brief pause before retry to let transient network issue clear
      await new Promise<void>(resolve => { setTimeout(resolve, 400); });
    }
  }
  throw lastErr;
}


// Pre-build the system prompt once per call to avoid repeated string interpolation
function buildSystemPrompt(src: string, tgt: string): string {
  return `Translate the following ${src} meeting caption into natural ${tgt}. Keep the meaning concise and clear. Do not add explanations. Return only the ${tgt} translation.`;
}

function handleHttpError(status: number, apiMessage: string): never {
  if (status === 429) throw new Error('Rate limit exceeded. Please wait and try again.');
  if (status === 401) throw new Error('Invalid API key. Please check your Settings.');
  throw new Error(`OpenAI API error: ${apiMessage || `HTTP ${status}`}`);
}

/**
 * Streams the translation token-by-token using OpenAI's SSE format.
 * `onChunk` is called after each token so the overlay can update progressively,
 * giving a much lower perceived latency than waiting for the full response.
 *
 * Pass an `AbortSignal` to cancel the request when a newer caption arrives.
 */
export async function translateTextStream(
  params: TranslateParams,
  onChunk: (partial: string) => void,
  signal?: AbortSignal,
): Promise<string> {
  const { text, apiKey, model, sourceLanguage, targetLanguage } = params;

  if (!apiKey) throw new Error('API key is missing. Please configure it in Settings.');

  const response = await fetch(OPENAI_ENDPOINT, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [
        { role: 'system', content: buildSystemPrompt(sourceLanguage, targetLanguage) },
        { role: 'user', content: text },
      ],
      max_tokens: 256,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({})) as { error?: { message?: string } };
    handleHttpError(response.status, errBody?.error?.message ?? '');
  }

  if (!response.body) throw new Error('No response body from OpenAI.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let partial = '';
  // Buffer for SSE lines that may be split across chunks
  let lineBuffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      lineBuffer += decoder.decode(value, { stream: true });

      // Split on newlines; the last element may be an incomplete line
      const lines = lineBuffer.split('\n');
      lineBuffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;

        try {
          const parsed = JSON.parse(data) as {
            choices: Array<{ delta: { content?: string }; finish_reason: string | null }>;
          };
          const delta = parsed.choices[0]?.delta?.content ?? '';
          if (delta) {
            partial += delta;
            onChunk(partial);
          }
        } catch {
          // Malformed SSE chunk – skip silently
        }
      }
    }
  } finally {
    reader.releaseLock();
  }

  return partial.trim();
}
