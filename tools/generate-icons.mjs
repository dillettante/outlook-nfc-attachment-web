import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("..", import.meta.url));
const assetDir = join(rootDir, "assets");
const sourceIcon = join(assetDir, "icon.svg");
const sizes = [16, 32, 64, 80];
const outputPrefixes = ["icon", "icon-outline"];
const temporaryDir = mkdtempSync(join(tmpdir(), "outlook-nfc-icons-"));

function assertPngSize(path, expectedSize) {
  const header = readFileSync(path).subarray(0, 24);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  if (!header.subarray(0, 8).equals(signature)) {
    throw new Error(`${path}: PNG 형식이 아닙니다.`);
  }

  const width = header.readUInt32BE(16);
  const height = header.readUInt32BE(20);
  if (width !== expectedSize || height !== expectedSize) {
    throw new Error(
      `${path}: ${expectedSize}x${expectedSize} PNG가 아닙니다.`
    );
  }
}

try {
  mkdirSync(assetDir, { recursive: true });

  for (const size of sizes) {
    const temporaryPng = join(temporaryDir, `icon-${size}.png`);
    execFileSync(
      "/usr/bin/sips",
      [
        "-s",
        "format",
        "png",
        "-z",
        String(size),
        String(size),
        sourceIcon,
        "--out",
        temporaryPng
      ],
      { stdio: "ignore" }
    );
    assertPngSize(temporaryPng, size);
  }

  for (const size of sizes) {
    const temporaryPng = join(temporaryDir, `icon-${size}.png`);
    for (const prefix of outputPrefixes) {
      const stagedPng = join(assetDir, `.${prefix}-${size}.png.next`);
      copyFileSync(temporaryPng, stagedPng);
      renameSync(stagedPng, join(assetDir, `${prefix}-${size}.png`));
    }
  }
} finally {
  rmSync(temporaryDir, { recursive: true, force: true });
}

console.log(`Generated ${sizes.length} transparent PNG icon sizes from assets/icon.svg.`);
