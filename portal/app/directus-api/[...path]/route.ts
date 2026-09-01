import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ path?: string[] }> };
const upstreamBase = (process.env.DIRECTUS_INTERNAL_URL || "http://127.0.0.1:8055").replace(/\/$/, "");

async function forward(request: NextRequest, context: RouteContext) {
  const params = await context.params;
  const segments = Array.isArray(params.path) ? params.path : [];
  const target = new URL(upstreamBase + "/" + segments.map(encodeURIComponent).join("/"));
  target.search = request.nextUrl.search;

  const headers = new Headers(request.headers);
  for (const name of ["host", "content-length", "connection", "accept-encoding"]) headers.delete(name);

  const init: RequestInit = { method: request.method, headers, redirect: "manual", cache: "no-store" };
  if (!["GET", "HEAD"].includes(request.method)) init.body = await request.arrayBuffer();

  try {
    const response = await fetch(target, init);
    const responseHeaders = new Headers(response.headers);
    for (const name of ["content-length", "content-encoding", "transfer-encoding", "connection"]) responseHeaders.delete(name);
    responseHeaders.set("Cache-Control", "no-store");
    return new Response(response.body, { status: response.status, headers: responseHeaders });
  } catch {
    return Response.json(
      { errors: [{ message: "Directus 服务未启动，请先启动 8055 端口。", extensions: { code: "SERVICE_UNAVAILABLE" } }] },
      { status: 503 },
    );
  }
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const PUT = forward;
export const DELETE = forward;
export const OPTIONS = forward;

