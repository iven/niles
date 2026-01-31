# 任务：讨论聚合源抓取

你需要从讨论聚合类网站（如 Hacker News、Reddit 等）抓取内容并生成 RSS。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称
- `SOURCE_URL`: 源 URL 或 API 地址
- `TOP_ITEMS`: 抓取前 N 条热门帖子
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 获取帖子列表

根据 SOURCE_URL 判断网站类型，使用适当的方法获取前 TOP_ITEMS 条热门帖子。

需要提取的信息：
- 标题
- 原文链接
- 讨论页面链接
- 分数/热度
- 作者
- 发布时间
- 评论数量

### 2. 基于标题 AI 筛选

遵循 `prompts/common/filtering.md` 中定义的筛选规则。

### 3. 抓取原文和评论

对每个筛选通过的帖子：
- 访问原文链接，提取主要内容
- 访问讨论页面，获取评论内容
  - 优先抓取顶层评论和高分评论

### 4. 生成摘要

为每个帖子生成：
- **原文摘要**：200-300 字，保留核心观点
- **讨论摘要**：200-300 字，总结热门评论的主要观点和争议点

**重要**：所有摘要内容必须使用中文书写。

### 5. 生成 RSS

遵循 `prompts/common/incremental-update.md` 中定义的增量更新策略。

遵循 `prompts/common/rss-format.md` 中定义的基础格式。

输出到 `output/SOURCE_NAME.xml`。

**条目内容（`<item>`）：**

```xml
<item>
  <title>文章标题</title>
  <link>原文链接</link>
  <pubDate>2026-01-31T07:15:00Z</pubDate>
  <guid>讨论页面链接</guid>

  <description><![CDATA[
    <h3>原文摘要</h3>
    <p>...</p>

    <h3>讨论摘要</h3>
    <p>...</p>

    <p><a href="讨论链接">查看讨论 (评论数)</a></p>
  ]]></description>

  <content:encoded><![CDATA[
    <h2>原文摘要</h2>
    <p>...</p>

    <h2>讨论摘要</h2>
    <p>...</p>

    <hr/>
    <p><strong>原文链接：</strong><a href="原文链接">原文链接</a></p>
    <p><strong>讨论链接：</strong><a href="讨论链接">讨论链接</a> (评论数, 分数)</p>
  ]]></content:encoded>
</item>
```
