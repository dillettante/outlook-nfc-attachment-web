#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { inspectEml } from "./eml-nfc.mjs";

const args = process.argv.slice(2);
const jsonOutput = args.includes("--json");
const filePath = args.find((argument) => argument !== "--json");

if (!filePath) {
  console.error("사용법: node tools/check-eml-nfc.mjs [--json] <message.eml>");
  process.exit(1);
}

const results = inspectEml(readFileSync(filePath, "utf8"));

if (results.length === 0) {
  console.error("첨부 파일명 파라미터를 찾지 못했습니다.");
  process.exit(1);
}

if (jsonOutput) {
  console.log(JSON.stringify(results, null, 2));
} else {
  for (const [index, result] of results.entries()) {
    const valid = result.form === "NFC" || result.form === "neutral";
    console.log(`${index + 1}. ${valid ? "OK" : "FAIL"} ${result.filename}`);
    console.log(`   정규화: ${result.form}`);
    if (!valid) {
      console.log(`   NFC 결과: ${result.nfcFilename}`);
    }
    console.log(`   코드포인트: ${result.codePoints.join(" ")}`);
  }
}

const hasNonNfc = results.some(
  (result) => result.form !== "NFC" && result.form !== "neutral"
);
process.exit(hasNonNfc ? 2 : 0);
