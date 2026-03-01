import { describe, expect, it } from "bun:test";
import { parseConfig } from "./config";

describe("Config", () => {
  const validConfig = {
    llm: {
      provider: "openrouter",
      models: {
        fast: "stepfun/step-3.5-flash:free",
        balanced: "stepfun/step-3.5-flash:free",
        powerful: "stepfun/step-3.5-flash:free",
      },
    },
    sources: [
      {
        name: "source1",
        plugins: [
          {
            name: "builtin/collect-rss",
            options: { url: "https://example1.com/rss" },
          },
        ],
      },
      {
        name: "source2",
        plugins: [
          {
            name: "builtin/collect-rss",
            options: { url: "https://example2.com/rss" },
          },
        ],
      },
    ],
  };

  it("should parse valid config", () => {
    const config = parseConfig(validConfig);

    expect(config.llm.provider).toBe("openrouter");
    expect(config.llm.models.fast).toBe("stepfun/step-3.5-flash:free");
    expect(config.llm.models.balanced).toBe("stepfun/step-3.5-flash:free");
    expect(config.llm.models.powerful).toBe("stepfun/step-3.5-flash:free");
    expect(config.sources).toBeArrayOfSize(2);
  });

  it("should reject invalid provider", () => {
    const invalidConfig = {
      ...validConfig,
      llm: {
        provider: "invalid-provider",
        models: {
          fast: "model",
          balanced: "model",
          powerful: "model",
        },
      },
    };

    expect(() => parseConfig(invalidConfig)).toThrow();
  });

  it("should reject config with missing required fields", () => {
    const incompleteConfig = {
      ...validConfig,
      llm: {
        provider: "openrouter",
        // 缺少 models 字段
      },
    };

    expect(() => parseConfig(incompleteConfig)).toThrow();
  });

  it("should accept optional source fields", () => {
    const configWithOptionals = {
      ...validConfig,
      plugins: {
        "builtin/llm-grade": {
          global_high_interest: "AI",
        },
      },
      sources: [
        {
          name: "source-with-optionals",
          title: "Custom Title",
          plugins: [
            {
              name: "builtin/collect-rss",
              options: { url: "https://example.com/rss" },
            },
            "plugin2",
          ],
        },
      ],
    };

    const config = parseConfig(configWithOptionals);
    const source = config.sources[0];
    expect(source).toBeDefined();
    expect(source?.title).toBe("Custom Title");
    expect(source?.plugins).toHaveLength(2);
    expect(config.plugins["builtin/llm-grade"]?.global_high_interest).toBe(
      "AI",
    );
  });
});
