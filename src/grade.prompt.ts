/**
 * Grade prompt 定义
 */

import type { GlobalConfig, SourceConfig } from "./lib/config";
import type { RssItem } from "./types";

export const GRADE_SYSTEM_PROMPT = `# 任务：内容分级

根据用户兴趣配置，基于标题和摘要对文章进行分级。

## 分级规则

按以下步骤进行分级：

1. **理解用户兴趣**：
   - 兴趣分为四类：high_interest（很感兴趣）、interest（感兴趣）、uninterested（不太感兴趣）、avoid（想要避开）
   - 全局配置和来源配置都要考虑，来源配置权重更高

2. **进行分级**：根据文章的标题、摘要，判断文章主题，再判断用户对该主题的兴趣程度
   - **level 字段的 4 个合法值（必须精确匹配）**：
     - critical：用户会强烈感兴趣，必看内容
     - recommended：用户会感兴趣，推荐阅读
     - optional：标题含义模糊或兴趣不明确，可选
     - rejected：用户不感兴趣，应该被排除
   - **综合判断示例**：
     - 例 1：文章主要讲主题 A，顺便提到主题 B → 主要主题是 A → 即使全局配置 B 是 high_interest、A 是 avoid，也应判断为 rejected（主要主题权重更高）
     - 例 2：全局配置主题 X 为 interest，来源配置主题 Y 为 high_interest → 文章同时讲 X 和 Y → 两个配置都在起作用，都是高兴趣，应判断为 critical 或 recommended（根据主题占比判断）
     - 例 3：全局配置主题 X 为 high_interest，来源配置主题 Y 为 uninterested → 文章同时讲 X 和 Y，两者比重相当 → 综合评定可能为 recommended 或 optional（X 加分，Y 减分，需根据主题占比和配置综合权衡，权衡时来源配置的权重更高）

**重要**：
- 禁止编写脚本、禁止匹配关键词，要理解标题和摘要实际在讲什么
- 直接根据理解判断分级

## 输出

**必须**使用 write_grade_results 工具写入分级结果，禁止直接输出 JSON 或其他格式。

参数格式：
- items: 数组，每个元素包含 guid、level、reason
- reason 字段格式：简要说明主题及分级原因，避免重复标题内容。例如「虽然涉及 A，但主要是讲 B，故排除」

**调用工具后，等待工具返回结果。如果工具返回错误，请根据错误信息修正参数并重新调用工具，最多尝试 5 次。**`;

export function buildGradeUserPrompt(
  sourceConfig: SourceConfig,
  globalConfig: GlobalConfig,
  items: RssItem[],
): string {
  // 准备提示数据
  const itemsText = items
    .map((item, index) => {
      const meta = (item.extra.meta as string) || "";
      return `### 文章 ${index + 1}
- GUID: ${item.guid}
- 标题: ${item.title}
- 摘要: ${meta}`;
    })
    .join("\n\n");

  return `## 内容来源

${sourceConfig.name}

## 用户兴趣配置

### 全局配置
- 很感兴趣 (high_interest): ${globalConfig.high_interest}
- 感兴趣 (interest): ${globalConfig.interest}
- 不太感兴趣 (uninterested): ${globalConfig.uninterested}
- 想要避开 (avoid): ${globalConfig.avoid}

### 针对「${sourceConfig.name}」的配置（权重更高）
- 很感兴趣 (high_interest): ${sourceConfig.high_interest || "无"}
- 感兴趣 (interest): ${sourceConfig.interest || "无"}
- 不太感兴趣 (uninterested): ${sourceConfig.uninterested || "无"}
- 想要避开 (avoid): ${sourceConfig.avoid || "无"}

## 待分级内容
共 ${items.length} 篇文章：

${itemsText}

请对每篇文章进行分级，并调用 write_grade_results 工具写入结果。`;
}
