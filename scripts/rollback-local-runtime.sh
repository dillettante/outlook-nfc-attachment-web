#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
STATE_DIR="$PROJECT_ROOT/state"
ROLLBACK_DIR="$STATE_DIR/rollback-artifacts"
LAUNCH_AGENT_TARGET="$HOME/Library/LaunchAgents/com.michael.outlook-nfc-attachment.plist"
HEALTH_GUARD_TARGET="$HOME/Library/LaunchAgents/com.michael.outlook-nfc-attachment.guard.plist"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
ROOT_CA_NAME="Outlook NFC Attachment Local CA 59F708CE"
LEGACY_CERTIFICATE_NAME="Outlook NFC Attachment Localhost 59F708CE"
SERVICE_LABEL="com.michael.outlook-nfc-attachment"
HEALTH_GUARD_LABEL="com.michael.outlook-nfc-attachment.guard"
USER_DOMAIN="gui/$(id -u)"
STAMP="$(/bin/date +%Y%m%d-%H%M%S)"

echo "롤백 대상:"
echo "  1. $SERVICE_LABEL 로컬 서버 중지"
echo "  2. 설치기가 만든 LaunchAgent를 복구 폴더로 이동"
echo "  3. Outlook NFC 상태 감시 중지 및 복구 폴더로 이동"
echo "  4. 설치기가 추가한 경우에만 localhost 신뢰 인증서 제거"
echo "  5. 프로젝트와 인증서 파일은 재설치를 위해 보존"
echo "  6. Outlook의 NFC 첨부 추가 기능은 My Add-ins에서 수동 제거"

if [[ "${1:-}" != "--apply" ]]; then
  echo
  echo "미리보기만 수행했습니다. 실제 롤백: $0 --apply"
  exit 0
fi

mkdir -p "$ROLLBACK_DIR"

if /bin/launchctl print "$USER_DOMAIN/$SERVICE_LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootout "$USER_DOMAIN" "$LAUNCH_AGENT_TARGET"
fi

if /bin/launchctl print "$USER_DOMAIN/$HEALTH_GUARD_LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootout "$USER_DOMAIN" "$HEALTH_GUARD_TARGET"
fi

if [[ -f "$STATE_DIR/launchagent-created-by-installer.marker" &&
  -e "$LAUNCH_AGENT_TARGET" ]]; then
  /bin/mv \
    "$LAUNCH_AGENT_TARGET" \
    "$ROLLBACK_DIR/com.michael.outlook-nfc-attachment.$STAMP.plist"
  /bin/mv \
    "$STATE_DIR/launchagent-created-by-installer.marker" \
    "$ROLLBACK_DIR/launchagent-created-by-installer.$STAMP.marker"
fi

if [[ -f "$STATE_DIR/health-guard-launchagent-created.marker" &&
  -e "$HEALTH_GUARD_TARGET" ]]; then
  /bin/mv \
    "$HEALTH_GUARD_TARGET" \
    "$ROLLBACK_DIR/com.michael.outlook-nfc-attachment.guard.$STAMP.plist"
  /bin/mv \
    "$STATE_DIR/health-guard-launchagent-created.marker" \
    "$ROLLBACK_DIR/health-guard-launchagent-created.$STAMP.marker"
fi

if [[ -f "$STATE_DIR/outlook-health-guard.state" ]]; then
  /bin/mv \
    "$STATE_DIR/outlook-health-guard.state" \
    "$ROLLBACK_DIR/outlook-health-guard.$STAMP.state"
fi

if [[ -f "$STATE_DIR/trust-added-by-installer.marker" ]]; then
  if /usr/bin/security find-certificate \
    -c "$ROOT_CA_NAME" \
    "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
    /usr/bin/security delete-certificate \
      -c "$ROOT_CA_NAME" \
      "$LOGIN_KEYCHAIN"
  fi
  if /usr/bin/security find-certificate \
    -c "$LEGACY_CERTIFICATE_NAME" \
    "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
    /usr/bin/security delete-certificate \
      -c "$LEGACY_CERTIFICATE_NAME" \
      "$LOGIN_KEYCHAIN"
  fi
  /bin/mv \
    "$STATE_DIR/trust-added-by-installer.marker" \
    "$ROLLBACK_DIR/trust-added-by-installer.$STAMP.marker"
fi

echo "로컬 런타임 롤백 완료."
echo "Outlook > My Add-ins에서 'NFC 첨부'를 제거하면 전체 롤백이 끝납니다."
