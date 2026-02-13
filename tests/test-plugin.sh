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
PLUGIN_FILE="$PROJECT_ROOT/scripts/plugins/${PLUGIN_NAME}.py"
if [ ! -f "$PLUGIN_FILE" ]; then
    echo "错误: 插件 '$PLUGIN_NAME' 不存在" >&2
    echo "插件文件路径: $PLUGIN_FILE" >&2
    exit 1
fi

# 创建临时目录和文件
TEMP_DIR="/tmp/niles-plugin-test"
mkdir -p "$TEMP_DIR"
OUTPUT_FILE="$TEMP_DIR/${PLUGIN_NAME}-$(date +%s).json"

# 创建测试 Python 脚本
TEST_SCRIPT="$TEMP_DIR/test_${PLUGIN_NAME}.py"
cat > "$TEST_SCRIPT" << 'PYTHON_EOF'
#!/usr/bin/env python3
import json
import sys

sys.path.insert(0, sys.argv[1])

plugin_name = sys.argv[2]
url = sys.argv[3]
output_file = sys.argv[4]

# 动态导入插件
plugin = __import__(plugin_name)

# 创建测试条目
test_item = {
    'title': 'Test Item',
    'link': url,
    'description': 'Test description'
}

# 执行插件
result = plugin.process_item(test_item)

# 写入结果
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(result, f, indent=2, ensure_ascii=False)
PYTHON_EOF

# 执行测试
echo "正在测试插件 '$PLUGIN_NAME'..."
echo "URL: $URL"
echo ""

uv run --with httpx --with beautifulsoup4 python "$TEST_SCRIPT" \
    "$PROJECT_ROOT/scripts/plugins" \
    "$PLUGIN_NAME" \
    "$URL" \
    "$OUTPUT_FILE"

echo ""
echo "查看完整结果:"
echo "  cat $OUTPUT_FILE"
