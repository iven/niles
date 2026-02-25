import { describe, expect, it } from "bun:test";
import type { GradedRssItem } from "../types";
import { formatGradedItems } from "./writer";

describe("formatGradedItems", () => {
  it("should filter out rejected items", () => {
    const items: GradedRssItem[] = [
      {
        title: "Item 1",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Description 1",
        guid: "guid-1",
        extra: {},
        graded: true,
        level: "critical",
        reason: "Very interesting",
      },
      {
        title: "Item 2",
        link: "http://example.com/2",
        pubDate: "2024-01-02",
        description: "Description 2",
        guid: "guid-2",
        extra: {},
        graded: true,
        level: "rejected",
        reason: "Not interesting",
      },
    ];

    const result = formatGradedItems(items);

    expect(result).toBeArrayOfSize(1);
    expect(result[0]?.title).toBe("⭐⭐ Item 1");
  });

  it("should add double stars to critical items", () => {
    const items: GradedRssItem[] = [
      {
        title: "Critical Item",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Description",
        guid: "guid-1",
        extra: {},
        graded: true,
        level: "critical",
        reason: "Must read",
      },
    ];

    const result = formatGradedItems(items);

    expect(result[0]?.title).toBe("⭐⭐ Critical Item");
  });

  it("should add single star to recommended items", () => {
    const items: GradedRssItem[] = [
      {
        title: "Recommended Item",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Description",
        guid: "guid-1",
        extra: {},
        graded: true,
        level: "recommended",
        reason: "Worth reading",
      },
    ];

    const result = formatGradedItems(items);

    expect(result[0]?.title).toBe("⭐ Recommended Item");
  });

  it("should not add stars to optional items", () => {
    const items: GradedRssItem[] = [
      {
        title: "Optional Item",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Description",
        guid: "guid-1",
        extra: {},
        graded: true,
        level: "optional",
        reason: "Maybe interesting",
      },
    ];

    const result = formatGradedItems(items);

    expect(result[0]?.title).toBe("Optional Item");
  });

  it("should append level and reason to description", () => {
    const items: GradedRssItem[] = [
      {
        title: "Item",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Original description",
        guid: "guid-1",
        extra: {},
        graded: true,
        level: "critical",
        reason: "Test reason",
      },
    ];

    const result = formatGradedItems(items);

    expect(result[0]?.description).toBe(
      '<p><small style="opacity: 0.7;">[critical] Test reason</small></p>Original description',
    );
  });

  it("should use link as guid if guid is empty", () => {
    const items: GradedRssItem[] = [
      {
        title: "Item",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Description",
        guid: "",
        extra: {},
        graded: true,
        level: "critical",
        reason: "Reason",
      },
    ];

    const result = formatGradedItems(items);

    expect(result[0]?.guid).toEqual({
      value: "http://example.com/1",
      isPermaLink: false,
    });
  });
});
