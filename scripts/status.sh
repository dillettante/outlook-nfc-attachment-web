#!/bin/zsh
set -u

PROJECT_ROOT="${0:A:h:h}"
CERTIFICATE="$PROJECT_ROOT/state/certs/localhost.crt"
ROOT_CA_CERTIFICATE="$PROJECT_ROOT/state/certs/root-ca.crt"
ROOT_CA_NAME="Outlook NFC Attachment Local CA 59F708CE"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
SERVICE_LABEL="com.michael.outlook-nfc-attachment"
GUARD_LABEL="com.michael.outlook-nfc-attachment.guard"
USER_DOMAIN="gui/$(id -u)"

root_ca_is_browser_trusted() {
  local trust_block
  trust_block="$(
    /usr/bin/security dump-trust-settings 2>/dev/null |
      /usr/bin/awk -v target="$ROOT_CA_NAME" '
        /^Cert [0-9]+:/ {
          if (capture) exit
          capture = index($0, target) > 0
        }
        capture { print }
      '
  )"

  [[ "$trust_block" == *"Policy OID"*"SSL"* &&
    "$trust_block" != *"Policy String"* ]]
}

echo "프로젝트: $PROJECT_ROOT"

if /bin/launchctl print "$USER_DOMAIN/$SERVICE_LABEL" >/dev/null 2>&1; then
  echo "LaunchAgent: loaded"
else
  echo "LaunchAgent: not loaded"
fi

if /bin/launchctl print "$USER_DOMAIN/$GUARD_LABEL" >/dev/null 2>&1; then
  echo "Health guard: loaded"
else
  echo "Health guard: not loaded"
fi

NODE_BIN="${OUTLOOK_NFC_NODE:-$(command -v node || true)}"

if /usr/bin/pgrep -x "Microsoft Outlook" >/dev/null 2>&1; then
  if [[ -n "$NODE_BIN" && -x "$NODE_BIN" ]]; then
    echo "Outlook 추가 기능 계정: $("$NODE_BIN" "$PROJECT_ROOT/tools/outlook-health.mjs" --state)"
  else
    echo "Outlook 추가 기능 계정: Node.js unavailable"
  fi
else
  echo "Outlook 추가 기능 계정: Outlook not running"
fi

if [[ -f "$CERTIFICATE" && -f "$ROOT_CA_CERTIFICATE" ]] &&
  /usr/bin/security find-certificate \
    -c "$ROOT_CA_NAME" \
    "$LOGIN_KEYCHAIN" >/dev/null 2>&1 &&
  root_ca_is_browser_trusted &&
  /usr/bin/security verify-cert \
    -c "$CERTIFICATE" \
    -p ssl \
    -s localhost >/dev/null 2>&1; then
  echo "로컬 인증서: browser-compatible trust root"
else
  echo "로컬 인증서: not trusted"
fi

if [[ -f "$CERTIFICATE" ]] &&
  /usr/bin/curl \
    --cacert "$CERTIFICATE" \
    --silent \
    --show-error \
    --fail \
  "https://localhost:32190/healthz" 2>/dev/null; then
  echo
  echo "HTTPS 상태: healthy"
else
  echo "HTTPS 상태: unavailable"
fi
