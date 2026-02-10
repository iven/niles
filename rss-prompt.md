# 任务：RSS 源筛选

从预处理的新条目中筛选符合兴趣的内容。

## 输入参数

首先**一次性**获取以下环境变量：

- `NEW_ITEMS_JSON`: 新条目 JSON 文件路径
- `FILTER_RESULTS_JSON`: 筛选结果输出文件路径

上方的 JSON 配置包含以下字段：
- `source_name`: 源名称
- `source_url`: 源 URL
- `global.high_interest`: 全局强烈感兴趣的主题（逗号分隔）
- `global.interest`: 全局一般感兴趣的主题（逗号分隔）
- `global.uninterested`: 全局不感兴趣的主题（逗号分隔）
- `global.exclude`: 全局强烈排除的主题（逗号分隔）
- `source.high_interest`: 源特定强烈感兴趣的主题（逗号分隔）
- `source.interest`: 源特定一般感兴趣的主题（逗号分隔）
- `source.uninterested`: 源特定不感兴趣的主题（逗号分隔）
- `source.exclude`: 源特定强烈排除的主题（逗号分隔）
- `global.preferred_language`: 首选语言（如 "zh", "en"）
- `fetch_content`: 是否已抓取网页内容
- `translate`: 是否需要翻译/总结

**主题合并规则**：
每个级别的主题 = 全局配置 + 源特定配置（都存在时合并）

## 筛选规则

理解文章内容，根据配置的兴趣主题，判断文章应该标记为 `high_interest`、`interest`、`other` 还是 `excluded`。不要简单匹配关键词，要理解文章实际在讲什么。

## 执行步骤

根据配置 JSON 中的 `fetch_content` 字段选择执行流程：

### 当 fetch_content=true 时：两阶段筛选

#### 第一步：快速筛选（基于标题和 Meta）

使用 jq 从 NEW_ITEMS_JSON 文件中提取每个条目的 guid、title 和 meta 字段：

```bash
jq '[.items[] | {guid: .guid, title: .title, meta: .meta}]' "$NEW_ITEMS_JSON"
```

基于提取的标题和 meta 快速判断不感兴趣的条目，将其归类为 `excluded`，其他条目归类为 `maybe`。

#### 第二步：深度分析（仅针对 maybe）

对于标记为 `maybe` 的条目，**为每个条目启动一个 Subagent 进行深度分析**，最多同时启动 10 个 Subagent：

1. 使用 jq 读取该条目的 `content` 字段：
   ```bash
   jq --arg guid "{条目的guid}" '.items[] | select(.guid == $guid) | .content' "$NEW_ITEMS_JSON"
   ```

2. 如果条目来自社交新闻平台且有 API 可以获取社区评论，必须通过 API 获取该条目的评论内容用于分析（禁止以效率为由跳过）
   - 根据条目的 URL 判断来源平台，选择合适的 API
   - 例如 Hacker News 可使用 `https://hn.algolia.com/api/v1/items/{id}`（`.children` 字段包含完整评论树）
   - **至少分析 10 条评论**，根据评论内容的相关性和信息量，决定是否需要解析更深层的嵌套评论

3. 综合分析后：
   - 判断最终分类：high_interest / interest / other / excluded
   - 如果配置 JSON 中 `translate` 为 true，生成目标语言的标题和描述（见后文翻译格式说明）

### 当 fetch_content=false 时：仅基于标题筛选

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
  "source_name": "配置 JSON 中的 source_name",
  "source_url": "配置 JSON 中的 source_url",
  "results": {}
}
EOF
```

### 2. 追加结果

每分析完一批后，使用 jq 将结果追加到 `results` 对象中。例如：

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
  - 如果配置 JSON 中 `translate` 为 false：使用条目的完整原标题，保持与原文完全一致
  - 如果配置 JSON 中 `translate` 为 true：用配置中的 `global.preferred_language` 概括文章核心内容和观点
    - 要自然，像新闻标题
    - **不要使用生硬的说法**：
      - ✗ "作者分享构建最小化 Coding Agent 的经验"
      - ✓ "从零构建 Coding Agent：最小化设计理念的实践"
  - 正确转义 JSON 特殊字符：英文双引号 `"` → `\"`，反斜杠 `\` → `\\`，换行符 → `\n`
- `description` 字段（可选）：
  - 如果配置 JSON 中 `translate` 为 true，添加此字段，用配置中的 `global.preferred_language` 总结内容
    - **内容结构要求**（300-500 字）：
      - 使用 3-5 个 `<h3>` 小标题组织内容，每个小标题下 2-4 个 `<p>` 段落
      - 每个段落 3-5 句话，包含具体细节和技术信息
      - 涵盖：背景介绍、核心观点、技术细节、实现方法、应用场景等
      - 如果有数据、代码、架构等技术内容，要具体展开说明
      - **社区讨论内容自然融入各段落中**，使用"社区指出"、"批评者认为"、"支持者则认为"、"有评论提到"等表述
      - 不要只写概括性语句，要有实质性的内容展开
    - **格式示例**：
      ```html
      <h3>小标题1</h3>
      <p>第一段内容，3-5句话展开技术细节。</p>
      <p>第二段继续深入，可融入社区观点："批评者指出X问题，支持者则认为Y优势更重要。"</p>

      <h3>小标题2</h3>
      <p>继续其他方面的展开...</p>
      ```
    - **重要**：所有内容必须通过真实抓取获得，不可以胡乱编造
- `type` 字段标识条目类型：
  - `"high_interest"`：强烈感兴趣
  - `"interest"`：一般感兴趣
  - `"other"`：其他主题（包括不感兴趣但与感兴趣主题相关性高的）
  - `"excluded"`：排除（强烈排除或不感兴趣且相关性低的）
- `reason` 格式："内容主题，属于 XX 主题"，可以列出多个匹配的主题
