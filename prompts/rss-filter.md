# 任务：RSS 源筛选

你需要从 RSS feed 读取内容并根据兴趣筛选。

## 输入参数（环境变量）

- `SOURCE_NAME`: 源名称
- `SOURCE_URL`: RSS feed URL
- `INTERESTS_TOPICS`: 感兴趣的主题（逗号分隔）
- `INTERESTS_EXCLUDE`: 排除的主题（逗号分隔）

## 执行步骤

### 1. 读取 RSS feed

访问 SOURCE_URL，解析 RSS 内容，获取所有条目。

### 2. 基于标题 AI 筛选

遵循 `prompts/common/filtering.md` 中定义的筛选规则。

### 3. 生成 RSS

遵循 `prompts/common/incremental-update.md` 中定义的增量更新策略。

遵循 `prompts/common/rss-format.md` 中定义的基础格式。

输出到 `output/SOURCE_NAME.xml`。

**条目内容（`<item>`）：**

保留原始 RSS feed 的内容：
```xml
<item>
  <title>原始标题</title>
  <link>原始链接</link>
  <pubDate>原始发布时间</pubDate>
  <description>原始描述</description>
</item>
```
