/**
 * LLM client 初始化和流式响应处理
 */

import type { chat } from "@tanstack/ai";
import type { AnthropicChatModel } from "@tanstack/ai-anthropic";
import { anthropicText } from "@tanstack/ai-anthropic";
import type { GeminiTextModel } from "@tanstack/ai-gemini";
import { geminiText } from "@tanstack/ai-gemini";
import type { GrokChatModel } from "@tanstack/ai-grok";
import { grokText } from "@tanstack/ai-grok";
import type { OpenAIChatModel } from "@tanstack/ai-openai";
import { openaiText } from "@tanstack/ai-openai";
import { openRouterText } from "@tanstack/ai-openrouter";

// @tanstack/ai-openrouter 没有导出 OpenRouterTextModels 类型，从函数参数提取
type OpenRouterModel = Parameters<typeof openRouterText>[0];

import type { LlmConfig } from "./config";

type TextAdapter = ReturnType<
  | typeof anthropicText
  | typeof openaiText
  | typeof geminiText
  | typeof openRouterText
  | typeof grokText
>;

export function createLlmClient(config: LlmConfig, model: string): TextAdapter {
  const { provider, baseUrl } = config;

  switch (provider) {
    case "anthropic": {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        throw new Error("环境变量 ANTHROPIC_API_KEY 未设置");
      }
      return baseUrl
        ? anthropicText(model as AnthropicChatModel, { baseURL: baseUrl })
        : anthropicText(model as AnthropicChatModel);
    }

    case "openai": {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("环境变量 OPENAI_API_KEY 未设置");
      }
      return baseUrl
        ? openaiText(model as OpenAIChatModel, { baseURL: baseUrl })
        : openaiText(model as OpenAIChatModel);
    }

    case "gemini": {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("环境变量 GEMINI_API_KEY 未设置");
      }
      return baseUrl
        ? geminiText(model as GeminiTextModel, { baseURL: baseUrl })
        : geminiText(model as GeminiTextModel);
    }

    case "openrouter": {
      const apiKey = process.env.OPENROUTER_API_KEY;
      if (!apiKey) {
        throw new Error("环境变量 OPENROUTER_API_KEY 未设置");
      }
      return baseUrl
        ? // @ts-expect-error - OpenRouter SDK 类型定义使用 serverURL,但实际支持 baseURL
          openRouterText(model as OpenRouterModel, { baseURL: baseUrl })
        : openRouterText(model as OpenRouterModel);
    }

    case "grok": {
      const apiKey = process.env.GROK_API_KEY;
      if (!apiKey) {
        throw new Error("环境变量 GROK_API_KEY 未设置");
      }
      return baseUrl
        ? grokText(model as GrokChatModel, { baseURL: baseUrl })
        : grokText(model as GrokChatModel);
    }

    default:
      throw new Error(`不支持的 LLM provider: ${provider}`);
  }
}

type ChatStream = ReturnType<typeof chat>;

interface StreamHandlerOptions<T> {
  stream: ChatStream;
  getResult: () => T;
}

/**
 * 处理流式响应，输出 AI 文本并返回工具调用结果
 */
export async function handleStreamWithToolCall<T>(
  options: StreamHandlerOptions<T>,
): Promise<T> {
  const { stream, getResult } = options;

  let fullText = "";
  let textOutputted = false;

  for await (const chunk of stream) {
    if (chunk.type === "RUN_ERROR") {
      console.error("API 错误:", JSON.stringify(chunk.error, null, 2));
    }

    if (chunk.type === "TEXT_MESSAGE_CONTENT" && chunk.delta) {
      fullText += chunk.delta;
    }

    if (chunk.type === "TOOL_CALL_END") {
      // 第一次工具调用时输出 AI 的文本（strip 空白，用引用格式）
      if (!textOutputted && fullText.trim()) {
        console.log("");
        const lines = fullText.trim().split("\n");
        for (const line of lines) {
          console.log(`> ${line}`);
        }
        textOutputted = true;
      }

      const result = chunk.result ? JSON.parse(chunk.result) : null;
      if (result?.success) {
        console.log("");
        return getResult();
      }

      // 工具调用失败，AI 会根据错误信息重试
      if (result?.error) {
        console.error(`工具调用失败: ${result.error}，等待 AI 重试...`);
      }
    }

    // 记录 token 使用信息
    if ("usage" in chunk && chunk.usage) {
      console.log(
        `Token 使用: 输入 ${chunk.usage.promptTokens}, 输出 ${chunk.usage.completionTokens}, 总计 ${chunk.usage.totalTokens}`,
      );
    }
  }

  throw new Error("AI 未成功调用工具");
}
