# Plugin Context 注入

## 背景

当前 `grade` 和 `select` 逻辑硬编码在 `workflow.ts` 中，无法作为插件使用。根本原因是：

1. 类型区分：`UngradedFeedItem` 和 `GradedFeedItem` 是两个类型，grade 插件无法符合 `processItem` 的签名
2. 能力缺失：grade 插件需要调用 LLM，但插件接口没有提供这个能力

## 目标

将 `grade`、`select`、`summarize` 也实现为插件，与 collect/report 统一。

## 类型变更

合并 `UngradedFeedItem` 和 `GradedFeedItem` 为单一类型 `FeedItem`，`graded` 字段删除，`level` 不再可选，初始值为 `"unknown"`：

```typescript
type FeedItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
  extra: Record<string, unknown>;
  level: "critical" | "recommended" | "optional" | "rejected" | "unknown";
  reason?: string;
};
```

## 插件接口

`processItem`（逐条）合并为 `processItems`（批量），插件内部自行决定是否逐条处理：

```typescript
interface Plugin {
  collect(options: Record<string, unknown>, context: PluginContext): Promise<{ title?: string; items: FeedItem[] }>;
  processItems(items: FeedItem[], options: Record<string, unknown>, context: PluginContext): Promise<FeedItem[]>;
  report(items: FeedItem[], options: Record<string, unknown>, context: PluginContext): Promise<void>;
}
```

执行顺序完全由 config 中 plugins 列表的顺序决定，workflow 依次调用每个插件的 `processItems`。

## PluginContext

```typescript
interface PluginContext {
  sourceName: string;
  isDryRun: boolean;
  llm(tier: "fast" | "balanced" | "powerful"): LlmClient;
}
```

- `sourceName`：供插件生成约定路径（如 `output/${sourceName}-processed.json`）
- `isDryRun`：供插件调整行为（如 select 插件固定取 3 条）
- `llm`：工厂函数，插件传入 tier 获取对应 client

`logger` 不放入 context，插件继续直接 import 使用。

## level 语义

条目的 `level` 初始为 `"unknown"`，经过两个阶段：

1. **`builtin/select` 插件**：保留的条目维持 `"unknown"`，被去除的改为 `"rejected"`
2. **`builtin/llm-grade` 插件**：对所有 `"unknown"` 条目调用 LLM 打分，输出 `critical`/`recommended`/`optional`/`rejected`

`builtin/summarize` 插件跳过 `level === "rejected"` 的条目，其余条目调用 LLM 生成结构化结果（包含 `title`、`description`、`rejected` 字段）。若 LLM 返回 `rejected: true`，插件直接将该条目 level 设为 `"rejected"`；否则更新 `title`/`description` 并将 `level` 重置为 `"unknown"`，供后续 `builtin/llm-grade` 重新打分（regrade）。

`[NILES_REJECTED]` 字符串标记废弃，不再需要。

## config 结构变更

`global` 字段删除（`timeout` 未实际使用，一并删除）。新增顶层 `plugins` 字段作为插件全局默认 options，source 里的插件 options 追加或覆盖：

```json
{
  "llm": {
    "provider": "anthropic",
    "models": {
      "fast": "claude-haiku-4-5",
      "balanced": "claude-sonnet-4-5",
      "powerful": "claude-opus-4-5"
    }
  },
  "plugins": {
    "builtin/select": { "maxItems": 20, "minItems": 5 },
    "builtin/llm-grade": {
      "high_interest": "...",
      "interest": "...",
      "uninterested": "...",
      "avoid": "..."
    },
    "builtin/summarize": {
      "preferred_language": "zh-CN"
    }
  },
  "sources": [ ... ]
}
```

source config 里的 `high_interest`/`interest`/`uninterested`/`avoid`/`context`/`summarize`/`regrade`/`timeout` 字段全部删除，改为在对应插件的 options 里配置。

## 典型 source 配置示例

```json
{
  "name": "hacker-news",
  "plugins": [
    { "name": "builtin/collect-rss", "options": { "url": "https://hnrss.org/best" } },
    "builtin/fetch-meta",
    "builtin/fetch-content",
    "hacker-news",
    { "name": "builtin/select", "options": { "maxItems": 15 } },
    { "name": "builtin/llm-grade", "options": { "context": "Hacker News 是一个技术社区..." } },
    "builtin/summarize",
    "builtin/llm-grade",
    { "name": "builtin/reporter-rss", "options": { "outputPath": "output/hacker-news.xml" } }
  ]
}
```

## 实施影响

- `processItem` 改名为 `processItems`，签名从逐条变为批量
- `basePlugin` 的三个 noop 方法签名同步更新
- 所有现有插件签名需要更新（即使不使用 `context`）
- `grade.ts` 迁移为 `builtin/llm-grade` 插件
- `summarize.ts` 迁移为 `builtin/summarize` 插件
- `selectItems` 迁移为 `builtin/select` 插件
- `builtin/select` dry run 时忽略 options，固定 maxItems/minItems 为 3
- `config.json` 大幅重构：删除 `global`，新增顶层 `plugins`，source 级兴趝字段移入插件 options
