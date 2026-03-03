import { describe, expect, it } from "bun:test";
import { logger } from "../../lib/logger";
import type { PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";
import plugin from "./index";

const testContext = {
  sourceName: "test",
  sourceContext: undefined,
  isDryRun: false,
  llm: () => {
    throw new Error("llm not available in test");
  },
  logger,
} as unknown as PluginContext;

function createItem(description: string): FeedItem {
  return {
    title: "Test",
    link: "http://example.com",
    pubDate: "2024-02-24",
    description,
    guid: "test-guid",
    extra: {},
    level: "unknown",
    reason: "未分级",
  };
}

async function processOne(item: FeedItem): Promise<FeedItem> {
  const result = await plugin.processItems([item], {}, testContext);
  // biome-ignore lint/style/noNonNullAssertion: single item in, single item out
  return result[0]!;
}

describe("zaihuapd_clean_description plugin", () => {
  it("should remove emoji from title", async () => {
    const item = { ...createItem("<p>内容</p>"), title: "🎗 标题内容" };
    const result = await processOne(item);
    expect(result.title).toBe("标题内容");
  });

  it("should remove emoji with variation selector from title", async () => {
    const item = { ...createItem("<p>内容</p>"), title: "🎗️ 标题内容" };
    const result = await processOne(item);
    expect(result.title).toBe("标题内容");
  });

  it("should remove multiple emojis and spaces from title", async () => {
    const item = { ...createItem("<p>内容</p>"), title: "🎗📮  标题内容" };
    const result = await processOne(item);
    expect(result.title).toBe("标题内容");
  });

  it("should preserve numbers at start of title", async () => {
    const item = { ...createItem("<p>内容</p>"), title: "123 标题内容" };
    const result = await processOne(item);
    expect(result.title).toBe("123 标题内容");
  });

  it("should remove clover emoji and zaihuanews link from real structure", async () => {
    const html = `<p>正文内容<br><br><a href="https://example.com">来源</a><br><br><span class="emoji">🍀</span><a href="http://t.me/zaihuanews" target="_blank" rel="noopener" onclick="return confirm('Open this link?\\n\\n'+this.href);">在花频道</a>  <span class="emoji">🍵</span><a href="http://t.me/zaihuachat" target="_blank" rel="noopener" onclick="return confirm('Open this link?\\n\\n'+this.href);">茶馆聊天</a>  <span class="emoji">📮</span><a href="http://t.me/ZaiHuabot" target="_blank" rel="noopener" onclick="return confirm('Open this link?\\n\\n'+this.href);">投稿</a></p>`;
    const result = await processOne(createItem(html));

    expect(result.description).toContain("正文内容");
    expect(result.description).toContain("来源");
    expect(result.description).not.toContain("🍀");
    expect(result.description).not.toContain("t.me/zaihuanews");
    expect(result.description).not.toContain("茶馆聊天");
    expect(result.description).not.toContain("投稿");
  });

  it("should remove trailing image tag", async () => {
    const html = `<p>正文内容<br><br><span class="emoji">🍀</span><a href="http://t.me/zaihuanews">在花频道</a></p><img src="https://cdn.example.com/image.jpg" width="465" height="620">`;
    const result = await processOne(createItem(html));

    expect(result.description).toContain("正文内容");
    expect(result.description).not.toContain("🍀");
    expect(result.description).not.toContain("<img");
  });

  it("should handle content without zaihuanews link", async () => {
    const html = `<p>正文内容<br><br><a href="https://example.com">来源</a></p>`;
    const result = await processOne(createItem(html));

    expect(result.description).toContain("正文内容");
    expect(result.description).toContain("来源");
  });

  it("should only extract P and DIV nodes", async () => {
    const html = `<p>段落1</p><div>div内容</div><span>应该被忽略</span><p>段落2</p>`;
    const result = await processOne(createItem(html));

    expect(result.description).toContain("段落1");
    expect(result.description).toContain("div内容");
    expect(result.description).toContain("段落2");
    expect(result.description).not.toContain("应该被忽略");
  });

  it("should handle empty description", async () => {
    const result = await processOne(createItem(""));
    expect(result.description).toBe("");
  });

  it("should preserve other fields", async () => {
    const item: FeedItem = {
      ...createItem("<p>内容</p>"),
      title: "测试标题",
      link: "https://example.com/article",
      guid: "article-123",
    };
    const result = await processOne(item);

    expect(result.title).toBe("测试标题");
    expect(result.link).toBe("https://example.com/article");
    expect(result.guid).toBe("article-123");
  });
});
