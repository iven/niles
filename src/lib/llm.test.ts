import { describe, expect, it } from "bun:test";
import { createLlmClient } from "./llm";

describe("LLM Client", () => {
  it("should throw error when API key is missing", () => {
    const config = {
      provider: "anthropic" as const,
      models: {
        fast: "claude-haiku-4-5",
        balanced: "claude-sonnet-4-5",
        powerful: "claude-opus-4-5",
      },
    };

    // 保存原始环境变量
    const originalKey = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    expect(() => createLlmClient(config, config.models.fast)).toThrow(
      "环境变量 ANTHROPIC_API_KEY 未设置",
    );

    // 恢复环境变量
    if (originalKey) {
      process.env.ANTHROPIC_API_KEY = originalKey;
    }
  });

  it("should throw error for unsupported provider", () => {
    const config = {
      provider: "unsupported",
      models: {
        fast: "model-name",
        balanced: "model-name",
        powerful: "model-name",
      },
      // biome-ignore lint/suspicious/noExplicitAny: Testing unsupported provider value
    } as any;

    expect(() => createLlmClient(config, "model-name")).toThrow(
      "不支持的 LLM provider",
    );
  });
});
