import { readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const DEFAULT_OUTLOOK_LOG_DIR =
  join(
    homedir(),
    "Library/Containers/com.microsoft.Outlook/Data/Library/Logs/Diagnostics/OUTLOOK"
  );

export function classifyOutlookAddinLog(logText) {
  const pattern = /Add-in Account Action\s+(\{[^\r\n]+\})/g;
  let latest = null;

  for (const match of String(logText).replaceAll("\0", "").matchAll(pattern)) {
    try {
      latest = JSON.parse(match[1]);
    } catch {
      // Outlook가 쓰는 중 잘린 마지막 줄은 건너뛴다.
    }
  }

  if (!latest) return { state: "unknown" };
  if (latest.IsExtensibilitySupported === false) {
    return { state: "unsupported", detail: latest };
  }
  if (latest.status === true && latest.IsAccountOnline === true) {
    return { state: "healthy", detail: latest };
  }
  if (latest.status === false || latest.IsAccountOnline === false) {
    return { state: "outlook-offline", detail: latest };
  }
  return { state: "unknown", detail: latest };
}

export async function getCurrentOutlookAddinHealth(logDir = DEFAULT_OUTLOOK_LOG_DIR) {
  let names;
  try {
    names = (await readdir(logDir)).filter(
      (name) => name.startsWith("Primary") && name.endsWith(".log")
    );
  } catch {
    return { state: "unknown" };
  }

  const candidates = await Promise.all(
    names.map(async (name) => {
      const path = join(logDir, name);
      return { path, mtimeMs: (await stat(path)).mtimeMs };
    })
  );
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

  if (!candidates[0]) return { state: "unknown" };
  const result = classifyOutlookAddinLog(await readFile(candidates[0].path, "utf8"));
  return { ...result, source: candidates[0].path };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await getCurrentOutlookAddinHealth(
    process.env.OUTLOOK_LOG_DIR || DEFAULT_OUTLOOK_LOG_DIR
  );
  if (process.argv.includes("--state")) {
    process.stdout.write(`${result.state}\n`);
  } else {
    process.stdout.write(`${JSON.stringify(result)}\n`);
  }
}
