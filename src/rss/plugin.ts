import pLimit from "p-limit";
import type { UngradedRssItem } from "../types";

export interface Plugin {
  name: string;
  processItem(item: UngradedRssItem): Promise<UngradedRssItem>;
}

async function loadPlugin(pluginName: string): Promise<Plugin> {
  try {
    // 尝试直接导入文件（如 builtin/fetch-content.ts）
    const module = await import(`./plugins/${pluginName}.ts`);
    return module.default as Plugin;
  } catch {
    // 回退到目录导入（如 cnbeta/index.ts）
    try {
      const module = await import(`./plugins/${pluginName}/index.ts`);
      return module.default as Plugin;
    } catch (error) {
      throw new Error(`无法加载插件 ${pluginName}: ${error}`);
    }
  }
}

export async function applyPlugins(
  items: UngradedRssItem[],
  pluginNames: string[],
  maxConcurrency = 10,
): Promise<UngradedRssItem[]> {
  if (pluginNames.length === 0) return items;

  for (const pluginName of pluginNames) {
    const plugin = await loadPlugin(pluginName);
    console.log(`应用插件: ${plugin.name}`);

    const limit = pLimit(maxConcurrency);

    items = await Promise.all(
      items.map((item, index) =>
        limit(async () => {
          try {
            return await plugin.processItem(item);
          } catch (error) {
            console.error(`处理 item ${index} 失败: ${error}`);
            return item;
          }
        }),
      ),
    );
  }

  return items;
}
