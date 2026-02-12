#!/bin/bash
set -e

source "$(dirname "$0")/lib/common.sh"

init_paths
parse_mode "$1"

# 测试 cnbeta 完整流程
echo "=== 测试 cnbeta personalize-rss ($([ -z "$MODE" ] && echo "interactive" || echo "print") mode) ==="
setup_test_env "$PROJECT_DIR/tests/fixtures/cnbeta-items.json" "$PROJECT_DIR/tests/output/cnbeta"

extract_personalize_config "cnbeta"

echo "配置: $(echo "$CONFIG" | jq -c)"
echo ""

echo "/personalize-rss" | claude --allowedTools Task,Read,Bash,Write $MODE
