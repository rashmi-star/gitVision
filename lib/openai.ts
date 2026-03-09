type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

function extractText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const parts: string[] = [];
  for (const block of payload.output ?? []) {
    for (const item of block.content ?? []) {
      if (typeof item.text === "string" && item.text.trim()) {
        parts.push(item.text.trim());
      }
    }
  }
  return parts.join("\n").trim();
}

async function generateOnce(
  apiKey: string,
  model: string,
  prompt: string,
  maxOutputTokens = 1200,
) {
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
      max_output_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI request failed (${model}): ${response.status} ${body}`);
  }

  const payload = (await response.json()) as OpenAIResponse;
  return extractText(payload);
}

export async function generateTextWithFallback(
  apiKey: string,
  models: string[],
  prompt: string,
  maxOutputTokens = 1200,
) {
  let lastError: unknown;
  for (const model of models) {
    try {
      return await generateOnce(apiKey, model, prompt, maxOutputTokens);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error("OpenAI request failed.");
}
