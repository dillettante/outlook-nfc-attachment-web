# 롤백 절차

이 프로젝트는 Outlook 앱 번들이나 메일 데이터베이스를 수정하지 않는다. 롤백 대상은
사용자 LaunchAgent, 상태 감시 LaunchAgent, `localhost` 신뢰 인증서, Outlook 사용자 추가
기능 한 개뿐이다.

## 1. 로컬 변경 미리보기

```bash
cd "/path/to/outlook-nfc-attachment"
./scripts/rollback-local-runtime.sh
```

이 명령은 상태만 보여 주며 변경하지 않는다.

## 2. 로컬 런타임 롤백

```bash
./scripts/rollback-local-runtime.sh --apply
```

스크립트는 다음 원칙을 따른다.

- 자신이 만든 LaunchAgent만 중지하고 `state/rollback-artifacts/`로 이동한다.
- 자신이 추가했다고 표시된 인증서만 로그인 키체인에서 제거한다.
- 인증서 파일과 프로젝트 소스는 재설치를 위해 보존한다.
- 재귀 삭제를 하지 않는다.

## 3. 상태 감시 롤백

상태 감시만 되돌리려면 먼저 미리보기한 뒤 적용한다.

```bash
./scripts/rollback-health-guard.sh
./scripts/rollback-health-guard.sh --apply
```

## 4. Outlook 추가 기능 제거

1. 브라우저에서 [Outlook 추가 기능 관리](https://aka.ms/olksideload)를 연다.
2. `My add-ins`로 이동한다.
3. `NFC 첨부`를 찾아 제거한다.
4. Outlook을 다시 시작한다.

## 5. 롤백 확인

```bash
./scripts/status.sh
```

정상 롤백이면 `LaunchAgent: not loaded`, `로컬 인증서: not installed`,
`HTTPS 상태: unavailable`이 출력된다.

프로젝트 폴더 삭제는 자동 롤백 범위에 포함하지 않는다. 필요할 때 별도 확인 후 제거한다.
