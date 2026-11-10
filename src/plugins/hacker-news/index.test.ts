import { beforeEach, describe, expect, it, mock } from "bun:test";
import { logger } from "../../lib/logger";
import type { PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

const HN_ITEM_GUID = "https://news.ycombinator.com/item?id=123";
const HN_ITEM_URL = "https://hn.algolia.com/api/v1/items/123";

/** 每个用例自己登记的响应；未登记的 URL 直接抛错，避免 mock 失效时静默通过 */
const responses = new Map<string, () => string | object>();
const calls: string[] = [];

mock.module("../../lib/http", () => ({
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

const { default: plugin } = await import("./index");

beforeEach(() => {
  responses.clear();
  calls.length = 0;
});

function createItem(overrides: Partial<FeedItem> = {}): FeedItem {
  return {
    title: "Test",
    link: "https://example.com",
    pubDate: "2024-01-01",
    description: "",
    guid: "test-guid",
    extra: {},
    level: "unknown",
    reason: "未分级",
    ...overrides,
  };
}

function createContext(): PluginContext {
  return {
    sourceName: "hacker-news",
    sourceContext: undefined,
    isDryRun: false,
    now: new Date("2026-01-01T00:00:00Z"),
    llm: () => {
      throw new Error("processItems 不应调用 LLM");
    },
    logger,
  };
}

/** 把评论压成 `文本@深度`，方便断言完整顺序 */
function summarize(items: FeedItem[]): string[] {
  const comments = items[0]?.extra.comments;
  if (!Array.isArray(comments)) throw new Error("extra.comments 不是数组");
  return (comments as Array<{ text: string; depth: number }>).map(
    (comment) => `${comment.text}@${comment.depth}`,
  );
}

describe("hacker-news processItems", () => {
  it("按 HN 契约提取评论：顶层 10 条、每层 2 条、深度到 2", async () => {
    responses.set(HN_ITEM_URL, () => ({
      children: [
        {
          author: "a0",
          text: "top-0",
          points: 5,
          children: [
            { author: "b0", text: "reply-0-0" },
            { author: "b1", text: "reply-0-1" },
            { author: "b2", text: "reply-0-2" },
          ],
        },
        {
          author: "a1",
          text: "top-1",
          children: [
            {
              author: "c0",
              text: "reply-1-0",
              children: [
                {
                  author: "d0",
                  text: "deep-2",
                  children: [{ author: "e0", text: "deep-3" }],
                },
                { author: "d1", text: "deep-2b" },
                { author: "d2", text: "deep-2c" },
              ],
            },
          ],
        },
        ...Array.from({ length: 10 }, (_, index) => ({
          author: `a${index + 2}`,
          text: `top-${index + 2}`,
        })),
      ],
    }));

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([HN_ITEM_URL]);
    expect(summarize(result)).toEqual([
      "top-0@0",
      "reply-0-0@1",
      "reply-0-1@1",
      "top-1@0",
      "reply-1-0@1",
      "deep-2@2",
      "deep-2b@2",
      "top-2@0",
      "top-3@0",
      "top-4@0",
      "top-5@0",
      "top-6@0",
      "top-7@0",
      "top-8@0",
      "top-9@0",
    ]);
  });

  it("无正文的子节点不占名额", async () => {
    responses.set(HN_ITEM_URL, () => ({
      children: [
        ...Array.from({ length: 5 }, (_, index) => ({
          author: `ghost-${index}`,
        })),
        ...Array.from({ length: 11 }, (_, index) => ({
          author: `a${index}`,
          text: `keep-${index}`,
        })),
      ],
    }));

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    const texts = summarize(result);
    expect(texts).toHaveLength(10);
    expect(texts[0]).toBe("keep-0@0");
    expect(texts[9]).toBe("keep-9@0");
  });

  it("无正文的父节点不会丢掉它的子评论", async () => {
    responses.set(HN_ITEM_URL, () => ({
      children: [
        {
          author: "ghost",
          children: [{ author: "reply-author", text: "reply-under-ghost" }],
        },
      ],
    }));

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(summarize(result)).toEqual(["reply-under-ghost@1"]);
  });

  it("author 和 points 缺省时补空串与 0", async () => {
    responses.set(HN_ITEM_URL, () => ({
      children: [
        { text: "no-author" },
        { author: "null-points", text: "null-points", points: null },
        { author: "has-points", text: "has-points", points: 7 },
      ],
    }));

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(result[0]?.extra.comments).toEqual([
      { author: "", text: "no-author", points: 0, depth: 0 },
      { author: "null-points", text: "null-points", points: 0, depth: 0 },
      { author: "has-points", text: "has-points", points: 7, depth: 0 },
    ]);
  });

  it("rejected 条目直接短路，不发请求", async () => {
    const items = [createItem({ guid: HN_ITEM_GUID, level: "rejected" })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([]);
    expect(result[0]?.level).toBe("rejected");
    expect(result[0]?.extra.comments).toBeUndefined();
  });

  it("非 HN 条目原样返回", async () => {
    const items = [createItem({ guid: "https://example.com/post" })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([]);
    expect(result[0]?.extra.comments).toBeUndefined();
  });

  it("HN 链接缺少数字 id 时原样返回", async () => {
    const guid = "https://news.ycombinator.com/item?id=abc";
    const items = [createItem({ guid })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([]);
    expect(result[0]?.extra.comments).toBeUndefined();
  });

  it("API 响应格式错误时写入空数组", async () => {
    responses.set(HN_ITEM_URL, () => ({ children: "not-an-array" }));

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([HN_ITEM_URL]);
    expect(result[0]?.extra.comments).toEqual([]);
  });

  it("请求失败时写入空数组", async () => {
    responses.set(HN_ITEM_URL, () => {
      throw new Error("network down");
    });

    const items = [createItem({ guid: HN_ITEM_GUID })];
    const result = await plugin.processItems(items, {}, createContext());

    expect(calls).toEqual([HN_ITEM_URL]);
    expect(result[0]?.extra.comments).toEqual([]);
  });
});
