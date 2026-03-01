# Niles 开发指南

## 项目简介

Niles 是一个智能 RSS 新闻聚合器，使用 AI 根据个人兴趣自动筛选和聚合新闻内容。

**核心功能**：
- 插件化流水线：每个 source 通过 `plugins` 列表自由组合 collect / processItems / report 步骤。
- 基于 4 级兴趣层次（`critical / recommended / optional / rejected`）自动过滤内容（`builtin/llm-grade`）。
- 可选的深度分析模式：生成结构化总结后重新分级（`builtin/llm-summarize` + `builtin/llm-grade`）。
- 多 AI provider 支持：使用 Tanstack AI 支持 Anthropic、OpenAI、Gemini、OpenRouter、Grok。
- RSSHub 支持：使用 RSSHub npm 库在本地运行，不依赖官方网站。
- 使用 GitHub Actions cron 自动调度执行，GitHub Pages 托管输出。

## 架构概览

### 目录结构

```
.
├── bin/
│   └── cli.ts                      # CLI 入口
├── src/
│   ├── workflow.ts                 # 主工作流逻辑
│   ├── types.ts                    # 类型定义（FeedItem）
│   ├── plugin.ts                   # 插件接口、加载器、PluginContext
│   ├── lib/
│   │   ├── llm.ts                  # LLM 客户端
│   │   ├── config.ts               # 配置加载
│   │   └── guid-tracker.ts         # GUID 跟踪
│   └── plugins/
│       ├── builtin/                # 内置通用插件
│       │   ├── collect-rss.ts      # 获取 RSS/Atom feed
│       │   ├── collect-rsshub.ts   # 获取 RSSHub 路由
│       │   ├── deduplicate.ts      # GUID 去重（pipeline 前置）
│       │   ├── limit-items.ts      # 数量控制（pipeline 前置）
│       │   ├── clean-text.ts       # 清理零宽字符和空白（pipeline 前置）
│       │   ├── fetch-content.ts    # 获取网页内容
│       │   ├── fetch-meta.ts       # 获取 meta 描述
│       │   ├── llm-grade.ts        # LLM 分级
│       │   ├── llm-summarize.ts    # LLM 总结
│       │   └── reporter-rss.ts     # 输出 RSS 文件
│       ├── cnbeta/                 # cnBeta 网站插件
│       ├── hacker-news/            # Hacker News 插件
│       └── zaihuapd/               # 在花频道插件
├── .github/workflows/
│   └── fetch-rss.yml               # GitHub Actions workflow
└── config.json                     # 配置文件
```

### 工作流程

`workflow.ts` 按以下顺序执行：

1. **collect**：source `plugins` 列表中所有插件的 `collect()` 并行执行，合并结果得到原始条目列表。
2. **processItems（前置）**：`deduplicate → limit-items → clean-text` 硬编码在 `workflow.ts` 中，对所有 source 统一前置执行。
3. **processItems（source）**：source `plugins` 列表中所有插件的 `processItems()` 串行执行。
4. **report**：source `plugins` 列表中所有插件的 `report()` 串行执行（仅非 dry-run 模式）。

典型的插件执行顺序（以 hacker-news 为例）：
```
collect-rss → deduplicate → limit-items → clean-text
→ fetch-meta → fetch-content → hacker-news → llm-grade → llm-summarize → llm-grade → reporter-rss
```

### 输出文件

推送到 gh-pages 分支：
- `{source-name}.xml` — RSS 文件（由 `builtin/reporter-rss` 插件生成）
- `{source-name}-processed.json` — GUID 历史记录（由 `builtin/deduplicate` 插件维护）

### 核心组件

**插件接口**（`src/plugin.ts`）：
- 所有插件实现三个可选方法：`collect()`、`processItems()`、`report()`，未覆盖的方法使用 `basePlugin` 的空实现。
- `PluginContext`：注入 `sourceName`、`sourceContext`（source 级别的上下文说明）、`isDryRun`、`llm(tier)` 工厂函数。
- `llm(tier)` 接受 `"fast" | "balanced" | "powerful"` 三个等级，对应 `config.json` 中 `llm.models` 的同名字段，同一插件可多次调用不同 tier。

**条目类型**（`src/types.ts`）：
- `FeedItem`：统一类型，`level` 字段初始为 `"unknown"`，经 `deduplicate`、`limit-items`、`llm-grade` 等插件更新为 `critical / recommended / optional / rejected`。

**GUID 跟踪**（`src/lib/guid-tracker.ts`）：
- `builtin/deduplicate` 插件使用，记录已处理的 GUID，避免重复处理动态排名 RSS 中的旧条目。
- 自动清理超过 4 天的历史记录。

## 设计原则

### 配置管理

- 单一配置源：`config.json`，使用 Zod schema 验证。
- LLM 配置（`llm` 字段）：
  - `provider`：AI provider 类型（anthropic、openai、gemini、openrouter、grok）。
  - `baseUrl`：可选，自定义 API 端点。
  - `models`：按能力等级配置模型名称，包含 `fast`、`balanced`、`powerful` 三个字段。
  - API key 通过环境变量提供（如 `ANTHROPIC_API_KEY`、`OPENAI_API_KEY`）。
- 顶层 `plugins` 字段：为插件提供全局默认 options，source 内同名插件的 options 会覆盖（合并）全局值。
- Source 配置字段：`name`、`title`、`context`、`plugins`。`context` 为 source 级别的背景说明，注入到 `PluginContext.sourceContext`，供所有插件共享；插件级别的 `options.context` 为额外补充，两者会合并传给 LLM。
- 关键词列表使用紧凑格式，逗号分隔，中英文之间不加空格（如：`3A游戏,微软Copilot`）。
- `builtin/llm-grade` 的全局兴趣关键词使用 `global` 前缀（如 `globalHighInterest`），source 级别关键词不加前缀（如 `highInterest`），两者均可在同一 options 对象中共存，LLM 会综合权衡，source 级别权重更高。
- RSSHub 支持：项目使用 RSSHub 的 npm 库在本地运行，不访问 RSSHub 官方网站。`builtin/collect-rsshub` 的 `route` 字段使用 RSSHub 路由格式（如 `/zhihu/hot`）。
- GitHub Actions 每 1 小时执行所有源。


## 开发工作流

### 本地测试

```bash
# 运行所有单元测试
bun test

# 测试单个 source（会调用 LLM API，需用户明确指示）
bun run niles <source-name>

# 使用自定义配置文件
bun run niles <source-name> --config config.json
```

### Token 消耗操作

**严格禁止主动执行消耗 Token 的操作**。

以下操作会调用 LLM API 并消耗 token，**必须**在用户明确指示后才能执行：

1. 执行 `bun run niles <source-name>`（包括带 `--dry-run` 的命令）
2. 触发 GitHub Actions workflow（`gh workflow run`）

**重要**：
- Dry-run 模式同样会调用 LLM API 并消耗 token，不是免费的测试。
- 即使用户说「测试」「验证」，也必须先询问确认，不能自行执行。
- 只有当用户明确说「执行」「运行」「run」等词时才能执行。

### 代码检查

完成改动并 `git add` 后，运行 `prek run` 对 staged 文件执行全量检查（biome、typecheck、knip 等）：

```bash
git add <files>
prek run
```

也可以单独运行各项检查：

```bash
bun run typecheck   # 类型检查
bun run check       # 代码风格检查和格式化
bun run knip        # 检查未使用的代码、依赖和导出
```

### 手动触发 workflow

**禁止自动触发 workflow**，除非用户明确说明（如「run workflow」「trigger workflow」）。触发时禁止自行添加 `--dry-run` 参数，除非用户明确要求。

使用 `gh workflow run` 触发 workflow。

```bash
# 正常执行（会推送到 gh-pages）
gh workflow run fetch-rss.yml

# Dry run 模式（不推送到 gh-pages，固定抓取 3 条用于测试）
gh workflow run fetch-rss.yml -f dry-run=true

# 在非默认分支测试（需要指定 --ref）
gh workflow run fetch-rss.yml --ref your-branch-name -f dry-run=true
```

**参数说明**：
- `-f dry-run=true`：启用 dry run 模式，不推送到 gh-pages，固定抓取 3 条
- `--ref`：指定运行 workflow 的分支（默认使用当前分支或仓库默认分支）

### 添加新插件

1. 在 `src/plugins/` 下创建网站目录（如 `example/index.ts`），或在 `builtin/` 目录创建通用插件（如 `builtin/example.ts`）。
2. 导出默认对象，继承 `basePlugin`，按需覆盖 `collect`、`processItems`、`report` 方法。
   - `processItems(items: FeedItem[], options, context): Promise<FeedItem[]>`：接收完整条目列表，返回处理后的完整列表。
   - 额外数据存储在 `item.extra` 字段中。
3. 编写单元测试（`index.test.ts` 或 `plugin-name.test.ts`）。
4. 在 `config.json` 中对应 source 的 `plugins` 列表里引用：网站插件用 `"example"`，内置插件用 `"builtin/plugin_name"`。

### 修改配置结构

1. 更新 `src/lib/config.ts` 中的 Zod schema。
2. 更新 `config.json`。
3. 运行类型检查：`bun run typecheck`。
4. 更新所有使用该配置的代码。

## 代码规范

### 编码风格

修改文件时必须先阅读现有内容，严格遵照原有的代码/行文风格。

**关键原则**：更详细 ≠ 更有帮助。如果现有内容是简洁的，新增内容也必须简洁。

### TypeScript 类型规范

**严格禁止使用 `any` 和 `unknown` 类型**。

- 必须为所有变量、函数参数、返回值提供明确的类型定义。
- 如果不知道某个类型，应该先查阅官方文档，不到万不得已不要查看源代码。
- 使用 `bun run typecheck` 确保类型检查通过。

### Git 操作

**严格禁止主动提交和推送代码**。

`git commit`、`git commit --amend`、`git push` 均属于破坏性操作，只有用户明确说出对应指令时才能执行。完成代码修改后，必须停下来等待用户确认修改符合要求，不得因为用户之前说过「commit and push」，就认为主动执行 commit 是正确的。

### Commit Message

所有 commit message 使用英文编写：

- 首字母大写，使用祈使句。
- 简洁描述改动内容。
- 常用动词：`Add`、`Update`、`Fix`、`Remove`、`Refactor`、`Improve` 等。

示例：
```
Add documentation and refine filtering workflow
Fix shell syntax error in Generate RSS step
Improve RSS workflow and prompt
```
