# 将 Niles 改造为使用 Tanstack AI 支持多 Provider

## 概述

将 Niles 从依赖 Claude Code CLI 改造为使用 Tanstack AI 库直接调用 AI API，支持多个 AI provider（Anthropic、OpenAI、Gemini 等）。

## 背景

当前 Niles 通过 Claude Code CLI 的 agent 系统（`.claude/agents/*.md`）和 skill 系统来调用 AI。这种方式：
- 仅支持 Claude API
- 依赖外部 CLI 工具
- 用户无法选择其他 AI provider

改造后，Niles 将成为一个独立的 TypeScript 应用，使用 Tanstack AI 库直接调用各种 AI provider 的 API。

## 技术方案

### 配置文件

在 `config.json` 中新增 `ai` 字段：

```json
{
  "llm": {
    "provider": "anthropic",
    "baseURL": "https://api.anthropic.com",
    "models": {
      "grade": "claude-3-5-haiku-20241022",
      "summarize": "claude-3-5-sonnet-20241022"
    }
  },
  "global": { ... },
  "sources": [ ... ]
}
```

**字段说明**：
- `provider`: AI provider 类型（anthropic、openai、gemini、openrouter、grok）
- `baseURL`: 可选，自定义 API 端点（目前仅 OpenAI 支持）
- `models`: 各任务使用的模型名称

### 环境变量

API key 使用 provider 特定的环境变量命名：
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- `GEMINI_API_KEY`
- 等

### 架构改造

**当前架构**：
```
fetch-rss-items.ts → Claude Code CLI (agents/skills) → generate-rss.ts
```

**改造后架构**：
```
bin/cli.ts (薄壳入口) → src/index.ts (主流程)
  ├─ fetch (提取 RSS)
  ├─ plugin (应用插件)
  ├─ grade (AI 分级)
  ├─ summarize (可选，AI 总结)
  ├─ grade (可选，二次分级)
  └─ generate (生成 RSS)
```

### 数据流设计

**items.json 结构调整**：
- 生成时预留 `type` 和 `reason` 字段（初始值为 `null`）
- 统一 schema，无需后期添加字段

**预处理与后处理**：
- 预处理：TypeScript 提取必要数据，准备 prompt
- AI 调用：分析数据，调用工具写入结果
- 后处理：TypeScript 合并数据、写入文件

### AI 工具设计

#### Grade 工具

**工具名称**: `write_grade_results`

**参数**:
```typescript
{
  items: Array<{
    guid: string,
    type: "high_interest" | "interest" | "other" | "exclude",
    reason: string
  }>
}
```

**实现逻辑**:
1. 读取原始 items.json
2. 根据 guid 匹配每个 item
3. 更新该 item 的 `type` 和 `reason` 字段
4. 写入输出文件

**返回值**（成功）:
```typescript
{
  success: true,
  itemsProcessed: 10,
  breakdown: {
    high_interest: 3,
    interest: 4,
    other: 2,
    exclude: 1
  }
}
```

#### Summarize 工具

**工具名称**: `write_summary`

**参数**:
```typescript
{
  guid: string,
  title: string,
  description: string
}
```

**实现逻辑**:
1. 接收 AI 返回的参数
2. TypeScript 计算 guid 的 MD5 hash
3. 写入 `OUTPUT_DIR/items/{hash}.json`

**返回值**（成功）:
```typescript
{
  success: true,
  guid: "...",
  outputPath: "items/abc123.json"
}
```

### 错误处理

**分类处理**：

1. **文件系统/基础设施错误**（直接抛异常，终止流程）：
   - 文件权限错误
   - 磁盘空间不足
   - 网络错误
   - 配置错误

2. **数据/逻辑错误**（返回详细错误给 AI，允许重试）：
   - guid 不存在
   - type 值非法
   - 必需字段缺失

**错误返回格式**:
```typescript
{
  success: false,
  error: "Invalid grade results",
  details: {
    invalidItems: [
      {
        guid: "...",
        issues: [
          {
            field: "type",
            value: "very_interested",
            reason: "Must be one of: high_interest, interest, other, exclude"
          }
        ]
      }
    ],
    validItemsCount: 8,
    totalItemsExpected: 10
  }
}
```

**重试机制**：AI 最多重试 3 次

### 并行执行

深度分析模式下，使用 `Promise.all` 并行启动多个独立的 AI 会话：

```typescript
const summaries = await Promise.all(
  guids.map(guid => {
    return chat({
      adapter: ...,
      messages: [...],
      tools: [writeSummaryTool],
      ...
    })
  })
)
```

### Prompt 管理

- Prompt 写在代码中作为字符串模板
- 保留当前 agent 的核心逻辑（分级规则、输出要求等）
- 移除与工具调用相关的指令（jq、验证等，由 TypeScript 处理）

### 保持不变的部分

- **插件系统**：完全保持不变
- **GUID 跟踪**：保持不变
- **配置文件其他字段**：global、sources 等保持不变

### 测试策略

1. **新增 TypeScript 测试**：
   - 单元测试：AI 配置、工具函数、数据处理
   - 集成测试：Mock AI 响应，测试完整流程

2. **保留现有测试**：
   - 保留 `tests/*.sh` 脚本
   - 作为端到端验证

### 目录结构

```
bin/
  cli.ts                  # 薄壳入口，只调用 src/index.ts

src/
  index.ts                # 主流程逻辑
  grade.ts                # 业务逻辑：分级
  summarize.ts            # 业务逻辑：总结
  tools.ts                # 业务逻辑：AI 工具
  tools.test.ts           # 单元测试
  plugin.ts               # 业务逻辑：插件系统
  types.ts                # 业务类型定义
  lib/                    # 可复用的库组件
    llm.ts                # LLM 客户端初始化 (createLLMClient)
    config.ts             # 配置加载器
    config.test.ts        # 单元测试
    guid-tracker.ts       # GUID 跟踪器
  plugins/                # 插件实现（保持不变）
    fetch_meta.ts
    fetch_content.ts
    cnbeta_fetch_content.ts
    hn_fetch_comments.ts
    zaihuapd_clean_description.ts

tests/
  integration.test.ts     # 集成测试

tests.bak/                # 备份的旧 shell 测试脚本
```

## 实现步骤

1. **配置系统**
   - 更新配置 schema，添加 `llm` 字段
   - 实现配置读取和验证
   - 实现 LLM client 初始化（根据 provider 创建 adapter）

2. **工具系统**
   - 实现 `write_grade_results` 工具
   - 实现 `write_summary` 工具
   - 实现错误处理和返回值

3. **Grade 逻辑**
   - 提取当前 filter agent 的核心 prompt
   - 实现 grade 函数（调用 AI + 工具）
   - 处理工具返回和重试

4. **Summarize 逻辑**
   - 提取当前 summarize agent 的核心 prompt
   - 实现 summarize 函数（调用 AI + 工具）
   - 实现并行执行

5. **主流程编排**
   - 整合 fetch、plugin、grade、summarize、generate
   - 实现 `src/index.ts` 主逻辑
   - 实现 `bin/cli.ts` 薄壳入口
   - 处理简单模式和深度分析模式

6. **测试**
   - 编写单元测试
   - 编写集成测试
   - 验证现有 bash 测试仍可运行

7. **GitHub Actions 更新**
   - 更新 workflow，移除 Claude Code Action
   - 直接调用 `bun run bin/cli.ts`（或通过 npm script: `bun run niles`）
   - 配置 API key 环境变量

8. **文件重命名**
   - 重命名相关文件：`filter-results.json` → `grade-results.json`
   - 更新 schema 文件名
   - 更新所有引用

## 验收标准

- [ ] 支持配置多个 AI provider
- [ ] 环境变量正确读取 API key
- [ ] Grade 和 Summarize 功能正常
- [ ] 简单模式和深度分析模式都能正常工作
- [ ] 并行处理多个 item
- [ ] 错误处理和重试机制正常
- [ ] 插件系统继续工作
- [ ] GitHub Actions 可以正常运行
- [ ] 测试通过
- [ ] 文件命名统一使用 grade

## 注意事项

- 不再依赖 Claude Code CLI
- 不再使用 `.claude/agents/*.md` 和 `.claude/skills/*.md`
- 配置文件中的 AI 配置全局统一，不在 source 层面覆盖
- 弱化 "agent" 概念，只是数据处理流水线的一部分
- Prompt 保持简洁，移除工具使用示例（bash、jq 等）
- 统一使用 `grade` 命名替代 `filter`
