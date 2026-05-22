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

export interface TranslationContext {
  src: string;
  tgt: string;
}

export interface TranslateParams {
  text: string;
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
  /** Last N translated pairs — gives OpenAI conversational coherence. */
  context?: ReadonlyArray<TranslationContext>;
}

/**
 * Translates text using the free, unofficial Google Translate endpoint.
 * No API key required. Returns the translated string.
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

  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Google Translate error: HTTP ${res.status}`);

  // Response: [[["translated","original",null,null,1],...],null,"ja"]
  const data = await res.json() as Array<unknown>;
  const segments = data[0] as Array<[string, ...unknown[]]>;
  return segments.map((s) => s[0]).join('').trim();
}


/**
 * Language-aware system prompt.
 * Japanese gets a prompt tuned for keigo and business vocabulary;
 * English gets a concise interpreter prompt;
 * other languages fall back to a generic prompt.
 */
function buildSystemPrompt(src: string, tgt: string): string {
  if (src === 'Japanese') {
    return (
      `You are a real-time interpreter for a Japanese business meeting. ` +
      `Translate each Japanese caption into natural ${tgt}. ` +
      `Render keigo (formal/polite speech) as natural formal expressions in ${tgt}. ` +
      `Preserve technical and business terms accurately. ` +
      `Output only the translation — no explanations, no notes.`
    );
  }
  if (src === 'English') {
    return (
      `You are a real-time meeting interpreter. ` +
      `Translate each English caption into natural spoken ${tgt}. ` +
      `Be concise and conversational. ` +
      `Output only the translation — no explanations.`
    );
  }
  return (
    `Translate the following ${src} meeting caption into natural ${tgt}. ` +
    `Keep the meaning concise and clear. Output only the ${tgt} translation.`
  );
}

/**
 * Build the messages array for the OpenAI chat API.
 * When recent context is available, it is prepended as a single user message
 * (no extra round-trips) so the model can maintain conversational coherence.
 */
function buildMessages(
  text: string,
  src: string,
  tgt: string,
  context: ReadonlyArray<TranslationContext>,
): Array<{ role: string; content: string }> {
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: buildSystemPrompt(src, tgt) },
  ];
  if (context.length > 0) {
    const ctx = context.map((c) => `• ${c.src} → ${c.tgt}`).join('\n');
    messages.push({
      role: 'user',
      content: `Recent conversation context (for coherence only, do NOT translate):\n${ctx}\n\nNow translate:\n${text}`,
    });
  } else {
    messages.push({ role: 'user', content: text });
  }
  return messages;
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
  const { text, apiKey, model, sourceLanguage, targetLanguage, context } = params;

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
      messages: buildMessages(text, sourceLanguage, targetLanguage, context ?? []),
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
