import { describe, expect, it } from "bun:test";
import { mergeGradeResults } from "./grade";
import type { GradeResult, RssItem } from "./types";

describe("mergeGradeResults", () => {
  const createItem = (guid: string, title: string): RssItem => ({
    title,
    link: `http://example.com/${guid}`,
    pubDate: "2024-01-01",
    description: "Description",
    guid,
    extra: {},
    graded: false,
  });

  it("should merge grade results with original items", () => {
    const items: RssItem[] = [
      createItem("guid-1", "Item 1"),
      createItem("guid-2", "Item 2"),
    ];

    const gradeResults: GradeResult[] = [
      { guid: "guid-1", level: "critical", reason: "Very interesting" },
      { guid: "guid-2", level: "recommended", reason: "Worth reading" },
    ];

    const result = mergeGradeResults(items, gradeResults);

    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(result.items).toBeArrayOfSize(2);
    expect(result.items[0]?.graded).toBe(true);
    expect(result.items[0]?.level).toBe("critical");
    expect(result.items[0]?.reason).toBe("Very interesting");
    expect(result.items[1]?.level).toBe("recommended");
  });

  it("should return error if count mismatch", () => {
    const items: RssItem[] = [createItem("guid-1", "Item 1")];

    const gradeResults: GradeResult[] = [
      { guid: "guid-1", level: "critical", reason: "Reason 1" },
      { guid: "guid-2", level: "recommended", reason: "Reason 2" },
    ];

    const result = mergeGradeResults(items, gradeResults);

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain("条目数量不匹配");
      expect(result.error).toContain("期望 1 个");
      expect(result.error).toContain("实际 2 个");
    }
  });

  it("should return error if GUID not found", () => {
    const items: RssItem[] = [createItem("guid-1", "Item 1")];

    const gradeResults: GradeResult[] = [
      { guid: "guid-999", level: "critical", reason: "Reason" },
    ];

    const result = mergeGradeResults(items, gradeResults);

    expect(result.success).toBe(false);
    if (result.success === false) {
      expect(result.error).toContain("找不到 GUID 为 guid-999 的条目");
    }
  });

  it("should preserve original item fields", () => {
    const items: RssItem[] = [
      {
        title: "Original Title",
        link: "http://example.com/1",
        pubDate: "2024-01-01",
        description: "Original Description",
        guid: "guid-1",
        extra: { custom: "data" },
        graded: false,
      },
    ];

    const gradeResults: GradeResult[] = [
      { guid: "guid-1", level: "optional", reason: "Maybe interesting" },
    ];

    const result = mergeGradeResults(items, gradeResults);

    expect(result.success).toBe(true);
    if (!result.success) return;

    const item = result.items[0];
    expect(item?.title).toBe("Original Title");
    expect(item?.link).toBe("http://example.com/1");
    expect(item?.description).toBe("Original Description");
    expect(item?.extra).toEqual({ custom: "data" });
  });
});
