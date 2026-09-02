import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_ATTACHMENT_BYTES,
  assertAttachableFile,
  fileKey,
  formatBytes,
  getNormalizationForm,
  mergeFiles,
  normalizeFilename,
  toFileArray
} from "../src/nfc.mjs";
import {
  decodeEncodedWords,
  inspectEml
} from "../tools/eml-nfc.mjs";

test("분해된 한글 파일명을 NFC로 조합한다", () => {
  const nfc = "송경훈_첨부자료.pdf";
  const nfd = nfc.normalize("NFD");

  assert.notEqual(nfd, nfc);
  assert.equal(getNormalizationForm(nfd), "NFD");
  assert.equal(normalizeFilename(nfd), nfc);
  assert.equal(getNormalizationForm(normalizeFilename(nfd)), "NFC");
});

test("ASCII 파일명은 정규화 중립으로 처리한다", () => {
  assert.equal(getNormalizationForm("contract.pdf"), "neutral");
  assert.equal(normalizeFilename("contract.pdf"), "contract.pdf");
});

test("첨부 API의 안전 크기 한도를 검사한다", () => {
  assert.equal(
    assertAttachableFile({ name: "자료.pdf", size: MAX_ATTACHMENT_BYTES }),
    "자료.pdf"
  );
  assert.throws(
    () => assertAttachableFile({ name: "자료.pdf", size: MAX_ATTACHMENT_BYTES + 1 }),
    /안전 한도/
  );
});

test("파일 선택기와 드롭 목록을 안전한 파일 배열로 바꾼다", () => {
  const first = { name: "첫번째.txt", size: 10 };
  const second = { name: "두번째.txt", size: 20 };
  const fileListLike = { 0: first, 1: null, 2: second, length: 3 };

  assert.deepEqual(toFileArray(fileListLike), [first, second]);
  assert.deepEqual(toFileArray(null), []);
});

test("파일 크기를 한도와 같은 십진 단위로 표시한다", () => {
  assert.equal(formatBytes(999), "999B");
  assert.equal(formatBytes(1500), "2KB");
  assert.equal(formatBytes(2_000_000), "2.0MB");
  // 한도를 1바이트 넘긴 파일은 반드시 25MB 이상으로 보여야 한다.
  assert.equal(formatBytes(MAX_ATTACHMENT_BYTES + 1), "25.0MB");
});

test("나눠 고른 파일을 목록에 쌓는다", () => {
  const first = { name: "첫번째.txt", size: 10, lastModified: 1 };
  const second = { name: "두번째.txt", size: 20, lastModified: 2 };

  const merged = mergeFiles([first], [second]);
  assert.deepEqual(merged, [first, second]);
  assert.deepEqual(mergeFiles([], []), []);
});

test("같은 파일을 다시 골라도 한 번만 쌓는다", () => {
  const file = { name: "자료.pdf", size: 100, lastModified: 7 };
  const sameAgain = { name: "자료.pdf", size: 100, lastModified: 7 };

  assert.equal(mergeFiles([file], [sameAgain]).length, 1);
});

test("NFD와 NFC 표기만 다른 같은 파일을 중복으로 쌓지 않는다", () => {
  const nfcName = "송경훈_첨부자료.pdf";
  const nfc = { name: nfcName, size: 100, lastModified: 7 };
  const nfd = { name: nfcName.normalize("NFD"), size: 100, lastModified: 7 };

  assert.notEqual(nfd.name, nfc.name);
  assert.equal(fileKey(nfd), fileKey(nfc));
  assert.equal(mergeFiles([nfc], [nfd]).length, 1);
});

test("이름이 같아도 크기가 다르면 서로 다른 파일로 본다", () => {
  const original = { name: "자료.pdf", size: 100, lastModified: 7 };
  const edited = { name: "자료.pdf", size: 240, lastModified: 7 };

  assert.equal(mergeFiles([original], [edited]).length, 2);
});

test("RFC 2231 filename*의 NFD 파일명을 검출한다", () => {
  const nfdName = "송경훈_첨부자료.pdf".normalize("NFD");
  const eml = [
    "MIME-Version: 1.0",
    "Content-Type: multipart/mixed; boundary=test",
    "",
    "--test",
    "Content-Type: application/pdf",
    `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(nfdName)}`,
    "",
    "JVBERi0x",
    "--test--"
  ].join("\r\n");

  const results = inspectEml(eml);
  assert.equal(results.length, 1);
  assert.equal(results[0].filename, nfdName);
  assert.equal(results[0].form, "NFD");
});

test("RFC 2231 연속 파라미터의 NFC 파일명을 검출한다", () => {
  const encoded = encodeURIComponent("송경훈_첨부자료.pdf");
  const splitIndex = Math.floor(encoded.length / 2);
  const eml = [
    "Content-Disposition: attachment;",
    ` filename*0*=UTF-8''${encoded.slice(0, splitIndex)};`,
    ` filename*1*=${encoded.slice(splitIndex)}`,
    "",
    "body"
  ].join("\r\n");

  const results = inspectEml(eml);
  assert.equal(results.length, 1);
  assert.equal(results[0].filename, "송경훈_첨부자료.pdf");
  assert.equal(results[0].form, "NFC");
});

test("RFC 2047 Base64 파일명을 해독한다", () => {
  const filename = "송경훈_첨부자료.pdf";
  const encodedWord = `=?UTF-8?B?${Buffer.from(filename).toString("base64")}?=`;
  assert.equal(decodeEncodedWords(encodedWord), filename);
});
