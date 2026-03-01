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

// 分级结果（LLM 返回的格式）
export const gradeResultSchema = z.object({
  guid: z.string().min(1),
  level: z.enum(["critical", "recommended", "optional", "rejected"]),
  reason: z.string().min(1),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;

// 总结结果（LLM 返回的格式）
export const summaryResultSchema = z.object({
  guid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  rejected: z.boolean(),
});
export type SummaryResult = z.infer<typeof summaryResultSchema>;
