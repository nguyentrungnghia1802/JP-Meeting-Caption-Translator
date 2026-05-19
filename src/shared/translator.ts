export interface TranslateParams {
  text: string;
  apiKey: string;
  model: string;
  sourceLanguage: string;
  targetLanguage: string;
}

export async function translateText(params: TranslateParams): Promise<string> {
  const { text, apiKey, model, sourceLanguage, targetLanguage } = params;

  if (!apiKey) {
    throw new Error('API key is missing. Please configure it in Settings.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content: `Translate the following ${sourceLanguage} meeting caption into natural ${targetLanguage}. Keep the meaning concise and clear. Do not add explanations. Return only the ${targetLanguage} translation.`,
        },
        {
          role: 'user',
          content: text,
        },
      ],
      max_tokens: 256,
      temperature: 0.3,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({})) as { error?: { message?: string } };
    const message = errorData?.error?.message ?? `HTTP ${response.status}`;
    if (response.status === 429) {
      throw new Error('Rate limit exceeded. Please wait and try again.');
    }
    if (response.status === 401) {
      throw new Error('Invalid API key. Please check your Settings.');
    }
    throw new Error(`OpenAI API error: ${message}`);
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>;
  };

  const translated = data?.choices?.[0]?.message?.content?.trim();
  if (!translated) {
    throw new Error('Empty response from OpenAI.');
  }

  return translated;
}
