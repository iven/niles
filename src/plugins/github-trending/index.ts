import { parseHTML } from "linkedom";
import { http } from "../../lib/http";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface GithubTrendingOptions {
  limit?: number;
  language?: string;
  since?: "daily" | "weekly" | "monthly";
}

interface GithubReadmeResponse {
  content: string;
  encoding: string;
}

const DEFAULT_LIMIT = 15;
const README_MAX_LENGTH = 15000;

const plugin: Plugin<GithubTrendingOptions> = {
  ...basePlugin,
  async collect(options: GithubTrendingOptions, context: PluginContext) {
    const { limit = DEFAULT_LIMIT, language, since } = options;

    context.logger.start("开始获取 GitHub Trending...");

    const params = new URLSearchParams();
    if (since && since !== "daily") params.set("since", since);
    if (language) params.set("language", language);

    const url = `https://github.com/trending${params.size > 0 ? `?${params.toString()}` : ""}`;

    const html = await http.get(url).text();
    const { document } = parseHTML(html);

    const repos: Array<{
      owner: string;
      name: string;
      description: string;
      language: string;
      stars: string;
      forks: string;
      url: string;
    }> = [];

    const articles = document.querySelectorAll("article.Box-row");
    for (const article of articles) {
      if (repos.length >= limit) break;

      const linkEl = article.querySelector("h2 a");
      const href = linkEl?.getAttribute("href") || "";
      const pathMatch = /^\/([^/]+)\/([^/]+)/.exec(href);
      if (!pathMatch) continue;
      const owner = pathMatch[1] || "";
      const name = pathMatch[2] || "";

      const descEl = article.querySelector("p.col-9");
      const description = descEl?.textContent?.trim() || "";

      const langEl = article.querySelector('[itemprop="programmingLanguage"]');
      const languageText = langEl?.textContent?.trim() || "";

      const starLink = article.querySelector("a[href*='/stargazers']");
      const stars = starLink?.textContent?.trim() || "0";

      const forkLink = article.querySelector("a[href*='/forks']");
      const forks = forkLink?.textContent?.trim() || "0";

      repos.push({
        owner,
        name,
        description,
        language: languageText,
        stars,
        forks,
        url: `https://github.com${href}`,
      });
    }

    const items: FeedItem[] = repos.map((repo, index) => ({
      title: `${repo.owner}/${repo.name}`,
      link: repo.url,
      pubDate: context.now.toISOString(),
      description: repo.description,
      guid: repo.url,
      extra: {
        stars: Number(repo.stars.replace(/,/g, "")),
        forks: Number(repo.forks.replace(/,/g, "")),
        language: repo.language,
        rank: index + 1,
      },
      level: "unknown" as const,
      reason: "未分级",
    }));

    const result = context.isDryRun ? items.slice(0, 3) : items;
    context.logger.success(`获取到 ${result.length} 个条目`);
    return { title: "GitHub Trending", items: result };
  },

  async processItems(
    items: FeedItem[],
    _options: GithubTrendingOptions,
    context: PluginContext,
  ): Promise<FeedItem[]> {
    context.logger.start("开始抓取 README...");

    const token = process.env.GITHUB_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const results = await Promise.all(
      items.map((item) =>
        item.level === "rejected" ? item : fetchReadme(item, headers, context),
      ),
    );

    const succeeded = results.filter(
      (item) => item.extra.content && item.level !== "rejected",
    ).length;
    context.logger.success(`抓取 README 完成（${succeeded} 个成功）`);
    return results;
  },
};

async function fetchReadme(
  item: FeedItem,
  headers: Record<string, string>,
  context: PluginContext,
): Promise<FeedItem> {
  const match = /github\.com\/([^/]+)\/([^/]+)/.exec(item.link);
  if (!match) {
    context.logger.warn(`无法解析仓库名: ${item.link}`);
    return item;
  }
  const owner = match[1] || "";
  const repo = match[2] || "";

  try {
    const json = await http
      .get(`https://api.github.com/repos/${owner}/${repo}/readme`, { headers })
      .json<GithubReadmeResponse>();

    const content = Buffer.from(json.content, "base64").toString("utf-8");
    item.extra.content = content.slice(0, README_MAX_LENGTH);
  } catch (error) {
    context.logger.warn(`抓取 README 失败 ${owner}/${repo}: ${error}`);
    item.extra.content = "";
  }

  return item;
}

export default plugin;
