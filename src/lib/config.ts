/**
 * 配置读取和验证（基于 zod schema）
 */

import { z } from "zod";

// LLM 配置
export const llmConfigSchema = z.object({
  provider: z.enum(["anthropic", "openai", "gemini", "openrouter", "grok"]),
  baseUrl: z.string().optional(),
  models: z.object({
    grade: z.string(),
    summarize: z.string(),
  }),
});
export type LlmConfig = z.infer<typeof llmConfigSchema>;

// 全局配置
export const globalConfigSchema = z.object({
  high_interest: z.string(),
  interest: z.string(),
  uninterested: z.string(),
  avoid: z.string(),
  preferred_language: z.string(),
  timeout: z.number(),
});
export type GlobalConfig = z.infer<typeof globalConfigSchema>;

const pluginEntrySchema = z.union([
  z.string(),
  z.object({
    name: z.string(),
    options: z.record(z.string(), z.unknown()).optional(),
  }),
]);

// Source 配置
export const sourceConfigSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  context: z.string().optional(),
  high_interest: z.string().optional(),
  interest: z.string().optional(),
  uninterested: z.string().optional(),
  avoid: z.string().optional(),
  plugins: z.array(pluginEntrySchema),
  summarize: z.boolean().optional(),
  regrade: z.boolean().default(false),
  timeout: z.number().optional(),
});
export type SourceConfig = z.infer<typeof sourceConfigSchema>;

// 完整配置
const configSchema = z.object({
  llm: llmConfigSchema,
  global: globalConfigSchema,
  sources: z.array(sourceConfigSchema),
});
type Config = z.infer<typeof configSchema>;

/**
 * 解析配置数据（纯函数，便于测试）
 */
export function parseConfig(data: unknown): Config {
  return configSchema.parse(data);
}

/**
 * 从文件加载配置
 */
export async function loadConfig(configPath: string): Promise<Config> {
  const file = Bun.file(configPath);
  const data = await file.json();
  return parseConfig(data);
}
