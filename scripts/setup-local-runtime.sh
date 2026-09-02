#!/bin/zsh
set -euo pipefail

PROJECT_ROOT="${0:A:h:h}"
STATE_DIR="$PROJECT_ROOT/state"
CERT_DIR="$STATE_DIR/certs"
LOG_DIR="$STATE_DIR/logs"
CERTIFICATE_EXTENSIONS="$PROJECT_ROOT/config/localhost.ext"
LAUNCH_AGENT_TEMPLATE="$PROJECT_ROOT/config/com.michael.outlook-nfc-attachment.plist.template"
LAUNCH_AGENT_TARGET="$HOME/Library/LaunchAgents/com.michael.outlook-nfc-attachment.plist"
LOGIN_KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"
CERTIFICATE="$CERT_DIR/localhost.crt"
PRIVATE_KEY="$CERT_DIR/localhost.key"
CERTIFICATE_REQUEST="$CERT_DIR/localhost.csr"
ROOT_CA_CERTIFICATE="$CERT_DIR/root-ca.crt"
ROOT_CA_PRIVATE_KEY="$CERT_DIR/root-ca.key"
ROOT_CA_SERIAL="$CERT_DIR/root-ca.srl"
ROOT_CA_NAME="Outlook NFC Attachment Local CA 59F708CE"
LEGACY_CERTIFICATE_NAME="Outlook NFC Attachment Localhost 59F708CE"
SERVICE_LABEL="com.michael.outlook-nfc-attachment"
USER_DOMAIN="gui/$(id -u)"
NODE_BIN="${OUTLOOK_NFC_NODE:-$(command -v node || true)}"
OPENSSL_BIN="${OUTLOOK_NFC_OPENSSL:-}"

if [[ -z "$OPENSSL_BIN" ]]; then
  for candidate in \
    /opt/homebrew/opt/openssl@3/bin/openssl \
    /opt/homebrew/bin/openssl \
    /usr/local/opt/openssl@3/bin/openssl \
    /usr/local/bin/openssl; do
    if [[ -x "$candidate" ]]; then
      OPENSSL_BIN="$candidate"
      break
    fi
  done
fi

if [[ -z "$NODE_BIN" || ! -x "$NODE_BIN" ]]; then
  echo "중단: Node.js 실행 파일을 찾지 못했습니다. Node.js 20 이상을 설치하세요."
  exit 1
fi

if [[ -z "$OPENSSL_BIN" || ! -x "$OPENSSL_BIN" ]]; then
  echo "중단: Homebrew OpenSSL 3 실행 파일을 찾지 못했습니다."
  echo "설치: brew install openssl@3"
  exit 1
fi

GENERATED_PLIST="$(/usr/bin/mktemp "${TMPDIR:-/tmp}/outlook-nfc-launchagent.XXXXXX")"
trap '/bin/rm -f "$GENERATED_PLIST"' EXIT

# 공개 템플릿에 현재 Mac의 경로를 주입하되, 생성본은 임시 파일에만 둔다.
/bin/cp "$LAUNCH_AGENT_TEMPLATE" "$GENERATED_PLIST"
/usr/bin/plutil -replace ProgramArguments.0 -string "$NODE_BIN" "$GENERATED_PLIST"
/usr/bin/plutil -replace ProgramArguments.1 -string "$PROJECT_ROOT/server.mjs" "$GENERATED_PLIST"
/usr/bin/plutil -replace WorkingDirectory -string "$PROJECT_ROOT" "$GENERATED_PLIST"
/usr/bin/plutil -replace StandardOutPath -string "$LOG_DIR/server.log" "$GENERATED_PLIST"
/usr/bin/plutil -replace StandardErrorPath -string "$LOG_DIR/server.error.log" "$GENERATED_PLIST"
/usr/bin/plutil -lint "$GENERATED_PLIST" >/dev/null

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

  # `security dump-trust-settings` omits Result Type for this explicit
  # trustRoot entry. The effective browser-compatible form is an SSL trust
  # entry without a host-scoped Policy String.
  [[ "$trust_block" == *"Policy OID"*"SSL"* &&
    "$trust_block" != *"Policy String"* ]]
}

mkdir -p "$CERT_DIR" "$LOG_DIR" "$STATE_DIR/rollback-artifacts"
chmod 700 "$CERT_DIR"

if [[ ! -f "$ROOT_CA_CERTIFICATE" || ! -f "$ROOT_CA_PRIVATE_KEY" ]]; then
  "$OPENSSL_BIN" req \
    -x509 \
    -newkey rsa:3072 \
    -sha256 \
    -nodes \
    -days 1825 \
    -subj "/CN=$ROOT_CA_NAME" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -keyout "$ROOT_CA_PRIVATE_KEY" \
    -out "$ROOT_CA_CERTIFICATE"
  chmod 600 "$ROOT_CA_PRIVATE_KEY"
  chmod 644 "$ROOT_CA_CERTIFICATE"
fi

if [[ ! -f "$CERTIFICATE" ||
  "$("$OPENSSL_BIN" x509 -in "$CERTIFICATE" -noout -issuer)" != *"$ROOT_CA_NAME"* ]]; then
  "$OPENSSL_BIN" req \
    -new \
    -newkey rsa:2048 \
    -sha256 \
    -nodes \
    -subj "/CN=localhost" \
    -keyout "$PRIVATE_KEY" \
    -out "$CERTIFICATE_REQUEST"

  "$OPENSSL_BIN" x509 \
    -req \
    -in "$CERTIFICATE_REQUEST" \
    -CA "$ROOT_CA_CERTIFICATE" \
    -CAkey "$ROOT_CA_PRIVATE_KEY" \
    -CAcreateserial \
    -CAserial "$ROOT_CA_SERIAL" \
    -days 397 \
    -sha256 \
    -extfile "$CERTIFICATE_EXTENSIONS" \
    -out "$CERTIFICATE"

  chmod 600 "$PRIVATE_KEY"
  chmod 644 "$CERTIFICATE"
fi

"$OPENSSL_BIN" x509 \
  -in "$CERTIFICATE" \
  -noout \
  -fingerprint \
  -sha256 |
  /usr/bin/tee "$STATE_DIR/certificate.sha256.fingerprint" >/dev/null

# Chromium and current Outlook WebKit ignore a user trust entry that is scoped
# with `Policy String: localhost`. Trust this dedicated development CA for SSL
# without a host-name constraint; the CA key remains local and mode 0600.
if ! /usr/bin/security find-certificate \
  -c "$ROOT_CA_NAME" \
  "$LOGIN_KEYCHAIN" >/dev/null 2>&1 ||
  ! root_ca_is_browser_trusted; then
  if /usr/bin/security find-certificate \
    -c "$ROOT_CA_NAME" \
    "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
    /usr/bin/security delete-certificate \
      -c "$ROOT_CA_NAME" \
      "$LOGIN_KEYCHAIN"
  fi

  /usr/bin/security add-trusted-cert \
    -r trustRoot \
    -p ssl \
    -k "$LOGIN_KEYCHAIN" \
    "$ROOT_CA_CERTIFICATE"
  /usr/bin/touch "$STATE_DIR/trust-added-by-installer.marker"
fi

if /usr/bin/security find-certificate \
  -c "$LEGACY_CERTIFICATE_NAME" \
  "$LOGIN_KEYCHAIN" >/dev/null 2>&1; then
  /usr/bin/security delete-certificate \
    -c "$LEGACY_CERTIFICATE_NAME" \
    "$LOGIN_KEYCHAIN"
fi

if [[ -e "$LAUNCH_AGENT_TARGET" ]] &&
  ! /usr/bin/cmp -s "$GENERATED_PLIST" "$LAUNCH_AGENT_TARGET" &&
  [[ ! -f "$STATE_DIR/launchagent-created-by-installer.marker" ]]; then
  echo "중단: 같은 경로에 내용이 다른 LaunchAgent가 있습니다."
  echo "$LAUNCH_AGENT_TARGET"
  exit 1
fi

if [[ ! -e "$LAUNCH_AGENT_TARGET" ]]; then
  /usr/bin/touch "$STATE_DIR/launchagent-created-by-installer.marker"
fi

/bin/mkdir -p "$HOME/Library/LaunchAgents"
/usr/bin/install -m 0644 "$GENERATED_PLIST" "$LAUNCH_AGENT_TARGET"

if /bin/launchctl print "$USER_DOMAIN/$SERVICE_LABEL" >/dev/null 2>&1; then
  /bin/launchctl bootout "$USER_DOMAIN" "$LAUNCH_AGENT_TARGET"
fi

/bin/launchctl bootstrap "$USER_DOMAIN" "$LAUNCH_AGENT_TARGET"
/bin/launchctl kickstart -k "$USER_DOMAIN/$SERVICE_LABEL"

for attempt in {1..40}; do
  if /usr/bin/curl \
    --cacert "$CERTIFICATE" \
    --silent \
    --show-error \
    --fail \
    "https://localhost:32190/healthz" >/dev/null; then
    echo "로컬 NFC 첨부 런타임이 정상 작동합니다."
    exit 0
  fi
  /bin/sleep 0.25
done

echo "오류: 로컬 HTTPS 상태 확인에 실패했습니다."
echo "로그: $LOG_DIR/server.error.log"
exit 1
