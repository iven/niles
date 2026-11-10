import { describe, expect, it, mock } from "bun:test";
import packageJson from "../../package.json";
import type { LlmConfig } from "./config";

interface AdapterCall {
  model: string;
  apiKey: string;
  options:
    | { baseURL?: string; defaultHeaders?: Record<string, string> }
    | undefined;
}

const openaiCalls: AdapterCall[] = [];

mock.module("@tanstack/ai-openai", () => ({
  createOpenaiChat: (
    model: string,
    apiKey: string,
    options: AdapterCall["options"],
  ) => {
    openaiCalls.push({ model, apiKey, options });
    return {} as never;
  },
}));

const { createLlmClient, resolveProvider } = await import("./llm");

const models = {
  fast: "model-name",
  balanced: "model-name",
  powerful: "model-name",
};

describe("resolveProvider", () => {
  it("should throw error when API key is missing", () => {
    expect(() =>
      resolveProvider(
        { provider: "anthropic" },
        { env: {}, sessionId: "session-1" },
      ),
    ).toThrow("环境变量 ANTHROPIC_API_KEY 未设置");
  });

  it("should throw error for unsupported provider", () => {
    const config = {
      provider: "unsupported",
      models,
    } as unknown as LlmConfig;

    expect(() =>
      resolveProvider(config, { env: {}, sessionId: "session-1" }),
    ).toThrow("不支持的 LLM provider");
  });

  it("should resolve opencode-go with default endpoint and session headers", () => {
    const resolved = resolveProvider(
      { provider: "opencode-go" },
      { env: { OPENCODE_API_KEY: "test-key" }, sessionId: "session-1" },
    );

    expect(resolved).toEqual({
      protocol: "openai",
      apiKey: "test-key",
      baseURL: "https://opencode.ai/inference/go/openai/v1",
      defaultHeaders: {
        "User-Agent": `niles/${packageJson.version}`,
        "x-opencode-session": "session-1",
      },
    });
  });

  it("should let config.baseUrl override the provider default", () => {
    const resolved = resolveProvider(
      {
        provider: "opencode-go",
        baseUrl: "http://localhost:8080/v1",
      },
      { env: { OPENCODE_API_KEY: "test-key" }, sessionId: "session-1" },
    );

    expect(resolved.baseURL).toBe("http://localhost:8080/v1");
  });

  it("should not set baseURL or headers for providers without defaults", () => {
    const resolved = resolveProvider(
      { provider: "anthropic" },
      { env: { ANTHROPIC_API_KEY: "test-key" }, sessionId: "session-1" },
    );

    expect(resolved.protocol).toBe("anthropic");
    expect(resolved.baseURL).toBeUndefined();
    expect(resolved.defaultHeaders).toBeUndefined();
  });
});

describe("createLlmClient", () => {
  it("should throw error when API key is missing", () => {
    const originalKey = process.env.OPENCODE_API_KEY;
    delete process.env.OPENCODE_API_KEY;

    try {
      expect(() =>
        createLlmClient({ provider: "opencode-go", models }, models.fast),
      ).toThrow("环境变量 OPENCODE_API_KEY 未设置");
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENCODE_API_KEY;
      } else {
        process.env.OPENCODE_API_KEY = originalKey;
      }
    }
  });

  it("should pass baseURL and headers to the OpenAI adapter", () => {
    const originalKey = process.env.OPENCODE_API_KEY;
    process.env.OPENCODE_API_KEY = "test-key";
    openaiCalls.length = 0;

    try {
      createLlmClient(
        { provider: "opencode-go", models },
        "deepseek-v4.1-flash",
      );
    } finally {
      if (originalKey === undefined) {
        delete process.env.OPENCODE_API_KEY;
      } else {
        process.env.OPENCODE_API_KEY = originalKey;
      }
    }

    expect(openaiCalls).toHaveLength(1);
    const [call] = openaiCalls;
    expect(call?.model).toBe("deepseek-v4.1-flash");
    expect(call?.apiKey).toBe("test-key");
    expect(call?.options?.baseURL).toBe(
      "https://opencode.ai/inference/go/openai/v1",
    );
    expect(call?.options?.defaultHeaders?.["User-Agent"]).toBe(
      `niles/${packageJson.version}`,
    );
    expect(call?.options?.defaultHeaders?.["x-opencode-session"]).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });
});
