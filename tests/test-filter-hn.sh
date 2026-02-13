#!/bin/bash
set -e

source "$(dirname "$0")/lib/common.sh"

init_paths
parse_mode "$1"

# 测试 hacker-news
echo "=== 测试 hacker-news filter ($([ -z "$MODE" ] && echo "interactive" || echo "print") mode) ==="
setup_test_env "$PROJECT_DIR/tests/fixtures/hacker-news-items.json" "$PROJECT_DIR/tests/output/hacker-news"

extract_filter_config "hacker-news"

OUTPUT_FILE="$OUTPUT_DIR/filter-results.json"

cat <<PROMPT | claude --agent filter --allowedTools Read,Bash,Write $MODE
配置信息:
- source_name: $SOURCE_NAME
- source_url: $SOURCE_URL
- high_interest: $HIGH_INTEREST
- interest: $INTEREST
- uninterested: $UNINTERESTED
- exclude: $EXCLUDE

输入文件: $INPUT_FILE
输出文件: $OUTPUT_FILE
PROMPT
