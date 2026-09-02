import { getNormalizationForm, toCodePoints } from "../src/nfc.mjs";

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.startsWith("\"") && trimmed.endsWith("\"")) {
    return trimmed.slice(1, -1).replace(/\\(["\\])/g, "$1");
  }
  return trimmed;
}

function decodeQuotedPrintableWord(value) {
  const bytes = [];
  const source = value.replaceAll("_", " ");

  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "=" && /^[0-9A-Fa-f]{2}$/.test(source.slice(index + 1, index + 3))) {
      bytes.push(Number.parseInt(source.slice(index + 1, index + 3), 16));
      index += 2;
    } else {
      bytes.push(source.charCodeAt(index));
    }
  }

  return Buffer.from(bytes).toString("utf8");
}

export function decodeEncodedWords(value) {
  return value.replace(
    /=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g,
    (_match, charset, encoding, data) => {
      if (!/^utf-?8$/i.test(charset) && !/^us-ascii$/i.test(charset)) {
        return _match;
      }
      return encoding.toUpperCase() === "B"
        ? Buffer.from(data, "base64").toString("utf8")
        : decodeQuotedPrintableWord(data);
    }
  );
}

export function decodeExtendedValue(value) {
  const unquoted = stripQuotes(value);
  const extendedMatch = unquoted.match(/^([^']*)'[^']*'(.*)$/s);
  const encoded = extendedMatch ? extendedMatch[2] : unquoted;
  const charset = extendedMatch ? extendedMatch[1] : "utf-8";

  if (charset && !/^utf-?8$/i.test(charset) && !/^us-ascii$/i.test(charset)) {
    return unquoted;
  }

  try {
    return decodeURIComponent(encoded);
  } catch {
    return unquoted;
  }
}

function parseParameters(headerValue) {
  const parameters = new Map();
  const pattern = /;\s*([^=;\s]+)\s*=\s*("(?:[^"\\]|\\.)*"|[^;]*)/g;

  for (const match of headerValue.matchAll(pattern)) {
    parameters.set(match[1].toLowerCase(), match[2].trim());
  }

  return parameters;
}

function readParameter(parameters, baseName) {
  const continuationParts = [];

  for (let index = 0; ; index += 1) {
    const encodedKey = `${baseName}*${index}*`;
    const plainKey = `${baseName}*${index}`;

    if (parameters.has(encodedKey)) {
      continuationParts.push(stripQuotes(parameters.get(encodedKey)));
    } else if (parameters.has(plainKey)) {
      continuationParts.push(stripQuotes(parameters.get(plainKey)));
    } else {
      break;
    }
  }

  if (continuationParts.length > 0) {
    return decodeExtendedValue(continuationParts.join(""));
  }

  if (parameters.has(`${baseName}*`)) {
    return decodeExtendedValue(parameters.get(`${baseName}*`));
  }

  if (parameters.has(baseName)) {
    return decodeEncodedWords(stripQuotes(parameters.get(baseName)));
  }

  return undefined;
}

function collectAttachmentHeaders(emlText) {
  const lines = emlText.split(/\r?\n/);
  const headers = [];

  for (let index = 0; index < lines.length; index += 1) {
    if (!/^(Content-Disposition|Content-Type):/i.test(lines[index])) {
      continue;
    }

    const parts = [lines[index]];
    while (index + 1 < lines.length && /^[ \t]/.test(lines[index + 1])) {
      parts.push(lines[index + 1]);
      index += 1;
    }
    headers.push(parts.join(" ").replace(/\s+/g, " "));
  }

  return headers;
}

export function inspectEml(emlText) {
  const results = [];

  for (const header of collectAttachmentHeaders(emlText)) {
    const parameters = parseParameters(header);
    const parameterName = /^Content-Disposition:/i.test(header) ? "filename" : "name";
    const filename = readParameter(parameters, parameterName);

    if (!filename) {
      continue;
    }

    results.push({
      filename,
      form: getNormalizationForm(filename),
      nfcFilename: filename.normalize("NFC"),
      codePoints: toCodePoints(filename),
      sourceHeader: header
    });
  }

  return results;
}
