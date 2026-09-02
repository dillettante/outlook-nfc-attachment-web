# Outlook NFC 첨부

최신 Outlook 웹 및 데스크톱 작성 창에 `NFC 첨부` 버튼을 추가한다. 선택한 로컬 파일의
이름을 JavaScript `String.prototype.normalize("NFC")`로 조합한 뒤 Outlook 공식
`addFileAttachmentFromBase64Async` API로 첨부한다. 파일 선택 버튼과 Finder
드래그앤드롭을 모두 지원한다.

아이콘 원본은 투명 배경의 선형 벡터
[`assets/icon.svg`](./assets/icon.svg)다. Outlook 매니페스트가 요구하는
16·32·80px PNG와 패널용 64px PNG는 `npm run build:icons`에서 이 SVG로부터
자동 생성한다.

## 안전 경계

- Outlook 앱 번들, 메일 DB, 기존 환경설정을 수정하지 않는다.
- HTTPS 서버는 `127.0.0.1:32190`에만 바인딩한다.
- 파일을 받는 서버·원격 분석·텔레메트리가 없다.
- 정적 코드에서 필요한 Microsoft `Office.js`만 공식 CDN에서 불러온다.
- 파일 내용은 패널에서 로컬로 읽고 Outlook 첨부 API로 전달한다.
- 첨부 파일당 안전 한도는 25,000,000바이트다.
- 일반 종이클립 버튼으로 붙인 기존 첨부는 변경하지 않는다.

## 개발 검증

```bash
npm test
npm run validate
npx --yes office-addin-manifest@2.1.6 validate manifest.xml
npx --yes office-addin-manifest@2.1.6 validate manifest-web.xml
```

## 저장소와 로컬 상태

공개 저장소는 [`dillettante/outlook-nfc-attachment`](https://github.com/dillettante/outlook-nfc-attachment)다.
소스·매니페스트·테스트만 Git으로 관리한다. `state/` 아래에 생성되는 인증서 개인키,
Outlook 진단 상태, 로그와 설치 마커는 이 Mac에만 남고 Git에서 제외된다.

## 로컬 런타임 설치

```bash
./scripts/setup-local-runtime.sh
./scripts/setup-health-guard.sh
./scripts/status.sh
```

설치기는 전용 로컬 CA와 `localhost` 서버 인증서를 만들고, 로컬 CA를 SSL 신뢰 루트로
등록한다. 호스트 이름 제한이 붙은 키체인 신뢰 항목은 현재 Chromium과 Outlook의 웹
런타임이 거부하므로 사용하지 않는다. 서버 인증서 자체는 `localhost`에만 유효하다.
또한 로그인 시 서버를 기동하는 사용자 LaunchAgent를 설치한다.

`setup-health-guard.sh`는 2분마다 Outlook 진단 로그의 계정 등록 상태를 확인한다.
Outlook이 계정을 오프라인으로 잘못 등록하면 알림을 한 번만 표시한다. 작성 중인 메일을
보호하기 위해 Outlook을 자동 종료하거나 다시 시작하지 않는다.

## 웹·데스크톱 공용 배포

`manifest-web.xml`은 아래 공개 HTTPS 정적 호스트를 사용한다.

```text
https://dillettante.github.io/outlook-nfc-attachment/
```

이 배포에는 HTML·JavaScript·CSS·아이콘만 포함한다. 인증서 개인키, 로그, 테스트 파일은
배포하지 않는다. 파일 내용은 정적 호스트로 업로드되지 않고 브라우저 안에서 읽은 뒤
Outlook의 공식 첨부 API로만 전달된다.

`main`에 반영된 변경은 GitHub Actions 검증을 통과한 뒤 GitHub Pages에 자동 배포된다.

## 라이선스

[MIT License](./LICENSE)

## Outlook에 추가

1. `https://aka.ms/olksideload`에서 `My add-ins`를 연다.
2. `Add a custom add-in` → `Add from File`을 선택한다.
3. 로컬 전용이면 `manifest.xml`, 웹·데스크톱 공용이면 `manifest-web.xml`을 선택한다.
4. 최신 Outlook을 다시 열고 새 메일 작성 창에서 `NFC 첨부`를 사용한다.

이미 설치한 추가 기능의 리본 아이콘이나 매니페스트 리소스를 갱신할 때는 더 높은
`Version`이 지정된 새 `manifest.xml`을 같은 방식으로 다시 업로드한다. Outlook이
이전 아이콘을 계속 표시하면 기존 `NFC 첨부`를 제거한 뒤 새 매니페스트를 추가한다.
로컬 런타임과 인증서는 그대로 두어도 된다.

## 수신 MIME 검증

테스트 메일을 자신에게 보낸 뒤 원본을 `.eml`로 저장한다.

```bash
node tools/check-eml-nfc.mjs "/absolute/path/to/message.eml"
```

NFC 또는 ASCII 정규화 중립이면 종료 코드 `0`, NFD 등 비-NFC이면 `2`다.

## 롤백

[ROLLBACK.md](./ROLLBACK.md)를 따른다. 로컬 롤백 스크립트는 인수 없이 실행하면
미리보기만 제공하고, `--apply`를 붙였을 때만 변경한다.
