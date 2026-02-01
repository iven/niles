# 任务：RSS 源筛选

从预处理的新条目中筛选符合兴趣的内容。

## 输入参数（环境变量）

首先一次性获取以下所有环境变量：

- `SOURCE_NAME`: 源名称
- `SOURCE_URL`: RSS feed URL
- `NEW_ITEMS_JSON`: 新条目 JSON 文件路径（已去重）
- `FILTER_RESULTS_JSON`: 筛选结果输出文件路径
- `GLOBAL_HIGH_INTEREST`: 全局强烈感兴趣的主题（逗号分隔）
- `GLOBAL_INTEREST`: 全局一般感兴趣的主题（逗号分隔）
- `GLOBAL_UNINTERESTED`: 全局不感兴趣的主题（逗号分隔）
- `GLOBAL_EXCLUDE`: 全局强烈排除的主题（逗号分隔）
- `SOURCE_HIGH_INTEREST`: 源特定强烈感兴趣的主题（逗号分隔，可选）
- `SOURCE_INTEREST`: 源特定一般感兴趣的主题（逗号分隔，可选）
- `SOURCE_UNINTERESTED`: 源特定不感兴趣的主题（逗号分隔，可选）
- `SOURCE_EXCLUDE`: 源特定强烈排除的主题（逗号分隔，可选）

**主题合并规则**：
每个级别的主题 = 全局配置 + 源特定配置（都存在时合并）

## 执行步骤

### 1. 提取标题

使用 jq 从 NEW_ITEMS_JSON 文件中提取每个条目的 guid 和 title：

```bash
jq '[.items[] | {guid: .guid, title: .title}]' "$NEW_ITEMS_JSON"
```

### 2. 基于标题筛选

基于上一步提取的标题列表进行语义判断。如果条目总数超过 30 个，分多批处理（每批 25 个）。在分析过程中输出时，必须使用完整的原标题，不要简化或改写标题。

**兴趣级别定义**：
- **强烈感兴趣**：必须保留，标记为 `high_interest`
- **一般感兴趣**：必须保留，标记为 `interest`
- **不感兴趣**：建议排除，但如果内容与其他感兴趣主题相关性高，可以保留为 `other`；否则排除为 `excluded`
- **强烈排除**：必须排除，标记为 `excluded`

**筛选规则**（优先级从高到低）：
1. 如果匹配**强烈感兴趣**主题 → `high_interest`（最高优先级）
2. 如果匹配**一般感兴趣**主题 → `interest`
3. 如果匹配**强烈排除**主题 → `excluded`（如果同时匹配兴趣主题，兴趣优先）
4. 如果匹配**不感兴趣**主题 → 根据与感兴趣主题的相关性判断：
   - 与感兴趣主题相关性高 → `other`
   - 否则 → `excluded`
5. 其他内容 → `other`

**重要约束**：
- 必须直接使用 AI 语义理解能力来判断内容是否匹配主题
- 禁止创建任何脚本、函数或工具来执行关键字匹配
- 禁止使用正则表达式、字符串包含检查或任何基于关键字的匹配逻辑
- 理解每个条目的实际含义和内容主题，不要局限于特定的关键词或短语

### 3. 输出 JSON

**首次写入时**，创建包含 `source_name`、`source_url` 和空 `results` 的完整 JSON 结构。

**每分析完一批后**，将该批次的结果追加到 `results` 对象中，使 `results` 对象扁平地包含每个条目的结果。

最终文件格式如下：

```json
{
  "source_name": "SOURCE_NAME 环境变量的值",
  "source_url": "SOURCE_URL 环境变量的值",
  "results": {
    "guid-1": {
      "title": "条目标题",
      "type": "high_interest",
      "reason": "人工智能技术进展，属于强烈感兴趣主题"
    },
    "guid-2": {
      "title": "条目标题",
      "type": "interest",
      "reason": "开源项目，属于一般感兴趣主题"
    },
    "guid-3": {
      "title": "条目标题",
      "type": "excluded",
      "reason": "加密货币，属于强烈排除主题"
    },
    "guid-4": {
      "title": "条目标题",
      "type": "other",
      "reason": "其他主题"
    }
  }
}
```

- `results` 是一个对象，key 是条目的 guid，value 包含筛选结果
- 包含**所有**条目的筛选结果
- `title` 是条目的完整原标题，注意：
  - 保持标题与原文完全一致，不要修改任何字符（例如标题中的中文引号必须替换为「」，不要保留原样也不要改成英文引号 ""）
  - 正确转义 JSON 特殊字符：英文双引号 `"` → `\"`，反斜杠 `\` → `\\`，换行符 → `\n`
- `type` 字段标识条目类型：
  - `"high_interest"`：强烈感兴趣
  - `"interest"`：一般感兴趣
  - `"other"`：其他主题（包括不感兴趣但与感兴趣主题相关性高的）
  - `"excluded"`：排除（强烈排除或不感兴趣且相关性低的）
- `reason` 格式："内容主题，属于XX主题"，可以列出多个匹配的主题
