/**
 * 类型定义（基于 zod schema）
 */

import { z } from "zod";

const levelSchema = z.enum(["critical", "recommended", "optional", "rejected"]);

// 基础 RSS 条目字段
const baseRssItemSchema = z.object({
  title: z.string(),
  link: z.string(),
  pubDate: z.string(),
  description: z.string(),
  guid: z.string(),
  extra: z.record(z.string(), z.unknown()).default({}),
});

// 未分级的 RSS 条目
const ungradedRssItemSchema = baseRssItemSchema.extend({
  graded: z.literal(false),
});

// 已分级的 RSS 条目
const gradedRssItemSchema = baseRssItemSchema.extend({
  graded: z.literal(true),
  level: levelSchema,
  reason: z.string().min(1),
});

// RSS 条目可以是未分级或已分级
const rssItemSchema = z.discriminatedUnion("graded", [
  ungradedRssItemSchema,
  gradedRssItemSchema,
]);

export type RssItem = z.infer<typeof rssItemSchema>;
export type UngradedRssItem = z.infer<typeof ungradedRssItemSchema>;
export type GradedRssItem = z.infer<typeof gradedRssItemSchema>;

// 分级结果（LLM 返回的格式）
export const gradeResultSchema = z.object({
  guid: z.string().min(1),
  level: levelSchema,
  reason: z.string().min(1),
});
export type GradeResult = z.infer<typeof gradeResultSchema>;

// 总结结果（LLM 返回的格式）
export const summaryResultSchema = z.object({
  guid: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
});
export type SummaryResult = z.infer<typeof summaryResultSchema>;
