# 任务：RSS 源筛选

从预处理的新条目中筛选符合兴趣的内容。

## 输入参数（环境变量）

首先**一次性**获取以下所有环境变量：

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
- `PREFERRED_LANGUAGE`: 首选语言（如 "zh", "en"）
- `FETCH_CONTENT`: 是否已抓取网页内容（"true"/"false"）
- `TRANSLATE`: 是否需要翻译/总结（"true"/"false"）

**主题合并规则**：
每个级别的主题 = 全局配置 + 源特定配置（都存在时合并）

## 筛选规则

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

## 执行步骤

根据 `FETCH_CONTENT` 环境变量选择执行流程：

### 当 FETCH_CONTENT="true" 时：两阶段筛选

#### 第一步：快速筛选（基于标题和 Meta）

使用 jq 从 NEW_ITEMS_JSON 文件中提取每个条目的 guid、title 和 meta 字段：

```bash
jq '[.items[] | {guid: .guid, title: .title, meta: .meta}]' "$NEW_ITEMS_JSON"
```

基于提取的标题和 meta 快速判断不感兴趣的条目，将其归类为 `excluded`，其他条目归类为 `maybe`。

#### 第二步：深度分析（仅针对 maybe）

对于标记为 `maybe` 的条目，使用 Subagent 批量处理：

1. 使用 jq 读取条目的 `content` 字段（网页正文摘要）

2. 如果条目来自社交新闻平台且有 API 可以获取社区评论（比如 Hacker News），必须通过 API 获取条目前 10 条社区评论内容（禁止以效率为由跳过）

3. 综合分析后：
   - 判断最终分类：high_interest / interest / other / excluded
   - 如果 `TRANSLATE` 为 "true"，生成目标语言的标题和描述（见后文翻译格式说明）

### 当 FETCH_CONTENT="false" 时：仅基于标题筛选

#### 第一步：提取标题

使用 jq 从 NEW_ITEMS_JSON 文件中提取每个条目的 guid 和 title：

```bash
jq '[.items[] | {guid: .guid, title: .title}]' "$NEW_ITEMS_JSON"
```

#### 第二步：基于标题筛选

基于上一步提取的标题列表进行语义判断。如果条目总数超过 30 个，分多批处理（每批 25 个）。在分析过程中输出时，必须使用完整的原标题，不要简化或改写标题。

## 输出 JSON

### 1. 首次写入：创建 JSON 结构

在开始分析之前，首先创建包含 `source_name`、`source_url` 和空 `results` 的初始 JSON 结构：

```bash
cat > "$FILTER_RESULTS_JSON" <<'EOF'
{
  "source_name": "SOURCE_NAME 的值",
  "source_url": "SOURCE_URL 的值",
  "results": {}
}
EOF
```

### 2. 批次处理：追加结果

每分析完一批后，使用 jq 将该批次的结果追加到 `results` 对象中。例如：

```bash
jq '.results += {
  "guid-1": {
    "title": "条目标题",
    "type": "high_interest",
    "reason": "匹配原因"
  },
  "guid-2": {
    "title": "另一条目标题",
    "type": "interest",
    "reason": "匹配原因"
  }
}' "$FILTER_RESULTS_JSON" > "$FILTER_RESULTS_JSON.tmp" && mv "$FILTER_RESULTS_JSON.tmp" "$FILTER_RESULTS_JSON"
```

**字段说明**：
- `results` 的 key 是条目的 guid，value 包含筛选结果
- 包含**所有**条目的筛选结果
- `title` 字段：
  - 如果 `TRANSLATE` 为 "false"：使用条目的完整原标题，保持与原文完全一致
  - 如果 `TRANSLATE` 为 "true"：用 `PREFERRED_LANGUAGE` 概括文章核心内容和观点
    - 要自然，像新闻标题
    - **不要使用生硬的说法**：
      - ✗ "作者分享构建最小化 Coding Agent 的经验"
      - ✓ "从零构建 Coding Agent：最小化设计理念的实践"
  - 正确转义 JSON 特殊字符：英文双引号 `"` → `\"`，反斜杠 `\` → `\\`，换行符 → `\n`
- `description` 字段（可选）：
  - 如果 `TRANSLATE` 为 "true"，添加此字段，用 `PREFERRED_LANGUAGE` 总结内容
    - 包含内容：
      1. 文章主要内容和核心观点
      2. 社区讨论的主要观点和争议点（如果获取了评论）
    - 格式示例：
      ```
      <文章内容总结>

      社区讨论：
      - <讨论要点1>
      - <讨论要点2>
      ```
    - 所有内容必须通过真实抓取获得，不可以胡乱编造
- `type` 字段标识条目类型：
  - `"high_interest"`：强烈感兴趣
  - `"interest"`：一般感兴趣
  - `"other"`：其他主题（包括不感兴趣但与感兴趣主题相关性高的）
  - `"excluded"`：排除（强烈排除或不感兴趣且相关性低的）
- `reason` 格式："内容主题，属于 XX 主题"，可以列出多个匹配的主题
