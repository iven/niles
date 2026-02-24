import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";

const TEST_DIR = "/tmp/niles-integration-test";
const TEST_CONFIG_PATH = `${TEST_DIR}/config.json`;
const TEST_RSS_PATH = `${TEST_DIR}/test.xml`;

describe("Niles Integration", () => {
  beforeAll(async () => {
    // 创建测试目录
    mkdirSync(TEST_DIR, { recursive: true });

    // 创建测试配置
    const testConfig = {
      ai: {
        provider: "anthropic",
        models: {
          grade: "claude-3-5-haiku-20241022",
          summarize: "claude-3-5-sonnet-20241022",
        },
      },
      global: {
        high_interest: "测试,AI",
        interest: "技术",
        uninterested: "娱乐",
        exclude: "广告",
        preferred_language: "zh",
        timeout: 5,
      },
      sources: [
        {
          name: "test-source",
          url: "https://test.com/rss",
          summarize: false,
        },
      ],
    };

    await Bun.write(TEST_CONFIG_PATH, JSON.stringify(testConfig, null, 2));

    // 创建空的 RSS 文件
    await Bun.write(
      TEST_RSS_PATH,
      `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Test RSS</title>
    <link>https://test.com</link>
    <description>Test</description>
  </channel>
</rss>`,
    );
  });

  afterAll(() => {
    // 清理测试目录
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("should validate config schema", async () => {
    const config = await Bun.file(TEST_CONFIG_PATH).json();
    expect(config.ai).toBeDefined();
    expect(config.ai.provider).toBe("anthropic");
    expect(config.global).toBeDefined();
    expect(config.sources).toBeArrayOfSize(1);
  });

  // 注意：实际的 AI 调用测试需要真实的 API key，这里只验证配置结构
  it("should have correct command structure", () => {
    // 验证 niles 命令存在
    const packageJson = require("../package.json");
    expect(packageJson.scripts.niles).toBeDefined();
  });
});
