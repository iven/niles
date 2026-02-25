import { describe, expect, it } from "bun:test";
import type { UngradedRssItem } from "../types";
import { applyPlugins } from "./plugin";

function createTestItem(title: string): UngradedRssItem {
  return {
    title,
    link: "https://example.com",
    pubDate: "2024-01-01",
    description: "Test description",
    guid: "test-guid",
    extra: {},
    graded: false,
  };
}

describe("plugin loader", () => {
  it("should load builtin plugins with file path format", async () => {
    const items = [createTestItem("\u200b  Test  \u200b")];
    const result = await applyPlugins(items, ["builtin/clean-text"]);

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
    const result = await applyPlugins(items, ["hacker-news"]);

    expect(result).toHaveLength(2);
    expect(result[1]?.extra.comments).toBeDefined();
  });

  it("should load multiple plugins in sequence", async () => {
    const items = [createTestItem("\u200b  Test  \u200b")];
    const result = await applyPlugins(items, [
      "builtin/clean-text",
      "builtin/fetch-meta",
    ]);

    expect(result[0]?.title).toBe("Test");
    expect(result).toHaveLength(1);
  });

  it("should throw error for non-existent plugin", async () => {
    const items = [createTestItem("Test")];

    await expect(applyPlugins(items, ["non-existent-plugin"])).rejects.toThrow(
      "无法加载插件",
    );
  });

  it("should handle empty plugin list", async () => {
    const items = [createTestItem("Test")];
    const result = await applyPlugins(items, []);

    expect(result).toEqual(items);
  });
});
