#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
STATE_DIR="$PROJECT_ROOT/state"
ROLLBACK_DIR="$STATE_DIR/rollback-artifacts"
TARGET="$HOME/Library/LaunchAgents/com.michael.outlook-nfc-attachment.guard.plist"
MARKER="$STATE_DIR/health-guard-launchagent-created.marker"
STATE_FILE="$STATE_DIR/outlook-health-guard.state"
LABEL="com.michael.outlook-nfc-attachment.guard"
USER_DOMAIN="gui/$(id -u)"
STAMP="$(/bin/date +%Y%m%d-%H%M%S)"

echo "롤백 대상: Outlook NFC 상태 감시 LaunchAgent"

if [[ "${1:-}" != "--apply" ]]; then
  echo "미리보기만 수행했습니다. 실제 롤백: $0 --apply"
  exit 0
fi

/bin/mkdir -p "$ROLLBACK_DIR"

if /bin/launchctl print "$USER_DOMAIN/$LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootout "$USER_DOMAIN" "$TARGET"
fi

if [[ -f "$MARKER" && -e "$TARGET" ]]; then
  /bin/mv "$TARGET" "$ROLLBACK_DIR/com.michael.outlook-nfc-attachment.guard.$STAMP.plist"
  /bin/mv "$MARKER" "$ROLLBACK_DIR/health-guard-launchagent-created.$STAMP.marker"
fi

if [[ -f "$STATE_FILE" ]]; then
  /bin/mv "$STATE_FILE" "$ROLLBACK_DIR/outlook-health-guard.$STAMP.state"
fi

echo "Outlook NFC 상태 감시 롤백 완료."
