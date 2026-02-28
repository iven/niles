# Plugin Context 注入

## 背景

当前 `grade` 和 `select` 逻辑硬编码在 `workflow.ts` 中，无法作为插件使用。根本原因是：

1. 类型区分：`UngradedRssItem` 和 `GradedRssItem` 是两个类型，grade 插件无法符合 `processItem` 的签名
2. 能力缺失：grade 插件需要调用 LLM，但插件接口没有提供这个能力

## 目标

将 `grade` 和 `select` 也实现为插件，与 collect/transform/report 统一。

## 类型变更

合并 `UngradedRssItem` 和 `GradedRssItem` 为单一类型，`level`/`reason` 变为可选字段：

```typescript
type RssItem = {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
  extra: Record<string, unknown>;
  level?: "critical" | "recommended" | "optional" | "rejected";
  reason?: string;
};
```

## PluginContext

在插件接口的所有方法中加入 `context` 参数，主程序负责构造并注入：

```typescript
interface PluginContext {
  llm(model: string): LlmClient;
}

interface Plugin {
  collect(options: Record<string, unknown>, context: PluginContext): Promise<{ title?: string; items: RssItem[] }>;
  processItem(item: RssItem, options: Record<string, unknown>, context: PluginContext): Promise<RssItem>;
  report(items: RssItem[], options: Record<string, unknown>, context: PluginContext): Promise<void>;
}
```

`llm` 是一个工厂函数，插件传入 model 名称获取对应 client，model 名称可通过 `options` 配置，默认值由插件自身决定。

`logger` 不放入 context，插件继续直接 import 使用。

## 实施影响

- `applyTransform` 和 workflow 里的循环需要传入 `context`
- `basePlugin` 的三个 noop 方法签名同步更新
- 现有插件（collect-rss、clean-text 等）不使用 `context`，但签名需要更新
- `grade.ts` 和 `selectItems` 逻辑迁移为独立插件
