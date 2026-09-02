import { createServer } from "node:https";
import { readFileSync } from "node:fs";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const host = "127.0.0.1";
const port = Number.parseInt(process.env.OUTLOOK_NFC_PORT ?? "32190", 10);
const certDir = process.env.OUTLOOK_NFC_CERT_DIR ?? join(rootDir, "state", "certs");

const routes = new Map([
  ["/", ["src/taskpane.html", "text/html; charset=utf-8"]],
  ["/taskpane.html", ["src/taskpane.html", "text/html; charset=utf-8"]],
  ["/taskpane.js", ["src/taskpane.js", "text/javascript; charset=utf-8"]],
  ["/nfc.mjs", ["src/nfc.mjs", "text/javascript; charset=utf-8"]],
  ["/styles.css", ["src/styles.css", "text/css; charset=utf-8"]],
  ["/commands.html", ["src/commands.html", "text/html; charset=utf-8"]],
  ["/help.html", ["src/help.html", "text/html; charset=utf-8"]],
  ["/assets/icon.svg", ["assets/icon.svg", "image/svg+xml; charset=utf-8"]],
  ["/assets/icon-16.png", ["assets/icon-16.png", "image/png"]],
  ["/assets/icon-32.png", ["assets/icon-32.png", "image/png"]],
  ["/assets/icon-64.png", ["assets/icon-64.png", "image/png"]],
  ["/assets/icon-80.png", ["assets/icon-80.png", "image/png"]],
  ["/assets/icon-outline-16.png", ["assets/icon-outline-16.png", "image/png"]],
  ["/assets/icon-outline-32.png", ["assets/icon-outline-32.png", "image/png"]],
  ["/assets/icon-outline-64.png", ["assets/icon-outline-64.png", "image/png"]],
  ["/assets/icon-outline-80.png", ["assets/icon-outline-80.png", "image/png"]]
]);

const tlsOptions = {
  cert: readFileSync(join(certDir, "localhost.crt")),
  key: readFileSync(join(certDir, "localhost.key")),
  minVersion: "TLSv1.2"
};

const server = createServer(tlsOptions, (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `https://${host}:${port}`);

  if (request.method !== "GET" && request.method !== "HEAD") {
    response.writeHead(405, { Allow: "GET, HEAD" });
    response.end();
    return;
  }

  if (requestUrl.pathname === "/healthz") {
    const body = JSON.stringify({
      ok: true,
      service: "outlook-nfc-attachment",
      version: "0.2.0"
    });
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": "application/json; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
    return;
  }

  const route = routes.get(requestUrl.pathname);
  if (!route) {
    response.writeHead(404, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : "Not found");
    return;
  }

  try {
    const [relativePath, contentType] = route;
    const body = readFileSync(join(rootDir, relativePath));
    response.writeHead(200, {
      "Cache-Control": "no-store",
      "Content-Type": contentType,
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff"
    });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch (error) {
    response.writeHead(500, {
      "Cache-Control": "no-store",
      "Content-Type": "text/plain; charset=utf-8"
    });
    response.end(request.method === "HEAD" ? undefined : "Local asset unavailable");
    console.error(error);
  }
});

server.on("error", (error) => {
  console.error(`[outlook-nfc-attachment] ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`[outlook-nfc-attachment] listening on https://localhost:${port}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
