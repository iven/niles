import { describe, expect, it } from "bun:test";
import { parseConfig } from "./config";

describe("Config", () => {
  const validConfig = {
    llm: {
      provider: "openrouter",
      models: {
        grade: "stepfun/step-3.5-flash:free",
        summarize: "stepfun/step-3.5-flash:free",
      },
    },
    global: {
      high_interest: "AI,技术",
      interest: "编程",
      uninterested: "娱乐",
      avoid: "广告",
      preferred_language: "zh",
      timeout: 30,
    },
    sources: [
      {
        name: "source1",
        url: "https://example1.com/rss",
        summarize: false,
      },
      {
        name: "source2",
        url: "https://example2.com/rss",
        summarize: true,
      },
    ],
  };

  it("should parse valid config", () => {
    const config = parseConfig(validConfig);

    expect(config.llm.provider).toBe("openrouter");
    expect(config.llm.models.grade).toBe("stepfun/step-3.5-flash:free");
    expect(config.llm.models.summarize).toBe("stepfun/step-3.5-flash:free");
    expect(config.sources).toBeArrayOfSize(2);
  });

  it("should reject invalid provider", () => {
    const invalidConfig = {
      ...validConfig,
      llm: {
        provider: "invalid-provider",
        models: { grade: "model", summarize: "model" },
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

  it("should reject config with invalid field types", () => {
    const invalidTypeConfig = {
      ...validConfig,
      global: {
        ...validConfig.global,
        timeout: "not-a-number", // 应该是 number
      },
    };

    expect(() => parseConfig(invalidTypeConfig)).toThrow();
  });

  it("should accept optional source fields", () => {
    const configWithOptionals = {
      ...validConfig,
      sources: [
        {
          name: "source-with-optionals",
          url: "https://example.com/rss",
          title: "Custom Title",
          high_interest: "特定主题",
          plugins: ["plugin1", "plugin2"],
          summarize: true,
          timeout: 60,
        },
      ],
    };

    const config = parseConfig(configWithOptionals);
    const source = config.sources[0];
    expect(source).toBeDefined();
    expect(source?.title).toBe("Custom Title");
    expect(source?.high_interest).toBe("特定主题");
    expect(source?.plugins).toEqual(["plugin1", "plugin2"]);
  });
});
