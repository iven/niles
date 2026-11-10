/**
 * LLM client 初始化和流式响应处理
 */

import type { chat } from "@tanstack/ai";
import type { AnthropicChatModel } from "@tanstack/ai-anthropic";
import { createAnthropicChat } from "@tanstack/ai-anthropic";
import type { GeminiTextModel } from "@tanstack/ai-gemini";
import { createGeminiChat } from "@tanstack/ai-gemini";
import type { GrokChatModel } from "@tanstack/ai-grok";
import { createGrokText } from "@tanstack/ai-grok";
import type { OpenAIChatModel } from "@tanstack/ai-openai";
import { createOpenaiChat } from "@tanstack/ai-openai";
import { createOpenRouterText } from "@tanstack/ai-openrouter";
import type { ConsolaInstance } from "consola";
import packageJson from "../../package.json";
import type { LlmConfig } from "./config";
import { logger as rootLogger } from "./logger";

// @tanstack/ai-openrouter 没有导出 OpenRouterTextModels 类型，从函数参数提取
type OpenRouterModel = Parameters<typeof createOpenRouterText>[0];

export type TextAdapter = ReturnType<
  | typeof createAnthropicChat
  | typeof createOpenaiChat
  | typeof createGeminiChat
  | typeof createOpenRouterText
  | typeof createGrokText
>;

/** 适配器客户端支持 defaultHeaders 的协议；其余协议不能声明请求头 */
const HEADER_CAPABLE_PROTOCOLS = ["anthropic", "openai", "grok"] as const;
type HeaderCapableProtocol = (typeof HEADER_CAPABLE_PROTOCOLS)[number];
type Protocol = HeaderCapableProtocol | "gemini" | "openrouter";

interface ProviderDefinitionBase {
  /** 提供 API key 的环境变量名 */
  apiKeyEnv: string;
  /** provider 的默认端点，config.baseUrl 优先 */
  defaultBaseUrl?: string;
}

interface HeaderCapableProviderDefinition extends ProviderDefinitionBase {
  protocol: HeaderCapableProtocol;
  /** 原样附加到每次请求的静态请求头 */
  staticHeaders?: Record<string, string>;
  /** 需要每会话唯一值的请求头名，值由调用方传入的 sessionId 填充 */
  sessionHeader?: string;
}

interface PlainProviderDefinition extends ProviderDefinitionBase {
  protocol: Exclude<Protocol, HeaderCapableProtocol>;
}

type ProviderDefinition =
  | HeaderCapableProviderDefinition
  | PlainProviderDefinition;

/** 只有适配器客户端支持 defaultHeaders 的协议才能声明请求头 */
function isHeaderCapable(
  definition: ProviderDefinition,
): definition is HeaderCapableProviderDefinition {
  return (HEADER_CAPABLE_PROTOCOLS as readonly string[]).includes(
    definition.protocol,
  );
}

const PROVIDERS: Record<LlmConfig["provider"], ProviderDefinition> = {
  anthropic: { protocol: "anthropic", apiKeyEnv: "ANTHROPIC_API_KEY" },
  openai: { protocol: "openai", apiKeyEnv: "OPENAI_API_KEY" },
  gemini: { protocol: "gemini", apiKeyEnv: "GEMINI_API_KEY" },
  openrouter: { protocol: "openrouter", apiKeyEnv: "OPENROUTER_API_KEY" },
  grok: { protocol: "grok", apiKeyEnv: "GROK_API_KEY" },
  // OpenCode Go 订阅：OpenAI 兼容端点，Console 会把非原生 Responses 的模型翻译成 Responses 格式
  "opencode-go": {
    protocol: "openai",
    apiKeyEnv: "OPENCODE_API_KEY",
    defaultBaseUrl: "https://opencode.ai/inference/go/openai/v1",
    staticHeaders: { "User-Agent": `niles/${packageJson.version}` },
    sessionHeader: "x-opencode-session",
  },
} satisfies Record<LlmConfig["provider"], ProviderDefinition>;

type ResolvedProvider =
  | {
      protocol: HeaderCapableProtocol;
      apiKey: string;
      baseURL: string | undefined;
      defaultHeaders: Record<string, string> | undefined;
    }
  | {
      protocol: "gemini" | "openrouter";
      apiKey: string;
      baseURL: string | undefined;
      defaultHeaders: undefined;
    };

interface ResolveProviderOptions {
  env: Record<string, string | undefined>;
  /** 本次调用的会话标识，用于 OpenCode Go 的路由与提示缓存 */
  sessionId: string;
}

/**
 * 根据配置解析出适配器需要的接入参数，不读环境变量、不生成随机值，便于测试
 */
export function resolveProvider(
  config: Pick<LlmConfig, "provider" | "baseUrl">,
  options: ResolveProviderOptions,
): ResolvedProvider {
  const definition = PROVIDERS[config.provider];
  if (!definition) {
    throw new Error(`不支持的 LLM provider: ${config.provider}`);
  }
  const apiKey = options.env[definition.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`环境变量 ${definition.apiKeyEnv} 未设置`);
  }
  const baseURL = config.baseUrl ?? definition.defaultBaseUrl;

  if (!isHeaderCapable(definition)) {
    return {
      protocol: definition.protocol,
      apiKey,
      baseURL,
      defaultHeaders: undefined,
    };
  }

  const defaultHeaders: Record<string, string> = {
    ...definition.staticHeaders,
  };
  if (definition.sessionHeader) {
    defaultHeaders[definition.sessionHeader] = options.sessionId;
  }

  return {
    protocol: definition.protocol,
    apiKey,
    baseURL,
    defaultHeaders:
      Object.keys(defaultHeaders).length > 0 ? defaultHeaders : undefined,
  };
}

export function createLlmClient(config: LlmConfig, model: string): TextAdapter {
  const resolved = resolveProvider(config, {
    env: process.env,
    sessionId: crypto.randomUUID(),
  });
  const { apiKey, baseURL, defaultHeaders } = resolved;

  switch (resolved.protocol) {
    case "anthropic":
      return createAnthropicChat(model as AnthropicChatModel, apiKey, {
        ...(baseURL ? { baseURL } : {}),
        ...(defaultHeaders ? { defaultHeaders } : {}),
      });

    case "openai":
      return createOpenaiChat(model as OpenAIChatModel, apiKey, {
        ...(baseURL ? { baseURL } : {}),
        ...(defaultHeaders ? { defaultHeaders } : {}),
      });

    case "gemini":
      return createGeminiChat(
        model as GeminiTextModel,
        apiKey,
        baseURL ? { baseURL } : undefined,
      );

    case "openrouter":
      return createOpenRouterText(
        model as OpenRouterModel,
        apiKey,
        baseURL
          ? // @ts-expect-error - OpenRouter SDK 类型定义使用 serverURL,但实际支持 baseURL
            { baseURL }
          : undefined,
      );

    case "grok":
      return createGrokText(model as GrokChatModel, apiKey, {
        ...(baseURL ? { baseURL } : {}),
        ...(defaultHeaders ? { defaultHeaders } : {}),
      });
  }
}

type ChatStream = ReturnType<typeof chat>;

export class MaxTokensError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MaxTokensError";
  }
}

interface StreamHandlerOptions<T> {
  stream: ChatStream;
  getResult: () => T;
  logger?: ConsolaInstance;
}

interface TokenStats {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

interface StreamResult<T> {
  result: T;
  tokenStats: TokenStats;
}

/**
 * 处理流式响应，输出 AI 文本并返回工具调用结果和 Token 使用信息
 */
export async function handleStreamWithToolCall<T>(
  options: StreamHandlerOptions<T>,
): Promise<StreamResult<T>> {
  const { stream, getResult, logger = rootLogger } = options;

  let fullText = "";
  let textOutputted = false;
  let tokenStats: TokenStats = {
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
  };

  let maxTokensReached = false;

  for await (const chunk of stream) {
    if (chunk.type === "RUN_ERROR") {
      if (chunk.error.code === "max_tokens") {
        maxTokensReached = true;
      }
      logger.error("API 错误:", JSON.stringify(chunk.error, null, 2));
    }

    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      fullText += chunk.delta;
    }

    if (chunk.type === "TOOL_CALL_END") {
      // 第一次工具调用时输出 AI 的文本（strip 空白，用引用格式）
      if (!textOutputted && fullText.trim()) {
        for (const line of fullText.trim().split("\n")) {
          logger.log(`│ ${line}`);
        }
        textOutputted = true;
      }

      const result = chunk.result ? JSON.parse(chunk.result) : null;
      if (result?.success) {
        return { result: getResult(), tokenStats };
      }

      // 工具调用失败，AI 会根据错误信息重试
      if (result?.error) {
        logger.warn(`工具调用失败: ${result.error}，等待 AI 重试...`);
      }
    }

    // 收集 token 使用信息
    if ("usage" in chunk && chunk.usage) {
      tokenStats = {
        promptTokens: chunk.usage.promptTokens,
        completionTokens: chunk.usage.completionTokens,
        totalTokens: chunk.usage.totalTokens,
      };
    }
  }

  if (maxTokensReached) {
    throw new MaxTokensError(
      `AI 输出达到 max_tokens 上限，未成功调用工具，返回内容：${fullText.trim()}`,
    );
  }

  throw new Error(`AI 未成功调用工具，返回内容：${fullText.trim()}`);
}
