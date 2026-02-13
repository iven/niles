#!/bin/bash
set -e

source "$(dirname "$0")/lib/common.sh"

init_paths
parse_mode "$1"

# 测试 summarize
echo "=== 测试 summarize ($([ -z "$MODE" ] && echo "interactive" || echo "print") mode) ==="
INPUT_FILE="${INPUT_FILE:-$PROJECT_DIR/tests/fixtures/hacker-news-items.json}"
setup_test_env "$INPUT_FILE" "$PROJECT_DIR/tests/output/summarize"

extract_preferred_language

# 测试第一个条目
GUID=$(jq -r '.items[0].guid' "$INPUT_FILE")
OUTPUT_FILE="$OUTPUT_DIR/summarize-test.json"

cat <<PROMPT | claude --agent summarize --allowedTools Read,Bash,Write $MODE
参数:
- INPUT_FILE: $INPUT_FILE
- GUID: $GUID
- OUTPUT_FILE: $OUTPUT_FILE
- PREFERRED_LANGUAGE: $PREFERRED_LANGUAGE
PROMPT
