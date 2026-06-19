// LLM client abstraction for the usm enrich subcommand
// Supports LiteLLM, OpenAI, Anthropic, and Ollama via native fetch

import type { EnrichmentConfig } from "./types.js";

/**
 * LLM client interface — abstracted so providers can be swapped.
 */
export interface LlmClient {
  complete(
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
  ): Promise<LlmResponse>;
}

/**
 * Response from the LLM client.
 */
export interface LlmResponse {
  /** The text content of the completion */
  content: string;
  /** Token usage information (if available) */
  tokensUsed?: number;
  /** Duration of the call in ms */
  durationMs: number;
}

/**
 * Create an LLM client based on the enrichment configuration.
 */
export function createLlmClient(config: EnrichmentConfig): LlmClient {
  switch (config.provider) {
    case "litellm":
      return new OpenAiCompatibleClient(config.url, config.model, config.apiKey);
    case "openai":
      return new OpenAiCompatibleClient(config.url || "https://api.openai.com", config.model, config.apiKey);
    case "anthropic":
      return new AnthropicClient(config.url || "https://api.anthropic.com", config.model, config.apiKey);
    case "ollama":
      return new OpenAiCompatibleClient(config.url || "http://localhost:11434", config.model);
    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}

/**
 * OpenAI-compatible client — works for LiteLLM, OpenAI, and Ollama.
 * All use the /v1/chat/completions endpoint format.
 */
class OpenAiCompatibleClient implements LlmClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string;

  constructor(baseUrl: string, defaultModel: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.apiKey = apiKey;
  }

  async complete(
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
  ): Promise<LlmResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4000;

    const url = `${this.baseUrl}/v1/chat/completions`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    const messages: Array<{ role: string; content: string }> = [];
    if (options?.systemPrompt) {
      messages.push({ role: "system", content: options.systemPrompt });
    }
    messages.push({ role: "user", content: prompt });

    const body = {
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `LLM API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
      usage?: { total_tokens?: number };
    };

    const content = data.choices?.[0]?.message?.content || "";
    const tokensUsed = data.usage?.total_tokens;

    return {
      content,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Anthropic client — uses the /v1/messages endpoint with a different format.
 */
class AnthropicClient implements LlmClient {
  private baseUrl: string;
  private apiKey: string | undefined;
  private defaultModel: string;

  constructor(baseUrl: string, defaultModel: string, apiKey?: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.defaultModel = defaultModel;
    this.apiKey = apiKey;
  }

  async complete(
    prompt: string,
    options?: { model?: string; temperature?: number; maxTokens?: number; systemPrompt?: string }
  ): Promise<LlmResponse> {
    const startTime = Date.now();
    const model = options?.model || this.defaultModel;
    const temperature = options?.temperature ?? 0.3;
    const maxTokens = options?.maxTokens ?? 4000;

    const url = `${this.baseUrl}/v1/messages`;

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "anthropic-version": "2023-06-01",
    };

    if (this.apiKey) {
      headers["x-api-key"] = this.apiKey;
    }

    const body: Record<string, unknown> = {
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: "user", content: prompt }],
    };

    // Anthropic uses a top-level "system" field for system prompts
    if (options?.systemPrompt) {
      body.system = options.systemPrompt;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(
        `Anthropic API error (${response.status}): ${errorText}`
      );
    }

    const data = await response.json() as {
      content?: Array<{ type?: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };

    // Anthropic returns content as an array of blocks
    const content = data.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text || "")
      .join("\n") || "";

    const tokensUsed = (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0);

    return {
      content,
      tokensUsed,
      durationMs: Date.now() - startTime,
    };
  }
}
