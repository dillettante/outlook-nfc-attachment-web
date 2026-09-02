import { accessSync, constants, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const manifest = readFileSync(join(rootDir, "manifest.xml"), "utf8");
const webManifest = readFileSync(join(rootDir, "manifest-web.xml"), "utf8");
const webBase = "https://dillettante.github.io/outlook-nfc-attachment";
const requiredFiles = [
  "src/taskpane.html",
  "src/taskpane.js",
  "src/nfc.mjs",
  "src/styles.css",
  "src/commands.html",
  "src/help.html",
  "assets/icon.svg",
  "assets/icon-16.png",
  "assets/icon-32.png",
  "assets/icon-64.png",
  "assets/icon-80.png",
  "assets/icon-outline-16.png",
  "assets/icon-outline-32.png",
  "assets/icon-outline-64.png",
  "assets/icon-outline-80.png"
];

for (const file of requiredFiles) {
  accessSync(join(rootDir, file), constants.R_OK);
}

const checks = [
  ["제품 버전 1.0 이상", /<Version>1\.\d+\.\d+\.\d+<\/Version>/.test(manifest)],
  ["캐시 갱신용 아이콘 URL", manifest.includes("/assets/icon-outline-")],
  ["고정 localhost 포트", manifest.includes("https://localhost:32190")],
  ["첨부 API 최소 Mailbox 1.8", /Mailbox[^>]*MinVersion="1\.8"/.test(manifest)],
  ["VersionOverrides 최소 Mailbox 1.8", manifest.includes('DefaultMinVersion="1.8"')],
  ["ReadWriteItem 최소 권한", manifest.includes("<Permissions>ReadWriteItem</Permissions>")],
  ["NFC 첨부 버튼", manifest.includes("NfcAttachment.Compose.Button")],
  ["외부 AppDomain 없음", !/<AppDomain>(?!https:\/\/localhost:32190)/.test(manifest)],
  ["웹 제품 버전 1.3 이상", /<Version>1\.[3-9]\.\d+\.\d+<\/Version>/.test(webManifest)],
  ["웹 배포 URL", webManifest.includes(`${webBase}/taskpane.html`)],
  ["웹 첨부 API 최소 Mailbox 1.8", /Mailbox[^>]*MinVersion="1\.8"/.test(webManifest)],
  ["웹 ReadWriteItem 최소 권한", webManifest.includes("<Permissions>ReadWriteItem</Permissions>")]
];

const failed = checks.filter(([, passed]) => !passed);
for (const [label, passed] of checks) {
  console.log(`${passed ? "OK" : "FAIL"} ${label}`);
}

if (failed.length > 0) {
  process.exit(1);
}
