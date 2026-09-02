#!/bin/zsh
set -u

PROJECT_ROOT="${0:A:h:h}"
STATE_FILE="$PROJECT_ROOT/state/outlook-health-guard.state"
NODE="${OUTLOOK_NFC_NODE:-}"

if [[ -z "$NODE" || ! -x "$NODE" ]]; then
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node; do
    if [[ -x "$candidate" ]]; then
      NODE="$candidate"
      break
    fi
  done
fi

[[ -n "$NODE" && -x "$NODE" ]] || exit 0

notify_once() {
  local next_state="$1"
  local title="$2"
  local message="$3"
  local previous_state=""

  [[ -f "$STATE_FILE" ]] && previous_state="$(<"$STATE_FILE")"
  print -r -- "$next_state" >| "$STATE_FILE"
  [[ "$previous_state" == "$next_state" ]] && return 0

  /usr/bin/osascript - "$title" "$message" <<'APPLESCRIPT'
on run argv
  display notification (item 2 of argv) with title (item 1 of argv)
end run
APPLESCRIPT
}

if ! /usr/bin/pgrep -x "Microsoft Outlook" >/dev/null 2>&1; then
  print -r -- "outlook-stopped" >| "$STATE_FILE"
  exit 0
fi

account_state="$($NODE "$PROJECT_ROOT/tools/outlook-health.mjs" --state 2>/dev/null)"

case "$account_state" in
  healthy)
    print -r -- "healthy" >| "$STATE_FILE"
    ;;
  outlook-offline)
    notify_once \
      "outlook-offline" \
      "NFC 첨부: Outlook 연결 확인 필요" \
      "Outlook이 메일 계정을 오프라인으로 등록했습니다. 작성 중 메일을 저장한 뒤 Outlook을 완전히 종료하고 다시 여세요."
    ;;
  unsupported)
    notify_once \
      "unsupported" \
      "NFC 첨부: 추가 기능 설정 확인 필요" \
      "Outlook의 연결된 환경 또는 추가 기능 지원이 꺼져 있습니다. Outlook 개인정보 설정을 확인하세요."
    ;;
  *)
    print -r -- "unknown" >| "$STATE_FILE"
    ;;
esac
