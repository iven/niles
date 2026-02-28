import { init as rsshubInit, request as rsshubRequest } from "rsshub";
import { z } from "zod";
import { basePlugin } from "../../plugin";
import type { UngradedRssItem } from "../../types";

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

const plugin = {
  ...basePlugin,
  async collect(options: Record<string, unknown>) {
    const route = options.route as string;
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

    const items: UngradedRssItem[] = rawItems.map((item) => ({
      title: item.title || "",
      link: item.link || "",
      pubDate: item.pubDate || "",
      description: item.description || "",
      guid: item.guid?.value || item.link || "",
      extra: {},
      graded: false as const,
    }));

    return {
      title: parseResult.data.title,
      items,
    };
  },
};

export default plugin;
