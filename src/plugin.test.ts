import { beforeEach, describe, expect, it, mock } from "bun:test";
import { applyProcessItems, loadPlugins } from "./plugin";
import { createTestContext, createTestItem } from "./test-fixtures";

const HN_ITEM_GUID = "https://news.ycombinator.com/item?id=123";
const HN_ITEM_URL = "https://hn.algolia.com/api/v1/items/123";
const META_PAGE_URL = "https://example.com";

/** 每个用例自己登记的响应；未登记的 URL 直接抛错，避免插件退回真实网络时静默通过 */
const responses = new Map<string, () => string | object>();
const calls: string[] = [];

mock.module("./lib/http", () => ({
  http: {
    get(url: string) {
      calls.push(url);
      const respond = responses.get(url);
      if (!respond) throw new Error(`测试未登记的请求: ${url}`);
      const body = respond();
      return {
        json: async () => body,
        text: async () => String(body),
      };
    },
  },
}));

beforeEach(() => {
  responses.clear();
  calls.length = 0;
});

describe("loadPlugins", () => {
  it("should load builtin plugins with file path format", async () => {
    const items = [createTestItem({ title: "\u200b  Test  \u200b" })];
    const [cleanText] = await loadPlugins(["builtin/clean-text"]);
    if (!cleanText) throw new Error("plugin not loaded");
    const result = await applyProcessItems(
      items,
      cleanText,
      createTestContext(),
    );

    expect(result[0]?.title).toBe("Test");
  });

  it("should load website plugins with directory format", async () => {
    responses.set(HN_ITEM_URL, () => ({
      children: [{ author: "alice", text: "<p>hello</p>", points: 3 }],
    }));

    const items = [
      createTestItem({ title: "Test" }),
      createTestItem({ title: "Test 2", guid: HN_ITEM_GUID }),
    ];
    const [hackerNews] = await loadPlugins(["hacker-news"]);
    if (!hackerNews) throw new Error("plugin not loaded");
    const result = await applyProcessItems(
      items,
      hackerNews,
      createTestContext(),
    );

    expect(calls).toEqual([HN_ITEM_URL]);
    expect(result).toHaveLength(2);
    expect(result[0]?.extra.comments).toBeUndefined();
    expect(result[1]?.extra.comments).toEqual([
      { author: "alice", text: "<p>hello</p>", points: 3, depth: 0 },
    ]);
  });

  it("should load multiple plugins in sequence", async () => {
    responses.set(
      META_PAGE_URL,
      () =>
        '<html><head><meta name="description" content="页面描述"></head></html>',
    );

    const items = [createTestItem({ title: "\u200b  Test  \u200b" })];
    const [cleanText, fetchMeta] = await loadPlugins([
      "builtin/clean-text",
      "builtin/fetch-meta",
    ]);
    if (!cleanText || !fetchMeta) throw new Error("plugins not loaded");
    const result = await applyProcessItems(
      await applyProcessItems(items, cleanText, createTestContext()),
      fetchMeta,
      createTestContext(),
    );

    expect(calls).toEqual([META_PAGE_URL]);
    expect(result[0]?.title).toBe("Test");
    expect(result[0]?.extra.meta).toBe("页面描述");
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
    const { items } = await cleanText.plugin.collect({}, createTestContext());
    expect(items).toHaveLength(0);
  });
});
