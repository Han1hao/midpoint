import { spawn } from "node:child_process";
import { createServer, request as httpRequest } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, extname, resolve, sep } from "node:path";

const root = resolve(import.meta.dirname, "..");
const clientRoot = resolve(root, "dist", "client");
const vinextCli = resolve(root, "node_modules", "vinext", "dist", "cli.js");
const port = Number(process.env.PORT || 3001);
const backendPort = Number(process.env.LOCAL_BACKEND_PORT || 3005);

async function loadLocalEnvironment() {
  try {
    const envFile = await readFile(resolve(root, ".env.local"), "utf8");
    for (const line of envFile.split(/\r?\n/)) {
      const match = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      process.env[match[1]] = match[2].trim().replace(/^(['"])(.*)\1$/, "$2");
    }
  } catch {}
}

await loadLocalEnvironment();

async function resolveGovernanceDatabaseUrl() {
  if (process.env.GOVERNANCE_DATABASE_URL) return process.env.GOVERNANCE_DATABASE_URL;
  try {
    const envFile = await readFile(resolve(root, "..", "deployment", "midpoint", ".env"), "utf8");
    const values = Object.fromEntries(envFile.split(/\r?\n/).map(line => {
      const match = line.match(/^\s*([^#=]+)=(.*)$/);
      return match ? [match[1].trim(), match[2].trim().replace(/^['"]|['"]$/g, "")] : [];
    }).filter(parts => parts.length === 2));
    if (!values.DB_PASSWORD) return "";
    const dbPort = values.POSTGRES_PORT || "5432";
    return `postgresql://midpoint:${encodeURIComponent(values.DB_PASSWORD)}@127.0.0.1:${dbPort}/midpoint`;
  } catch {
    return "";
  }
}

const governanceDatabaseUrl = await resolveGovernanceDatabaseUrl();

const mime = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

async function staticFile(url) {
  const pathname = decodeURIComponent(new URL(url).pathname);
  const relative = pathname.replace(/^\/+/, "");
  if (!relative || relative.includes("\0")) return null;
  const file = resolve(clientRoot, relative);
  if (file !== clientRoot && !file.startsWith(clientRoot + sep)) return null;
  try {
    if (!(await stat(file)).isFile()) return null;
    return {
      body: await readFile(file),
      type: mime[extname(file).toLowerCase()] || "application/octet-stream",
      immutable: false,
    };
  } catch {
    return null;
  }
}

function proxy(incoming, outgoing) {
  const headers = { ...incoming.headers, host: `127.0.0.1:${backendPort}` };
  if (headers.origin) headers.origin = `http://127.0.0.1:${backendPort}`;
  const upstream = httpRequest({
    hostname: "127.0.0.1",
    port: backendPort,
    path: incoming.url,
    method: incoming.method,
    headers,
  }, response => {
    const responseHeaders = {
      ...response.headers,
      "cache-control": "no-store, no-cache, must-revalidate",
      pragma: "no-cache",
      expires: "0",
    };
    outgoing.writeHead(response.statusCode || 502, responseHeaders);
    response.pipe(outgoing);
  });
  upstream.on("error", error => {
    console.error(error);
    if (!outgoing.headersSent) outgoing.writeHead(502, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ errors: [{ message: "内部服务暂不可用" }] }));
  });
  incoming.pipe(upstream);
}

const backend = spawn(process.execPath, [vinextCli, "start"], {
  cwd: root,
  env: {
    ...process.env,
    PORT: String(backendPort),
    PYTHON_PATH: process.env.PYTHON_PATH || resolve(dirname(process.execPath), "..", "..", "python", "python.exe"),
    GOVERNANCE_STORE_PATH: process.env.GOVERNANCE_STORE_PATH || resolve(root, "data", "governance-store-local.json"),
    GOVERNANCE_DATABASE_URL: governanceDatabaseUrl,
  },
  stdio: "inherit",
});

backend.on("exit", code => {
  if (code) console.error(`内部服务异常退出，代码 ${code}`);
  process.exitCode = code || 0;
});

for (let attempt = 0; attempt < 100; attempt++) {
  try {
    const response = await fetch(`http://127.0.0.1:${backendPort}/`);
    if (response.ok) break;
  } catch {}
  if (attempt === 99) throw new Error("内部服务启动超时");
  await new Promise(resolvePromise => setTimeout(resolvePromise, 100));
}

const server = createServer(async (incoming, outgoing) => {
  try {
    const requestHost = String(incoming.headers.host || "").toLowerCase();
    if (requestHost === `127.0.0.1:${port}`) {
      outgoing.writeHead(302, {
        location: `http://localhost:${port}${incoming.url || "/"}`,
        "cache-control": "no-store",
      });
      outgoing.end();
      return;
    }
    const origin = `http://${incoming.headers.host || `localhost:${port}`}`;
    const file = await staticFile(new URL(incoming.url || "/", origin));
    if (!file) return proxy(incoming, outgoing);
    outgoing.writeHead(200, {
      "content-type": file.type,
      "cache-control": "no-store, no-cache, must-revalidate",
    });
    outgoing.end(incoming.method === "HEAD" ? undefined : file.body);
  } catch (error) {
    console.error(error);
    outgoing.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    outgoing.end(JSON.stringify({ errors: [{ message: "本地服务处理请求失败" }] }));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`IT 账号与资产管理平台已启动：http://localhost:${port}`);
});

function shutdown() {
  server.close();
  backend.kill();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
