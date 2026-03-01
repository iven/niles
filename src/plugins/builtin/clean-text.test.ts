import { describe, expect, it } from "bun:test";
import type { FeedItem } from "../../types";
import plugin from "./clean-text";

function makeItem(title: string, description: string): FeedItem {
  return {
    title,
    link: "http://example.com",
    pubDate: "2024-01-01",
    description,
    guid: "guid-1",
    extra: {},
    level: "unknown",
    reason: "未分级",
  };
}

async function process(item: FeedItem): Promise<FeedItem> {
  const result = await plugin.processItems([item]);
  // biome-ignore lint/style/noNonNullAssertion: single item in, single item out
  return result[0]!;
}

describe("clean_text plugin", () => {
  it("should clean zero-width characters from title and description", async () => {
    const result = await process(
      makeItem(
        "\u200bTitle with zero-width space\u200b",
        "\u200bDescription with zero-width\u200b",
      ),
    );

    expect(result.title).toBe("Title with zero-width space");
    expect(result.description).toBe("Description with zero-width");
  });

  it("should trim leading and trailing whitespace", async () => {
    const result = await process(
      makeItem("   Title with spaces   ", "\n\nDescription with newlines\n\n"),
    );

    expect(result.title).toBe("Title with spaces");
    expect(result.description).toBe("Description with newlines");
  });

  it("should handle mixed zero-width and whitespace", async () => {
    const result = await process(
      makeItem("\u200b  \nTitle\n  \u200b", " \u200b Mixed \u200b  "),
    );

    expect(result.title).toBe("Title");
    expect(result.description).toBe("Mixed");
  });

  it("should preserve internal whitespace and zero-width", async () => {
    const result = await process(
      makeItem("Title with  spaces", "Description\u200bwith\u200bzero-width"),
    );

    expect(result.title).toBe("Title with  spaces");
    expect(result.description).toBe("Description\u200bwith\u200bzero-width");
  });

  it("should handle empty strings", async () => {
    const result = await process(makeItem("", ""));

    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("should handle only zero-width and whitespace", async () => {
    const result = await process(
      makeItem("\u200b\u200b  \n\n  ", "   \u200b\u200b   "),
    );

    expect(result.title).toBe("");
    expect(result.description).toBe("");
  });

  it("should preserve other fields unchanged", async () => {
    const item: FeedItem = {
      title: "\u200bTitle\u200b",
      link: "http://example.com/link",
      pubDate: "2024-01-01T00:00:00Z",
      description: "\u200bDescription\u200b",
      guid: "unique-guid-123",
      extra: { custom: "data", count: 42 },
      level: "unknown",
      reason: "未分级",
    };

    const result = await process(item);

    expect(result.link).toBe("http://example.com/link");
    expect(result.pubDate).toBe("2024-01-01T00:00:00Z");
    expect(result.guid).toBe("unique-guid-123");
    expect(result.extra).toEqual({ custom: "data", count: 42 });
  });

  it("should handle RSS data with invisible characters", async () => {
    const result = await process(
      makeItem(
        "\u200b\u200bBreaking: New AI Model Released\u200b\u200b   ",
        "  \u200bResearchers have announced a breakthrough in artificial intelligence...\u200b  ",
      ),
    );

    expect(result.title).toBe("Breaking: New AI Model Released");
    expect(result.description).toBe(
      "Researchers have announced a breakthrough in artificial intelligence...",
    );
  });
});
