#!/bin/bash
set -e

source "$(dirname "$0")/lib/common.sh"

init_paths
parse_mode "$1"

# 测试 summarize
echo "=== 测试 summarize ($([ -z "$MODE" ] && echo "interactive" || echo "print") mode) ==="
export ITEMS_JSON="$PROJECT_DIR/tests/fixtures/hacker-news-items.json"

extract_preferred_language

# 测试第一个条目
GUID="https://news.ycombinator.com/item?id=46961345"
OUTPUT_FILE="$PROJECT_DIR/tests/output/summarize-test.json"

cat <<PROMPT | claude --agent summarize --allowedTools Read,Bash,Write $MODE
参数:
- ITEMS_JSON: $ITEMS_JSON
- GUID: $GUID
- OUTPUT_FILE: $OUTPUT_FILE
- PREFERRED_LANGUAGE: $PREFERRED_LANGUAGE
PROMPT
