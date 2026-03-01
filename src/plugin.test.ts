import { describe, expect, it } from "bun:test";
import { applyProcessItems, loadPlugins } from "./plugin";
import type { FeedItem } from "./types";

function createTestItem(title: string): FeedItem {
  return {
    title,
    link: "https://example.com",
    pubDate: "2024-01-01",
    description: "Test description",
    guid: "test-guid",
    extra: {},
    level: "unknown",
    reason: "未分级",
  };
}

const testContext = {
  sourceName: "test",
  sourceContext: undefined,
  isDryRun: false,
  llm: () => {
    throw new Error("llm not available in test");
  },
} as Parameters<typeof applyProcessItems>[2];

describe("loadPlugins", () => {
  it("should load builtin plugins with file path format", async () => {
    const items = [createTestItem("\u200b  Test  \u200b")];
    const [cleanText] = await loadPlugins(["builtin/clean-text"]);
    if (!cleanText) throw new Error("plugin not loaded");
    const result = await applyProcessItems(items, cleanText, testContext);

    expect(result[0]?.title).toBe("Test");
  });

  it("should load website plugins with directory format", async () => {
    const items = [
      createTestItem("Test"),
      {
        ...createTestItem("Test 2"),
        guid: "https://news.ycombinator.com/item?id=123",
      },
    ];
    const [hackerNews] = await loadPlugins(["hacker-news"]);
    if (!hackerNews) throw new Error("plugin not loaded");
    const result = await applyProcessItems(items, hackerNews, testContext);

    expect(result).toHaveLength(2);
    expect(result[1]?.extra.comments).toBeDefined();
  });

  it("should load multiple plugins in sequence", async () => {
    const items = [createTestItem("\u200b  Test  \u200b")];
    const [cleanText, fetchMeta] = await loadPlugins([
      "builtin/clean-text",
      "builtin/fetch-meta",
    ]);
    if (!cleanText || !fetchMeta) throw new Error("plugins not loaded");
    const result = await applyProcessItems(
      await applyProcessItems(items, cleanText, testContext),
      fetchMeta,
      testContext,
    );

    expect(result[0]?.title).toBe("Test");
    expect(result).toHaveLength(1);
  });

  it("should throw error for non-existent plugin", async () => {
    await expect(loadPlugins(["non-existent-plugin"])).rejects.toThrow(
      "无法加载插件",
    );
  });

  it("should return empty items from non-collector plugin", async () => {
    const [cleanText] = await loadPlugins(["builtin/clean-text"]);
    if (!cleanText) throw new Error("plugin not loaded");
    const { items } = await cleanText.plugin.collect({}, testContext);
    expect(items).toHaveLength(0);
  });
});
