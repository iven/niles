#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

source "$SCRIPT_DIR/lib/common.sh"

# 默认参数
PLUGIN_NAME=""
URL=""

# 解析参数
show_usage() {
    cat << EOF
Usage: $(basename "$0") <plugin_name> <url>

Test a plugin by processing a URL and outputting results to a temporary JSON file.

Arguments:
    plugin_name    Name of the plugin (e.g., fetch_content, fetch_meta)
    url            URL to process

Example:
    $(basename "$0") fetch_content https://www.phoronix.com/news/Linux-Drops-Old-440BX-EDAC
EOF
}

if [ $# -lt 2 ]; then
    show_usage
    exit 1
fi

PLUGIN_NAME="$1"
URL="$2"

# 检查插件是否存在
PLUGIN_FILE="$PROJECT_ROOT/src/plugins/${PLUGIN_NAME}.ts"
if [ ! -f "$PLUGIN_FILE" ]; then
    echo "错误: 插件 '$PLUGIN_NAME' 不存在" >&2
    echo "插件文件路径: $PLUGIN_FILE" >&2
    exit 1
fi

# 创建临时目录和文件
TEMP_DIR="/tmp/niles-plugin-test"
mkdir -p "$TEMP_DIR"
OUTPUT_FILE="$TEMP_DIR/${PLUGIN_NAME}-$(date +%s).json"

# 执行测试
echo "正在测试插件 '$PLUGIN_NAME'..."
echo "URL: $URL"
echo ""

cd "$PROJECT_ROOT"

# 创建临时测试脚本并执行
bun --eval "
import { loadPlugin } from './src/lib/plugin.ts';

const pluginName = '$PLUGIN_NAME';
const url = '$URL';
const outputFile = '$OUTPUT_FILE';

const testItem = {
  title: 'Test Item',
  link: url,
  pubDate: new Date().toISOString(),
  description: 'Test description',
  guid: url,
};

const plugin = await loadPlugin(pluginName);
const result = await plugin.processItem(testItem);

await Bun.write(outputFile, JSON.stringify(result, null, 2));
"

echo ""
echo "查看完整结果:"
echo "  cat $OUTPUT_FILE"
