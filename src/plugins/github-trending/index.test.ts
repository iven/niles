import { afterAll, describe, expect, it, mock } from "bun:test";
import type { PluginContext } from "../../plugin";

/** 与 github.com/trending 页面结构一致的最小样例，避免测试依赖外部文件 */
const TRENDING_HTML = `<!doctype html>
<html>
<body>
${Array.from(
  { length: 10 },
  (_, index) => `<article class="Box-row">
  <h2><a href="/owner${index + 1}/repo${index + 1}">owner${index + 1} / repo${index + 1}</a></h2>
  <p class="col-9">Description ${index + 1}</p>
  <span itemprop="programmingLanguage">TypeScript</span>
  <a href="/owner${index + 1}/repo${index + 1}/stargazers">${(index + 1).toLocaleString("en-US")}</a>
  <a href="/owner${index + 1}/repo${index + 1}/forks">${index + 1}</a>
</article>`,
).join("\n")}
</body>
</html>`;

mock.module("../../lib/http", () => ({
  http: {
    get: () => ({
      text: async () => TRENDING_HTML,
    }),
  },
}));

const { default: plugin } = await import("./index");

afterAll(() => {
  mock.restore();
});

function createContext(isDryRun = false): PluginContext {
  const noop = () => {};
  return {
    sourceName: "github-trending",
    sourceContext: undefined,
    isDryRun,
    now: new Date("2026-01-01T00:00:00Z"),
    llm: () => {
      throw new Error("collect 不应调用 LLM");
    },
    logger: { start: noop, success: noop, warn: noop, log: noop, error: noop },
  } as unknown as PluginContext;
}

describe("github-trending collect", () => {
  it("应从 HTML 解析出完整的仓库条目", async () => {
    const context = createContext();
    const result = await plugin.collect({}, context);

    expect(result.title).toBe("GitHub Trending");
    expect(result.items).toHaveLength(10);

    const [first] = result.items;
    expect(first).toBeDefined();
    if (!first) return;

    expect(first.title).toBe("owner1/repo1");
    expect(first.link).toBe("https://github.com/owner1/repo1");
    expect(first.guid).toBe("https://github.com/owner1/repo1");
    expect(first.description).toBe("Description 1");
    expect(first.pubDate).toBe(context.now.toISOString());
    expect(first.level).toBe("unknown");
    expect(first.extra).toEqual({
      stars: 1,
      forks: 1,
      language: "TypeScript",
      rank: 1,
    });

    const tenth = result.items[9];
    expect(tenth?.title).toBe("owner10/repo10");
    expect(tenth?.extra.rank).toBe(10);
  });

  it("dry-run 时只返回 3 条", async () => {
    const result = await plugin.collect({}, createContext(true));

    expect(result.items).toHaveLength(3);
    expect(result.items.map((item) => item.title)).toEqual([
      "owner1/repo1",
      "owner2/repo2",
      "owner3/repo3",
    ]);
  });
});
