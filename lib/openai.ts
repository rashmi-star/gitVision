type OpenAIResponse = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
};

type AzureChatResponse = {
  choices?: Array<{
    message?: { content?: string };
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

function getAzureConfig() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT?.trim();
  const apiKey = process.env.AZURE_OPENAI_API_KEY?.trim();
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT?.trim();
  if (endpoint && apiKey && deployment) {
    return { endpoint, apiKey, deployment };
  }
  return null;
}

export function hasAIConfig(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim() || getAzureConfig());
}

async function generateWithAzure(
  deployment: string,
  apiKey: string,
  endpoint: string,
  prompt: string,
  maxOutputTokens = 1200,
) {
  const url = `${endpoint.replace(/\/$/, "")}/openai/deployments/${deployment}/chat/completions?api-version=2024-06-01`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxOutputTokens,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Azure OpenAI request failed (${deployment}): ${response.status} ${body}`);
  }

  const payload = (await response.json()) as AzureChatResponse;
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Azure OpenAI returned empty response");
  return text;
}

async function generateWithOpenAI(
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

async function generateOnce(
  apiKey: string,
  model: string,
  prompt: string,
  maxOutputTokens = 1200,
) {
  const azure = getAzureConfig();
  if (azure) {
    return generateWithAzure(azure.deployment, azure.apiKey, azure.endpoint, prompt, maxOutputTokens);
  }
  return generateWithOpenAI(apiKey, model, prompt, maxOutputTokens);
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
