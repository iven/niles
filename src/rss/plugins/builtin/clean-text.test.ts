import { describe, expect, it } from "bun:test";
import type { UngradedRssItem } from "../../../types";
import plugin from "./clean-text";

describe("clean_text plugin", () => {
  it("should clean zero-width characters from title and description", async () => {
    const item: UngradedRssItem = {
      title: "\u200bTitle with zero-width space\u200b",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: "\u200bDescription with zero-width\u200b",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("Title with zero-width space");
    expect(result.description).toBe("Description with zero-width");
  });

  it("should trim leading and trailing whitespace", async () => {
    const item: UngradedRssItem = {
      title: "   Title with spaces   ",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: "\n\nDescription with newlines\n\n",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("Title with spaces");
    expect(result.description).toBe("Description with newlines");
  });

  it("should handle mixed zero-width and whitespace", async () => {
    const item: UngradedRssItem = {
      title: "\u200b  \nTitle\n  \u200b",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: " \u200b Mixed \u200b  ",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("Title");
    expect(result.description).toBe("Mixed");
  });

  it("should preserve internal whitespace and zero-width", async () => {
    const item: UngradedRssItem = {
      title: "Title with  spaces",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: "Description\u200bwith\u200bzero-width",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("Title with  spaces");
    expect(result.description).toBe("Description\u200bwith\u200bzero-width");
  });

  it("should handle empty strings", async () => {
    const item: UngradedRssItem = {
      title: "",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: "",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("should handle only zero-width and whitespace", async () => {
    const item: UngradedRssItem = {
      title: "\u200b\u200b  \n\n  ",
      link: "http://example.com",
      pubDate: "2024-01-01",
      description: "   \u200b\u200b   ",
      guid: "guid-1",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("should preserve other fields unchanged", async () => {
    const item: UngradedRssItem = {
      title: "\u200bTitle\u200b",
      link: "http://example.com/link",
      pubDate: "2024-01-01T00:00:00Z",
      description: "\u200bDescription\u200b",
      guid: "unique-guid-123",
      extra: { custom: "data", count: 42 },
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.link).toBe("http://example.com/link");
    expect(result.pubDate).toBe("2024-01-01T00:00:00Z");
    expect(result.guid).toBe("unique-guid-123");
    expect(result.extra).toEqual({ custom: "data", count: 42 });
    expect(result.graded).toBe(false);
  });

  it("should handle RSS data with invisible characters", async () => {
    // RSS feed 包含隐藏的零宽字符
    const item: UngradedRssItem = {
      title: "\u200b\u200bBreaking: New AI Model Released\u200b\u200b   ",
      link: "https://news.example.com/ai-model",
      pubDate: "2024-02-24T10:30:00Z",
      description:
        "  \u200bResearchers have announced a breakthrough in artificial intelligence...\u200b  ",
      guid: "news-2024-02-24-ai",
      extra: {},
      graded: false,
    };

    const result = await plugin.processItem(item);

    expect(result.title).toBe("Breaking: New AI Model Released");
    expect(result.description).toBe(
      "Researchers have announced a breakthrough in artificial intelligence...",
    );
  });
});
