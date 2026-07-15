/**
 * Supabase Edge Function - aeasy-prox (Proxy Unificado)
 * 
 * Proxy CORS para aEasy + funções inteligentes de relatórios.
 * Mantém sessão PHP server-side (PHPSESSID).
 * 
 * Actions:
 *   - login: Autentica no aEasy, mantém sessão server-side
 *   - request: Proxy genérico (forward de qualquer endpoint)
 *   - status: Verifica se sessão está ativa
 *   - gestores: Busca lista de gestores (tipo 5/6) via DataTables
 *   - batch: Para cada gestor, chama /TopVendas e parseia HTML
 * 
 * Deploy: supabase functions deploy aeasy-prox --no-verify-jwt
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
    const action = body.action;

    if (action === "login") return await handleLogin(body);
    if (action === "request") return await handleRequest(body);
    if (action === "status") {
      return respond({
        authenticated: !!sessionCookies,
        valid: isSessionValid(),
        age: lastLoginTime ? Date.now() - lastLoginTime : 0,
      });
    }
    if (action === "gestores") return await handleGestores(body);
    if (action === "batch") return await handleBatch(body);

    return respond({ error: "Actions: login, request, status, gestores, batch" }, 400);
  } catch (e) {
    return respond({ error: (e as Error).message }, 500);
  }
});


// ============================================
// ACTION: LOGIN
// Autentica no aEasy e mantém sessão server-side
// ============================================
async function handleLogin(body: Record<string, string>): Promise<Response> {
  const login = body.login || "03268401503";
  const senha = body.senha || "Ale@2026";

  // 1. Obter sessão
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
    return respond({ success: true, session_cookie: sessionCookies, mensagem: data.mensagem });
  }
  return respond({ success: false, error: data.mensagem || "Falhou" }, 401);
}


// ============================================
// ACTION: REQUEST (proxy genérico)
// Forward de qualquer endpoint do aEasy
// ============================================
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


// ============================================
// ACTION: GESTORES
// Busca lista de gestores (TipoConsultor 5/6) via DataTables
// ============================================
async function handleGestores(body: Record<string, unknown>): Promise<Response> {
  // Usa sessão interna (server-side) - não precisa receber cookie do client
  if (!isSessionValid()) {
    const lr = await handleLogin({});
    const ld = await lr.clone().json();
    if (!ld.success) return respond({ success: false, error: "LOGIN_FAILED" }, 401);
  }

  const params = new URLSearchParams();
  params.append("draw", "1");
  params.append("start", "0");
  params.append("length", "500");
  params.append("columns[0][data]", "IndividuosNome");
  params.append("columns[0][name]", "IndividuosNome");
  params.append("columns[0][orderable]", "true");
  params.append("columns[0][searchable]", "false");
  params.append("order[0][column]", "0");
  params.append("order[0][dir]", "asc");
  params.append("formPesquisa[submitFilter]", "true");
  params.append("formPesquisa[Situacao][]", "2"); // Ativos

  const resp = await fetch(`${AEASY_BASE}/consultores/listagem?${params.toString()}`, {
    method: "GET",
    headers: { "X-Requested-With": "XMLHttpRequest", "Cookie": sessionCookies },
    redirect: "manual",
  });

  if (resp.status === 302 || resp.status === 301) {
    sessionCookies = ""; lastLoginTime = 0;
    return respond({ success: false, error: "SESSION_EXPIRED" }, 401);
  }

  const text = await resp.text();
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) return respond({ success: false, error: "Invalid response" }, 500);

  const json = JSON.parse(text.substring(jsonStart));
  const allConsultores = json.data || [];

  // Filtrar apenas gestores (tipo 5 e 6)
  const gestores = allConsultores
    .filter((c: Record<string, string>) =>
      ["5", "6"].includes(String(c.ConsultoresTipoConsultorEnum))
    )
    .map((c: Record<string, string>) => ({
      id: c.ConsultoresId,
      nome: c.IndividuosNome,
      sede: c.GruposEmpresasNome || null,
      cidade: extractCidade(c.GruposEmpresasNome),
      tipo: c.ConsultoresTipoConsultor,
    }));

  return respond({ success: true, gestores, total: gestores.length });
}


// ============================================
// ACTION: BATCH
// Para cada gestor, chama /TopVendas e parseia HTML server-side
// ============================================
async function handleBatch(body: Record<string, unknown>): Promise<Response> {
  // Usa sessão interna (server-side)
  if (!isSessionValid()) {
    const lr = await handleLogin({});
    const ld = await lr.clone().json();
    if (!ld.success) return respond({ success: false, error: "LOGIN_FAILED" }, 401);
  }

  const gestores = body.gestores as Array<Record<string, string>>;
  if (!gestores || !gestores.length) return respond({ success: false, error: "gestores array required" }, 400);

  const tipoData = String(body.tipo_data || "3");
  const dataInicial = String(body.data_inicial || "");
  const dataFinal = String(body.data_final || "");
  const ordenar = String(body.ordenar || "6");
  const retornarLider = String(body.retornar_lider || "NAO");

  const results: Array<Record<string, unknown>> = [];

  for (const gestor of gestores) {
    try {
      const result = await fetchTopVendasGestor(
        gestor, tipoData, dataInicial, dataFinal, ordenar, retornarLider
      );
      results.push(result);
    } catch (e) {
      results.push({
        gestor: gestor.nome,
        sede: gestor.sede || null,
        cidade: gestor.cidade || null,
        gestor_ativadas_qtd: 0, gestor_ativadas_valor: 0,
        equipe_total_qtd: 0, equipe_total_valor: 0,
        equipe_sem_gestor_qtd: 0, equipe_sem_gestor_valor: 0,
        membros: [], error: (e as Error).message,
      });
    }
  }

  return respond({ success: true, data: results });
}


// ============================================
// FETCH TOP VENDAS FOR A SINGLE GESTOR
// ============================================
async function fetchTopVendasGestor(
  gestor: Record<string, string>,
  tipoData: string, dataInicial: string, dataFinal: string,
  ordenar: string, retornarLider: string
): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  params.append("TipoData", tipoData);
  params.append("DataInicial", dataInicial);
  params.append("DataFinal", dataFinal);
  params.append("Ordenar", ordenar);
  params.append("CampoOrder", "Quantidade");
  params.append("ConsultoresId", gestor.id);
  params.append("RetornarLiderComEquipe", retornarLider);

  const resp = await fetch(`${AEASY_BASE}/TopVendas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": sessionCookies,
    },
    body: params.toString(),
    redirect: "manual",
  });

  if (resp.status === 302 || resp.status === 301) throw new Error("SESSION_EXPIRED");

  const html = await resp.text();
  return parseTopVendasHTML(html, gestor);
}


// ============================================
// PARSE HTML from /TopVendas
// ============================================
function parseTopVendasHTML(html: string, gestor: Record<string, string>): Record<string, unknown> {
  const membros: Array<Record<string, unknown>> = [];
  let gestorQtd = 0, gestorValor = 0, equipeQtd = 0, equipeValor = 0;

  const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();
  const rows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];

  for (const row of rows) {
    if (row.includes("<th")) continue;
    const cells: string[] = [];
    const localTdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    let match;
    while ((match = localTdRegex.exec(row)) !== null) {
      cells.push(stripTags(match[1]));
    }
    if (cells.length < 4) continue;

    const nome = cells[0] || "";
    if (!nome || nome === "Total" || nome === "Consultor" || nome.includes("---")) continue;

    let ativadas = parseInt(cells[3]) || 0;
    if (ativadas === 0 && cells.length >= 3) ativadas = parseInt(cells[2]) || 0;

    let valor = 0;
    if (cells.length >= 5) {
      valor = parseMoneyBR(cells[cells.length - 1] || cells[cells.length - 2] || "0");
    }

    const isGestor = nome.toUpperCase() === (gestor.nome || "").toUpperCase();
    membros.push({ nome, ativadas_qtd: ativadas, ativadas_valor: valor, is_gestor: isGestor });

    if (isGestor) { gestorQtd = ativadas; gestorValor = valor; }
    else { equipeQtd += ativadas; equipeValor += valor; }
  }

  return {
    gestor: gestor.nome, sede: gestor.sede || null, cidade: gestor.cidade || null,
    gestor_ativadas_qtd: gestorQtd, gestor_ativadas_valor: gestorValor,
    equipe_total_qtd: gestorQtd + equipeQtd, equipe_total_valor: gestorValor + equipeValor,
    equipe_sem_gestor_qtd: equipeQtd, equipe_sem_gestor_valor: equipeValor,
    membros_total: membros.length,
    membros_ativos: membros.filter((m) => (m.ativadas_qtd as number) > 0).length,
    membros,
  };
}


// ============================================
// HELPERS
// ============================================
function extractCookies(r: Response): void {
  const sc = r.headers.get("set-cookie");
  if (!sc) return;
  const map: Record<string, string> = {};
  if (sessionCookies) {
    sessionCookies.split("; ").forEach((c) => {
      const [k, ...v] = c.split("=");
      if (k) map[k.trim()] = v.join("=");
    });
  }
  sc.split(/,(?=\s*\w+=)/).forEach((part) => {
    const m = part.split(";")[0].trim();
    const [k, ...v] = m.split("=");
    if (k) map[k.trim()] = v.join("=");
  });
  sessionCookies = Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

function isSessionValid(): boolean {
  return !!sessionCookies && !!lastLoginTime && (Date.now() - lastLoginTime < SESSION_TTL);
}

function extractCidade(centroCusto: string | null): string | null {
  if (!centroCusto) return null;
  const parts = centroCusto.split(" - ");
  if (parts.length >= 2) return parts[1].trim();
  return centroCusto;
}

function parseMoneyBR(str: string): number {
  if (!str) return 0;
  const cleaned = str.replace(/[R$\s]/g, "").replace(/\./g, "").replace(",", ".");
  const num = parseFloat(cleaned);
  return isNaN(num) ? 0 : num;
}

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
