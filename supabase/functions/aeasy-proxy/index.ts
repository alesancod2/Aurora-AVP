/**
 * Supabase Edge Function - Proxy CORS para aEasy
 * 
 * Esta função atua como intermediário entre o frontend (GitHub Pages)
 * e o backend aEasy, mantendo a sessão PHP (PHPSESSID) server-side.
 * 
 * Endpoints expostos:
 *   POST /aeasy-proxy  { action: "login" }
 *   POST /aeasy-proxy  { action: "request", method, endpoint, body }
 * 
 * Deploy:
 *   npx supabase functions deploy aeasy-proxy --no-verify-jwt
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, x-client-info, apikey",
  "Access-Control-Max-Age": "86400",
};

// Sessão em memória (por instância do worker)
// Em produção, pode usar Supabase KV ou Redis
let sessionCookies = "";
let lastLoginTime = 0;
const SESSION_TTL = 55 * 60 * 1000; // 55 minutos (sessão aEasy = 60min)

serve(async (req: Request) => {
  // Preflight CORS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const { action } = body;

    switch (action) {
      case "login":
        return await handleLogin(body);
      case "request":
        return await handleRequest(body);
      case "status":
        return jsonResponse({
          authenticated: !!sessionCookies,
          sessionAge: lastLoginTime ? Date.now() - lastLoginTime : 0,
          sessionValid: isSessionValid(),
        });
      default:
        return jsonResponse({ error: "Ação inválida. Use: login, request, status" }, 400);
    }
  } catch (error) {
    return jsonResponse({ error: error.message }, 500);
  }
});

/**
 * Login no aEasy e armazenar cookies de sessão
 */
async function handleLogin(body: { login?: string; senha?: string }): Promise<Response> {
  const login = body.login || "03268401503";
  const senha = body.senha || "Ale@2026";

  // 1. GET na página de login para obter PHPSESSID
  const sessionResp = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "GET",
    redirect: "manual",
  });

  // Capturar PHPSESSID do Set-Cookie
  extractCookies(sessionResp);

  // 2. POST login com credenciais
  const loginResp = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": sessionCookies,
    },
    body: `UsuariosLogin=${encodeURIComponent(login)}&UsuariosSenha=${encodeURIComponent(senha)}`,
    redirect: "manual",
  });

  // Capturar cookies adicionais (config, users, permissions, etc)
  extractCookies(loginResp);

  const responseText = await loginResp.text();
  let responseData;

  try {
    responseData = JSON.parse(responseText);
  } catch {
    responseData = { raw: responseText.substring(0, 500) };
  }

  if (responseData?.mensagem?.includes("sucesso")) {
    lastLoginTime = Date.now();
    return jsonResponse({
      success: true,
      mensagem: responseData.mensagem,
      session: sessionCookies.substring(0, 30) + "...",
      timestamp: new Date().toISOString(),
    });
  }

  return jsonResponse({
    success: false,
    error: responseData?.mensagem || "Login falhou",
    details: responseData,
  }, 401);
}

/**
 * Proxy de requisição para o aEasy (mantém sessão)
 */
async function handleRequest(body: {
  method?: string;
  endpoint: string;
  body?: string;
  params?: Record<string, unknown>;
}): Promise<Response> {
  // Verificar se sessão é válida
  if (!isSessionValid()) {
    // Re-login automático
    const loginResult = await handleLogin({});
    const loginData = await loginResult.json();
    if (!loginData.success) {
      return jsonResponse({ error: "Sessão expirada e re-login falhou" }, 401);
    }
  }

  const method = (body.method || "GET").toUpperCase();
  const endpoint = body.endpoint;
  const requestBody = body.body || "";
  const targetUrl = `${AEASY_BASE}${endpoint}`;

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": sessionCookies,
  };

  if (method === "POST") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    redirect: "manual",
  };

  if (method === "POST" && requestBody) {
    fetchOptions.body = requestBody;
  }

  const startTime = Date.now();
  const response = await fetch(targetUrl, fetchOptions);
  const elapsed = Date.now() - startTime;

  // Capturar cookies atualizados
  extractCookies(response);

  // Verificar redirect (sessão expirada)
  if (response.status === 302 || response.status === 301) {
    sessionCookies = "";
    lastLoginTime = 0;
    return jsonResponse({
      error: "SESSION_EXPIRED",
      message: "Sessão expirada no aEasy. Refaça login.",
    }, 401);
  }

  const responseText = await response.text();
  let responseData;

  try {
    // Tentar parsear JSON (removendo PHP warnings se houver)
    const jsonStart = responseText.indexOf("{");
    if (jsonStart >= 0) {
      responseData = JSON.parse(responseText.substring(jsonStart));
    } else {
      responseData = { raw: responseText.substring(0, 2000), isHtml: true };
    }
  } catch {
    responseData = { raw: responseText.substring(0, 2000), parseError: true };
  }

  return jsonResponse({
    status: response.status,
    data: responseData,
    elapsed,
    endpoint,
  });
}

/**
 * Extrair cookies de uma resposta HTTP
 */
function extractCookies(response: Response): void {
  const setCookieHeader = response.headers.get("set-cookie");
  if (!setCookieHeader) return;

  // Pode ter múltiplos Set-Cookie separados por vírgula em alguns runtimes
  const cookieStrings = setCookieHeader.split(/,(?=\s*\w+=)/);

  const cookieMap: Record<string, string> = {};

  // Parsear cookies existentes
  if (sessionCookies) {
    sessionCookies.split("; ").forEach((c) => {
      const [k, ...v] = c.split("=");
      if (k) cookieMap[k.trim()] = v.join("=");
    });
  }

  // Adicionar novos cookies
  cookieStrings.forEach((cookieStr) => {
    const mainPart = cookieStr.split(";")[0].trim();
    const [k, ...v] = mainPart.split("=");
    if (k) cookieMap[k.trim()] = v.join("=");
  });

  sessionCookies = Object.entries(cookieMap)
    .map(([k, v]) => `${k}=${v}`)
    .join("; ");
}

/**
 * Verificar se sessão ainda é válida (< 55 minutos)
 */
function isSessionValid(): boolean {
  if (!sessionCookies || !lastLoginTime) return false;
  return Date.now() - lastLoginTime < SESSION_TTL;
}

/**
 * Helper para resposta JSON com CORS
 */
function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json",
    },
  });
}
