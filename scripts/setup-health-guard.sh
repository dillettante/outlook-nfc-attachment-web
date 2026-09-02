#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
TEMPLATE="$PROJECT_ROOT/config/com.michael.outlook-nfc-attachment.guard.plist.template"
TARGET="$HOME/Library/LaunchAgents/com.michael.outlook-nfc-attachment.guard.plist"
MARKER="$PROJECT_ROOT/state/health-guard-launchagent-created.marker"
LABEL="com.michael.outlook-nfc-attachment.guard"
USER_DOMAIN="gui/$(id -u)"
NODE_BIN="${OUTLOOK_NFC_NODE:-$(command -v node || true)}"
LOG_DIR="$PROJECT_ROOT/state/logs"

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "중단: Node.js 실행 파일을 찾지 못했습니다. Node.js 20 이상을 설치하세요."
  exit 1
fi

/bin/mkdir -p "$LOG_DIR"
GENERATED_PLIST="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/outlook-nfc-guard.XXXXXX")"
trap '/bin/rm -f "$GENERATED_PLIST"' EXIT

# 공개 템플릿에 현재 Mac의 경로를 주입하되, 생성본은 임시 파일에만 둔다.
/bin/cp "$TEMPLATE" "$GENERATED_PLIST"
/usr/bin/plutil -replace ProgramArguments.1 -string "$PROJECT_ROOT/scripts/outlook-health-guard.sh" "$GENERATED_PLIST"
/usr/bin/plutil -replace EnvironmentVariables.OUTLOOK_NFC_NODE -string "$NODE_BIN" "$GENERATED_PLIST"
/usr/bin/plutil -replace WorkingDirectory -string "$PROJECT_ROOT" "$GENERATED_PLIST"
/usr/bin/plutil -replace StandardOutPath -string "$LOG_DIR/guard.log" "$GENERATED_PLIST"
/usr/bin/plutil -replace StandardErrorPath -string "$LOG_DIR/guard.error.log" "$GENERATED_PLIST"
/usr/bin/plutil -lint "$GENERATED_PLIST" >/dev/null

if [[ -e "$TARGET" ]] &&
  ! /usr/bin/cmp -s "$GENERATED_PLIST" "$TARGET" &&
  [[ ! -f "$MARKER" ]]; then
  echo "중단: 같은 경로에 내용이 다른 LaunchAgent가 있습니다."
  echo "$TARGET"
  exit 1
fi

if [[ ! -e "$TARGET" ]]; then
  /usr/bin/touch "$MARKER"
fi

/bin/mkdir -p "$HOME/Library/LaunchAgents"
/usr/bin/install -m 0644 "$GENERATED_PLIST" "$TARGET"

if /bin/launchctl print "$USER_DOMAIN/$LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootout "$USER_DOMAIN" "$TARGET"
fi

/bin/launchctl bootstrap "$USER_DOMAIN" "$TARGET"
/bin/launchctl kickstart -k "$USER_DOMAIN/$LABEL"

echo "Outlook NFC 상태 감시가 설치되었습니다."
