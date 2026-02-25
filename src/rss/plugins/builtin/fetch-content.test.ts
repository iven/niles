import { describe, expect, it } from "bun:test";
import { shouldFilterImage } from "./fetch-content";

describe("shouldFilterImage", () => {
  it("should filter data URI images", () => {
    expect(shouldFilterImage("data:image/png;base64,iVBORw0KG...", false)).toBe(
      true,
    );
    expect(shouldFilterImage("data:image/jpeg;base64,/9j/4AA...", false)).toBe(
      true,
    );
    expect(shouldFilterImage("data:image/gif;base64,R0lGOD...", true)).toBe(
      true,
    );
  });

  it("should filter first image with category keyword", () => {
    expect(
      shouldFilterImage("https://example.com/category-icon.png", true),
    ).toBe(true);
    expect(
      shouldFilterImage("https://example.com/categories/thumb.jpg", true),
    ).toBe(true);
  });

  it("should filter first image with tag keyword", () => {
    expect(shouldFilterImage("https://example.com/tag-icon.png", true)).toBe(
      true,
    );
    expect(shouldFilterImage("https://example.com/tags/image.jpg", true)).toBe(
      true,
    );
  });

  it("should filter first image with topic keyword", () => {
    expect(shouldFilterImage("https://example.com/topic-thumb.png", true)).toBe(
      true,
    );
  });

  it("should filter first image with icon keyword", () => {
    expect(shouldFilterImage("https://example.com/favicon.ico", true)).toBe(
      true,
    );
    expect(shouldFilterImage("https://example.com/icon-small.png", true)).toBe(
      true,
    );
  });

  it("should filter first image with avatar keyword", () => {
    expect(shouldFilterImage("https://example.com/avatar.jpg", true)).toBe(
      true,
    );
    expect(
      shouldFilterImage("https://example.com/user-avatar-128.png", true),
    ).toBe(true);
  });

  it("should not filter first image without keywords", () => {
    expect(
      shouldFilterImage("https://example.com/article-photo.jpg", true),
    ).toBe(false);
    expect(
      shouldFilterImage("https://example.com/content-image.png", true),
    ).toBe(false);
  });

  it("should not filter non-first image with keywords", () => {
    // 第二张及之后的图片,即使包含关键词也不过滤
    expect(
      shouldFilterImage("https://example.com/category-icon.png", false),
    ).toBe(false);
    expect(shouldFilterImage("https://example.com/tag-thumb.jpg", false)).toBe(
      false,
    );
    expect(shouldFilterImage("https://example.com/avatar.png", false)).toBe(
      false,
    );
  });

  it("should be case insensitive for keyword matching", () => {
    expect(
      shouldFilterImage("https://example.com/CATEGORY-icon.png", true),
    ).toBe(true);
    expect(shouldFilterImage("https://example.com/Tag-Image.jpg", true)).toBe(
      true,
    );
    expect(shouldFilterImage("https://example.com/AVATAR.PNG", true)).toBe(
      true,
    );
  });

  it("should match keyword in any part of URL", () => {
    expect(
      shouldFilterImage("https://cdn.example.com/category/hero.jpg", true),
    ).toBe(true);
    expect(
      shouldFilterImage("https://example.com/img/tag/photo.png", true),
    ).toBe(true);
    expect(
      shouldFilterImage("https://avatars.example.com/user.jpg", true),
    ).toBe(true);
  });

  it("should handle empty or unusual URLs", () => {
    expect(shouldFilterImage("", false)).toBe(false);
    expect(shouldFilterImage("", true)).toBe(false);
    expect(shouldFilterImage("relative/path.jpg", false)).toBe(false);
  });

  it("should handle real blog post images", () => {
    // 第一张图:包含 category,应该过滤
    expect(
      shouldFilterImage(
        "https://blog.example.com/wp-content/uploads/category-tech.jpg",
        true,
      ),
    ).toBe(true);

    // 第一张图:正常文章配图,不过滤
    expect(
      shouldFilterImage(
        "https://blog.example.com/wp-content/uploads/2024/02/article-hero.jpg",
        true,
      ),
    ).toBe(false);

    // 第二张图:即使是 icon 也不过滤
    expect(
      shouldFilterImage("https://blog.example.com/social-icon.png", false),
    ).toBe(false);
  });

  it("should filter data URI regardless of position", () => {
    // data URI 无论位置都过滤
    expect(shouldFilterImage("data:image/svg+xml;base64,PHN2Zy...", true)).toBe(
      true,
    );
    expect(
      shouldFilterImage("data:image/svg+xml;base64,PHN2Zy...", false),
    ).toBe(true);
  });
});
