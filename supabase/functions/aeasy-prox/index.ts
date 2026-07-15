/**
 * Supabase Edge Function - Proxy CORS para aEasy
 * Usa Deno.serve() nativo (sem imports deprecados)
 * 
 * Deploy: supabase functions deploy aeasy-prox --no-verify-jwt
 * Ou copie este código na aba "Code" do dashboard Supabase
 */

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
  "Access-Control-Max-Age": "86400",
};

let sessionCookies = "";
let lastLoginTime = 0;
const SESSION_TTL = 55 * 60 * 1000;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json();

    if (body.action === "login") return await handleLogin(body);
    if (body.action === "request") return await handleRequest(body);
    if (body.action === "status") {
      return respond({ authenticated: !!sessionCookies, valid: isSessionValid(), age: lastLoginTime ? Date.now() - lastLoginTime : 0 });
    }
    return respond({ error: "Use: login, request, status" }, 400);
  } catch (e) {
    return respond({ error: (e as Error).message }, 500);
  }
});

async function handleLogin(body: Record<string, string>): Promise<Response> {
  const login = body.login || "03268401503";
  const senha = body.senha || "Ale@2026";

  // 1. Obter sessao
  const s = await fetch(`${AEASY_BASE}/conta/login`, { method: "GET", redirect: "manual" });
  extractCookies(s);

  // 2. Login
  const r = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": sessionCookies,
    },
    body: `UsuariosLogin=${encodeURIComponent(login)}&UsuariosSenha=${encodeURIComponent(senha)}`,
    redirect: "manual",
  });
  extractCookies(r);

  const text = await r.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 300) }; }

  if (data.mensagem && String(data.mensagem).includes("sucesso")) {
    lastLoginTime = Date.now();
    return respond({ success: true, mensagem: data.mensagem });
  }
  return respond({ success: false, error: data.mensagem || "Falhou" }, 401);
}

async function handleRequest(body: Record<string, unknown>): Promise<Response> {
  if (!isSessionValid()) {
    const lr = await handleLogin({});
    const ld = await lr.clone().json();
    if (!ld.success) return respond({ error: "SESSION_EXPIRED" }, 401);
  }

  const method = String(body.method || "GET").toUpperCase();
  const endpoint = String(body.endpoint || "/");
  const reqBody = String(body.body || "");

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": sessionCookies,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";

  const opts: RequestInit = { method, headers, redirect: "manual" };
  if (method === "POST" && reqBody) opts.body = reqBody;

  const start = Date.now();
  const resp = await fetch(`${AEASY_BASE}${endpoint}`, opts);
  extractCookies(resp);

  if (resp.status === 302 || resp.status === 301) {
    sessionCookies = "";
    lastLoginTime = 0;
    return respond({ error: "SESSION_EXPIRED" }, 401);
  }

  const text = await resp.text();
  let data: unknown;
  try {
    const i = text.indexOf("{");
    data = i >= 0 ? JSON.parse(text.substring(i)) : { raw: text.substring(0, 2000) };
  } catch { data = { raw: text.substring(0, 2000) }; }

  return respond({ status: resp.status, data, elapsed: Date.now() - start });
}

function extractCookies(r: Response): void {
  const sc = r.headers.get("set-cookie");
  if (!sc) return;
  const map: Record<string, string> = {};
  if (sessionCookies) {
    sessionCookies.split("; ").forEach((c) => { const [k, ...v] = c.split("="); if (k) map[k.trim()] = v.join("="); });
  }
  sc.split(/,(?=\s*\w+=)/).forEach((part) => { const m = part.split(";")[0].trim(); const [k, ...v] = m.split("="); if (k) map[k.trim()] = v.join("="); });
  sessionCookies = Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

function isSessionValid(): boolean {
  return !!sessionCookies && !!lastLoginTime && (Date.now() - lastLoginTime < SESSION_TTL);
}

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
