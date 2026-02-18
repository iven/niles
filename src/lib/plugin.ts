import pLimit from 'p-limit';

export interface RssItem {
  title: string;
  link: string;
  pubDate: string;
  description: string;
  guid: string;
  extra?: Record<string, unknown>;
}

export interface Plugin {
  name: string;
  processItem(item: RssItem): Promise<RssItem>;
}

export async function loadPlugin(pluginName: string): Promise<Plugin> {
  try {
    const module = await import(`../plugins/${pluginName}.ts`);
    return module.default as Plugin;
  } catch (error) {
    throw new Error(`无法加载插件 ${pluginName}: ${error}`);
  }
}

export async function applyPlugins(
  items: RssItem[],
  pluginNames: string[],
  maxConcurrency = 10
): Promise<RssItem[]> {
  if (pluginNames.length === 0) return items;

  for (const pluginName of pluginNames) {
    try {
      const plugin = await loadPlugin(pluginName);
      console.error(`应用插件: ${plugin.name}`);

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
          })
        )
      );
    } catch (error) {
      console.error(`插件 ${pluginName} 执行失败: ${error}`);
    }
  }

  return items;
}
