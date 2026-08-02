import { describe, expect, it } from "bun:test";
import { parseHTML } from "linkedom";

describe("github-trending collect", () => {
  it("应从 HTML 解析仓库信息", async () => {
    const html = await Bun.file("/tmp/agents/trending-sample.html").text();
    const { document } = parseHTML(html);

    const articles = document.querySelectorAll("article.Box-row");
    expect(articles.length).toBeGreaterThan(0);

    const repos: Array<{
      owner: string;
      name: string;
      description: string;
      language: string;
      stars: string;
    }> = [];

    for (const article of articles) {
      if (repos.length >= 10) break;

      const linkEl = article.querySelector("h2 a");
      const href = linkEl?.getAttribute("href") || "";
      const pathMatch = /^\/([^/]+)\/([^/]+)/.exec(href);
      expect(pathMatch).not.toBeNull();
      if (!pathMatch) continue;
      const owner = pathMatch[1] || "";
      const name = pathMatch[2] || "";

      const descEl = article.querySelector("p.col-9");
      const description = descEl?.textContent?.trim() || "";

      const langEl = article.querySelector('[itemprop="programmingLanguage"]');
      const languageText = langEl?.textContent?.trim() || "";

      const starLink = article.querySelector("a[href*='/stargazers']");
      const stars = starLink?.textContent?.trim() || "0";

      repos.push({ owner, name, description, language: languageText, stars });
    }

    expect(repos.length).toBe(10);
    for (const repo of repos) {
      expect(repo.owner).toBeTruthy();
      expect(repo.name).toBeTruthy();
      expect(repo.stars).toMatch(/^[\d,]+$/);
    }

    const first = repos[0];
    expect(first).toBeDefined();
    if (first) {
      console.log(
        `  解析样例: ${first.owner}/${first.name} — ${first.description} (${first.language}, ${first.stars} stars)`,
      );
    }
  });

  it("星星数字去除逗号后应可解析为整数", () => {
    expect(Number("57,500".replace(/,/g, ""))).toBe(57500);
    expect(Number("1,234".replace(/,/g, ""))).toBe(1234);
    expect(Number("42".replace(/,/g, ""))).toBe(42);
  });
});
