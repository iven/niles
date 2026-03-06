/**
 * 类型定义（基于 zod schema）
 */

import { z } from "zod";

const levelSchema = z.enum([
  "critical",
  "recommended",
  "optional",
  "rejected",
  "unknown",
]);

export const feedItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  description: z.string(),
  guid: z.string(),
  extra: z.record(z.string(), z.unknown()).default({}),
  level: levelSchema.default("unknown"),
  reason: z.string().default("未分级"),
});

export type FeedItem = z.infer<typeof feedItemSchema>;
