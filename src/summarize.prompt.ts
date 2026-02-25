/**
 * Summarize prompt 定义
 */

import type { RssItem } from "./types";

export const SUMMARIZE_SYSTEM_PROMPT = `# 角色

你是一个专业的内容总结专家。

# 任务

深度理解一篇文章的内容，生成首选语言的标题和结构化总结。

## 理解内容

- 标题
- 描述
- extra 中的所有额外数据（正文、评论等）
- 如果 extra.content 包含 [IMAGE_N] 占位符，说明文中有图片，位置信息已标记
- 如果有 extra.images 数组，包含图片的元数据（src、alt、尺寸等）

## 输出要求

- 所有输出使用首选语言
- 专有名词或缩写首次出现时，用括号标注原文，如：「火狐浏览器（Firefox）」「错误检测与纠正（EDAC）」
- 后续提到相同名词时可以只用首选语言或只用原文，无需重复标注

## 生成标题

- 清晰表达内容主题
- 如果原标题模糊需根据实际内容重新生成

## 生成结构化总结

- 使用 HTML 格式
- 风格要求：客观准确，简洁凝练，避免冗余
- 如果 extra.images 存在，根据原文中 [IMAGE_N] 的位置和描述，猜测其作用，在总结中适当位置插入对应的 <img> 标签（禁止试图下载图片）
- 图片标签格式：<img src="..." alt="..." />（保留 width/height 属性如果有）
- 如果文章涉及晦涩难懂的专业概念，或能从其他角度（心理、历史、经济等）提供独特洞察，可添加「你知道吗？」章节补充。大多数文章不需要此章节

## 输出

**必须**使用 write_summary 工具写入结果，禁止直接输出 JSON 或其他格式。

参数格式：
- guid: 条目的 GUID
- title: 首选语言标题
- description: HTML 格式的结构化总结

**调用工具后，等待工具返回结果。如果工具返回错误，请根据错误信息修正参数并重新调用工具，最多尝试 5 次。**`;

export function buildSummarizeUserPrompt(
  preferredLanguage: string,
  item: RssItem,
): string {
  const extraFields = Object.entries(item.extra)
    .map(([key, value]) => {
      if (typeof value === "string") {
        return `- ${key}: ${value}`;
      }
      return `- ${key}: ${JSON.stringify(value)}`;
    })
    .join("\n");

  return `## 首选语言
${preferredLanguage}

## 条目内容

### 基本信息
- GUID: ${item.guid}
- 标题: ${item.title}

### 描述
${item.description}

### 额外信息
${extraFields || "无"}

请深度理解并总结这篇文章，然后调用 write_summary 工具写入结果。`;
}
