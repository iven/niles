import { z } from "zod";
import { basePlugin } from "../../plugin";
import type { FeedItem } from "../../types";

const targetSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  title: z.string(),
  url: z.string(),
  excerpt: z.string().optional().default(""),
  created: z.number(),
});

const feedSchema = z.object({
  card_id: z.string(),
  target: targetSchema,
  detail_text: z.string(),
});

const responseSchema = z.object({
  data: z.array(feedSchema),
});

const DEFAULT_LIMIT = 5;

function toQuestionUrl(apiUrl: string): string {
  return apiUrl.replace(
    "https://api.zhihu.com/questions/",
    "https://www.zhihu.com/question/",
  );
}

interface ZhihuOptions {
  limit?: number;
}

const plugin = {
  ...basePlugin,
  async collect(options: ZhihuOptions) {
    const limit = options.limit ?? DEFAULT_LIMIT;

    const response = await fetch(
      "https://api.zhihu.com/topstory/hot-lists/total",
      {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const json = await response.json();
    const parsed = responseSchema.parse(json);
    const entries = parsed.data.slice(0, limit);

    const items: FeedItem[] = entries.map((entry, index) => ({
      title: entry.target.title,
      link: toQuestionUrl(entry.target.url),
      pubDate: new Date(entry.target.created * 1000).toISOString(),
      description: entry.target.excerpt,
      guid: entry.card_id,
      extra: { hotness: entry.detail_text, rank: index + 1 },
      level: "unknown" as const,
      reason: "未分级",
    }));

    return { title: "知乎热榜", items };
  },
};

export default plugin;
