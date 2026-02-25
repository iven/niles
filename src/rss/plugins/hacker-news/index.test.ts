import { describe, expect, it } from "bun:test";

// 从 hn_fetch_comments.ts 导出 extractComments 用于测试
type HNApiChild = {
  author?: string;
  text?: string;
  points?: number | null;
  children?: HNApiChild[];
};

interface HNComment {
  author: string;
  text: string;
  points: number;
  depth: number;
}

function extractComments(
  children: HNApiChild[],
  depth: number,
  maxDepth: number,
): HNComment[] {
  const comments: HNComment[] = [];
  const limit = depth === 0 ? 10 : 2;

  for (let i = 0; i < Math.min(children.length, limit); i++) {
    const child = children[i];
    if (!child) continue;

    const text = child.text?.trim();

    if (text) {
      comments.push({
        author: child.author || "",
        text,
        points: child.points || 0,
        depth,
      });
    }

    if (depth < maxDepth && child.children) {
      const subComments = extractComments(child.children, depth + 1, maxDepth);
      comments.push(...subComments);
    }
  }

  return comments;
}

describe("extractComments", () => {
  it("should extract top-level comments with limit of 10", () => {
    // 超过 10 个顶级评论
    const children: HNApiChild[] = [
      { author: "lvl102", text: "Comment 1", points: 5 },
      { author: "oefrha", text: "Comment 2", points: 3 },
      { author: "keiferski", text: "Comment 3", points: 10 },
      { author: "benterix", text: "Comment 4", points: 2 },
      { author: "user5", text: "Comment 5", points: 8 },
      { author: "user6", text: "Comment 6", points: 1 },
      { author: "user7", text: "Comment 7", points: 6 },
      { author: "user8", text: "Comment 8", points: 4 },
      { author: "user9", text: "Comment 9", points: 7 },
      { author: "user10", text: "Comment 10", points: 9 },
      { author: "user11", text: "Comment 11 - should be excluded", points: 3 },
      { author: "user12", text: "Comment 12 - should be excluded", points: 2 },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(10);
    expect(result[0]?.author).toBe("lvl102");
    expect(result[9]?.author).toBe("user10");
  });

  it("should extract nested comments with depth limit", () => {
    // HN 评论结构
    const children: HNApiChild[] = [
      {
        author: "lvl102",
        text: "You're right. It's a gross generalization.",
        points: null,
        children: [
          {
            author: "keiferski",
            text: "Yeah, and I went to Greece, a country with a population half the size...",
            points: null,
            children: [
              {
                author: "user3",
                text: "Nested reply at depth 2",
                points: 5,
                children: [],
              },
            ],
          },
        ],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(3);
    expect(result[0]?.text).toContain("gross generalization");
    expect(result[0]?.depth).toBe(0);
    expect(result[1]?.text).toContain("went to Greece");
    expect(result[1]?.depth).toBe(1);
    expect(result[2]?.depth).toBe(2);
  });

  it("should stop at maxDepth", () => {
    // 深层嵌套
    const children: HNApiChild[] = [
      {
        author: "lvl102",
        text: "Top level comment",
        points: 10,
        children: [
          {
            author: "keiferski",
            text: "Reply at depth 1",
            points: 5,
            children: [
              {
                author: "oefrha",
                text: "Reply at depth 2",
                points: 3,
                children: [
                  {
                    author: "brazzy",
                    text: "Reply at depth 3 - should be excluded",
                    points: 2,
                    children: [],
                  },
                ],
              },
            ],
          },
        ],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(3);
    expect(result.every((c) => c.depth <= 2)).toBe(true);
    expect(result.some((c) => c.text.includes("depth 3"))).toBe(false);
  });

  it("should limit nested comments to 2 per level", () => {
    // 一个评论有多个回复
    const children: HNApiChild[] = [
      {
        author: "lvl102",
        text: "Original comment",
        points: 20,
        children: [
          {
            author: "keiferski",
            text: "First reply",
            points: 10,
            children: [],
          },
          { author: "oefrha", text: "Second reply", points: 8, children: [] },
          {
            author: "brazzy",
            text: "Third reply - should be excluded",
            points: 5,
            children: [],
          },
          {
            author: "benterix",
            text: "Fourth reply - should be excluded",
            points: 3,
            children: [],
          },
        ],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(3);
    expect(result[0]?.text).toBe("Original comment");
    expect(result[1]?.text).toBe("First reply");
    expect(result[2]?.text).toBe("Second reply");
  });

  it("should skip comments without text", () => {
    // 数据中可能有空文本或只有空白
    const children: HNApiChild[] = [
      {
        author: "lvl102",
        text: "Valid comment with text",
        points: 10,
        children: [],
      },
      { author: "keiferski", text: "", points: 20, children: [] },
      { author: "oefrha", text: undefined, points: 30, children: [] },
      { author: "brazzy", text: "  \n  ", points: 40, children: [] },
      {
        author: "benterix",
        text: "Another valid comment",
        points: 5,
        children: [],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(2);
    expect(result[0]?.text).toBe("Valid comment with text");
    expect(result[1]?.text).toBe("Another valid comment");
  });

  it("should handle missing author and points", () => {
    // API 中 author 可能缺失,points 可能是 null
    const children: HNApiChild[] = [
      { text: "Comment without author", points: 10, children: [] },
      {
        author: "lvl102",
        text: "Comment without points",
        points: undefined,
        children: [],
      },
      {
        author: "keiferski",
        text: "Comment with null points",
        points: null,
        children: [],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(3);
    expect(result[0]?.author).toBe("");
    expect(result[0]?.points).toBe(10);
    expect(result[1]?.points).toBe(0);
    expect(result[2]?.points).toBe(0);
  });

  it("should handle complex API structure", () => {
    // 基于 HN API item 40000000 的响应
    const children: HNApiChild[] = [
      {
        author: "lvl102",
        text: "You're right. It's a gross generalization. But it is based on my personal and professional experience.",
        points: null,
        children: [
          {
            author: "keiferski",
            text: "Yeah, and I went to Greece, a country with a population half the size of Saudi Arabia...",
            points: null,
            children: [],
          },
        ],
      },
      {
        author: "oefrha",
        text: "I won't comment on culture but it is a fact that the majority of working Saudis work in bullshit government jobs...",
        points: null,
        children: [
          {
            author: "brazzy",
            text: "You have a bunch of weasel words there that are doing some heavy lifting...",
            points: null,
            children: [
              {
                author: "oefrha",
                text: "According to https://money.cnn.com/2016/10/20/news/saudi-government-workers-productivity/index.html...",
                points: null,
                children: [],
              },
            ],
          },
        ],
      },
      {
        author: "benterix",
        text: "I wanted to reply 'But Sheikh Mohammed himself said so!' but then...",
        points: null,
        children: [],
      },
    ];

    const result = extractComments(children, 0, 2);

    expect(result.length).toBe(6);
    expect(result[0]?.author).toBe("lvl102");
    expect(result[0]?.depth).toBe(0);
    expect(result[1]?.author).toBe("keiferski");
    expect(result[1]?.depth).toBe(1);
    expect(result[2]?.author).toBe("oefrha");
    expect(result[3]?.author).toBe("brazzy");
    expect(result[3]?.depth).toBe(1);
    expect(result[4]?.depth).toBe(2);
    expect(result[5]?.author).toBe("benterix");
    expect(result[5]?.depth).toBe(0);
  });
});
