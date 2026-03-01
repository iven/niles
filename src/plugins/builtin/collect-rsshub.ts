import { init as rsshubInit, request as rsshubRequest } from "rsshub";
import { z } from "zod";
import { basePlugin, type Plugin } from "../../plugin";
import type { FeedItem } from "../../types";

const rssFeedItemSchema = z.object({
  title: z.string().optional(),
  link: z.string().optional(),
  pubDate: z.string().optional(),
  description: z.string().optional(),
  guid: z.object({ value: z.string().optional() }).optional(),
});

const rsshubResponseSchema = z.object({
  title: z.string().optional(),
  item: z.array(z.unknown()).optional(),
});

interface CollectRsshubOptions {
  route: string;
}

const plugin: Plugin<CollectRsshubOptions> = {
  ...basePlugin,
  async collect(options) {
    const { route } = options;
    if (!route) throw new Error("collect-rsshub: options.route 未指定");

    await rsshubInit();
    const rsshubData = await rsshubRequest(route);

    const parseResult = rsshubResponseSchema.safeParse(rsshubData);
    if (!parseResult.success) {
      throw new Error(`RSSHub 响应格式错误: ${parseResult.error.message}`);
    }

    const rawItems = (parseResult.data.item || []).map((item) => {
      const itemResult = rssFeedItemSchema.safeParse(item);
      return itemResult.success ? itemResult.data : {};
    });

    const items: FeedItem[] = rawItems.map((item) => ({
      title: item.title || "",
      link: item.link || "",
      pubDate: item.pubDate || "",
      description: item.description || "",
      guid: item.guid?.value || item.link || "",
      extra: {},
      level: "unknown" as const,
      reason: "未分级",
    }));

    return {
      title: parseResult.data.title,
      items,
    };
  },
};

export default plugin;
