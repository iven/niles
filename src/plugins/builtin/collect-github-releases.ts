import { http } from "../../lib/http";
import { withRetry } from "../../lib/retry";
import { basePlugin, type Plugin, type PluginContext } from "../../plugin";
import type { FeedItem } from "../../types";

interface CollectGithubReleasesOptions {
  repo: string;
  maxItems?: number;
  token?: string;
}

interface GithubRelease {
  id: number;
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string | null;
  draft: boolean;
  prerelease: boolean;
}

const plugin: Plugin<CollectGithubReleasesOptions> = {
  ...basePlugin,
  async collect(options, context: PluginContext) {
    const { repo, maxItems, token } = options;
    if (!repo) throw new Error("collect-github-releases: options.repo 未指定");

    context.logger.start("开始获取新条目...");

    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const envToken = token || process.env.GITHUB_TOKEN;
    if (envToken) {
      headers.Authorization = `Bearer ${envToken}`;
    }

    const perPage = Math.min(maxItems ?? 5, 100);
    const releases = await withRetry(() =>
      http
        .get(`https://api.github.com/repos/${repo}/releases`, {
          searchParams: { per_page: perPage },
          headers,
        })
        .json<GithubRelease[]>(),
    );

    const items: FeedItem[] = releases
      .filter((r) => !r.draft && r.published_at)
      .map((r) => ({
        title: r.name || r.tag_name,
        link: r.html_url,
        pubDate: r.published_at ?? "",
        description: r.body || "",
        guid: r.html_url,
        extra: {},
        level: "unknown" as const,
        reason: "未分级",
      }));

    const result = context.isDryRun ? items.slice(0, 3) : items;
    context.logger.success(`获取到 ${result.length} 个条目`);
    return { items: result };
  },
};

export default plugin;
