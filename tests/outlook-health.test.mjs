import test from "node:test";
import assert from "node:assert/strict";
import { classifyOutlookAddinLog } from "../tools/outlook-health.mjs";

const event = (status, online, extensibility = true) =>
  `Add-in Account Action {"Action":"Account Registration","AccountType":1,"status":${status},"IsExtensibilitySupported":${extensibility},"IsAccountOnline":${online}}`;

test("Outlook이 계정을 오프라인으로 오판한 상태를 검출한다", () => {
  assert.equal(classifyOutlookAddinLog(event(false, false)).state, "outlook-offline");
});

test("가장 마지막 계정 등록 상태를 현재 상태로 사용한다", () => {
  const log = [event(false, false), "\0diagnostic noise", event(true, true)].join("\n");
  assert.equal(classifyOutlookAddinLog(log).state, "healthy");
});

test("확장 기능 자체가 비활성화된 상태를 오프라인과 구분한다", () => {
  assert.equal(classifyOutlookAddinLog(event(false, true, false)).state, "unsupported");
});

test("계정 등록 신호가 없으면 알림하지 않도록 unknown을 반환한다", () => {
  assert.equal(classifyOutlookAddinLog("ordinary Outlook log").state, "unknown");
});
