/**
 * Supabase Edge Function - aeasy-proxy (Proxy Inteligente)
 * 
 * Replica a lógica do AVP-relatorios: login no aEasy, busca gestores,
 * processa /TopVendas em lotes (batch) parseando HTML server-side.
 * 
 * Actions:
 *   - login: Faz login no aEasy, retorna session_cookie
 *   - gestores: Busca lista de gestores (tipo 5/6) via DataTables
 *   - batch: Para cada gestor no array, chama /TopVendas e parseia HTML
 * 
 * Deploy: supabase functions deploy aeasy-proxy --no-verify-jwt
 */

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const action = body.action;

    if (action === "login") return await handleLogin(body);
    if (action === "gestores") return await handleGestores(body);
    if (action === "batch") return await handleBatch(body);

    return respond({ error: "Actions: login, gestores, batch" }, 400);
  } catch (e) {
    return respond({ error: (e as Error).message }, 500);
  }
});

// ============================================
// ACTION: LOGIN
// Faz login no aEasy e retorna o cookie de sessão
// ============================================
async function handleLogin(body: Record<string, string>): Promise<Response> {
  const login = body.login || "03268401503";
  const senha = body.senha || "Ale@2026";

  // Step 1: Get session cookie
  const getResp = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "GET",
    redirect: "manual",
  });
  let cookies = extractAllCookies(getResp);

  // Step 2: POST login
  const postResp = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": cookies,
    },
    body: `UsuariosLogin=${encodeURIComponent(login)}&UsuariosSenha=${encodeURIComponent(senha)}`,
    redirect: "manual",
  });

  // Merge cookies
  cookies = mergeCookies(cookies, postResp);

  const text = await postResp.text();
  let data: Record<string, unknown> = {};
  try { data = JSON.parse(text); } catch { data = { raw: text.substring(0, 300) }; }

  if (data.mensagem && String(data.mensagem).includes("sucesso")) {
    return respond({ success: true, session_cookie: cookies, mensagem: data.mensagem });
  }

  return respond({ success: false, error: data.mensagem || "Login falhou" }, 401);
}

// ============================================
// ACTION: GESTORES
// Busca lista de gestores (TipoConsultor 5/6) via DataTables
// ============================================
async function handleGestores(body: Record<string, unknown>): Promise<Response> {
  const cookies = String(body.session_cookie || "");
  if (!cookies) return respond({ success: false, error: "session_cookie required" }, 400);

  // Fetch all gestores (tipo 5=Regional, 6=Gestor), ativos
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
    headers: {
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": cookies,
    },
    redirect: "manual",
  });

  if (resp.status === 302 || resp.status === 301) {
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

  return respond({
    success: true,
    gestores,
    total: gestores.length,
  });
}

// ============================================
// ACTION: BATCH
// Para cada gestor, chama /TopVendas e parseia o HTML retornado
// ============================================
async function handleBatch(body: Record<string, unknown>): Promise<Response> {
  const cookies = String(body.session_cookie || "");
  if (!cookies) return respond({ success: false, error: "session_cookie required" }, 400);

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
        cookies, gestor, tipoData, dataInicial, dataFinal, ordenar, retornarLider
      );
      results.push(result);
    } catch (e) {
      results.push({
        gestor: gestor.nome,
        sede: gestor.sede || null,
        cidade: gestor.cidade || null,
        gestor_ativadas_qtd: 0,
        gestor_ativadas_valor: 0,
        equipe_total_qtd: 0,
        equipe_total_valor: 0,
        equipe_sem_gestor_qtd: 0,
        equipe_sem_gestor_valor: 0,
        membros_total: 0,
        membros_ativos: 0,
        membros: [],
        error: (e as Error).message,
      });
    }
  }

  return respond({ success: true, data: results });
}

// ============================================
// FETCH TOP VENDAS FOR A SINGLE GESTOR
// ============================================
async function fetchTopVendasGestor(
  cookies: string,
  gestor: Record<string, string>,
  tipoData: string,
  dataInicial: string,
  dataFinal: string,
  ordenar: string,
  retornarLider: string
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
      "Cookie": cookies,
    },
    body: params.toString(),
    redirect: "manual",
  });

  if (resp.status === 302 || resp.status === 301) {
    throw new Error("SESSION_EXPIRED");
  }

  const html = await resp.text();
  return parseTopVendasHTML(html, gestor);
}

// ============================================
// PARSE HTML from /TopVendas
// Extrai dados da tabela HTML retornada pelo aEasy
// ============================================
function parseTopVendasHTML(html: string, gestor: Record<string, string>): Record<string, unknown> {
  const membros: Array<Record<string, unknown>> = [];
  let gestorQtd = 0;
  let gestorValor = 0;
  let equipeQtd = 0;
  let equipeValor = 0;

  // Parse table rows: <tr> with <td> cells
  // Pattern: Nome | Cotação | Cadastros | Ativadas | Canceladas | Suspensas | Boleto Pago | Valor
  const rowRegex = /<tr[^>]*>[\s\S]*?<\/tr>/gi;
  const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
  const stripTags = (s: string) => s.replace(/<[^>]*>/g, "").trim();

  const rows = html.match(rowRegex) || [];

  for (const row of rows) {
    // Skip header rows
    if (row.includes("<th")) continue;

    const cells: string[] = [];
    let match;
    const localTdRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
    while ((match = localTdRegex.exec(row)) !== null) {
      cells.push(stripTags(match[1]));
    }

    // Minimum cells expected: Nome + some numeric columns
    if (cells.length < 4) continue;

    // Try to identify the "Ativadas" column (usually position 3 or based on header)
    // Pattern from aEasy TopVendas:
    // [0]=Nome, [1]=Cotação, [2]=Cadastros, [3]=Ativadas/Efetivadas, [4]=Canceladas, [5]=Suspensas, [6]=Boleto, [7]=Valor
    const nome = cells[0] || "";
    if (!nome || nome === "Total" || nome === "Consultor" || nome.includes("---")) continue;

    // Find ativadas (usually column index depends on "Ordenar" param)
    // For Ordenar=6 (Ativadas), the relevant columns are:
    let ativadas = 0;
    let valor = 0;

    // Try to parse: look for numeric cells
    // Column 3 is typically "Ativadas" quantity
    if (cells.length >= 4) {
      ativadas = parseInt(cells[3]) || 0;
    }
    // Last column or second-to-last is typically the monetary value
    if (cells.length >= 5) {
      const valorStr = cells[cells.length - 1] || cells[cells.length - 2] || "0";
      valor = parseMoneyBR(valorStr);
    }

    // If no ativadas found, try alternative column positions
    if (ativadas === 0 && cells.length >= 3) {
      // Try column 2
      ativadas = parseInt(cells[2]) || 0;
    }

    const isGestor = nome.toUpperCase() === (gestor.nome || "").toUpperCase();

    membros.push({
      nome,
      ativadas_qtd: ativadas,
      ativadas_valor: valor,
      is_gestor: isGestor,
    });

    if (isGestor) {
      gestorQtd = ativadas;
      gestorValor = valor;
    } else {
      equipeQtd += ativadas;
      equipeValor += valor;
    }
  }

  return {
    gestor: gestor.nome,
    sede: gestor.sede || null,
    cidade: gestor.cidade || null,
    gestor_ativadas_qtd: gestorQtd,
    gestor_ativadas_valor: gestorValor,
    equipe_total_qtd: gestorQtd + equipeQtd,
    equipe_total_valor: gestorValor + equipeValor,
    equipe_sem_gestor_qtd: equipeQtd,
    equipe_sem_gestor_valor: equipeValor,
    membros_total: membros.length,
    membros_ativos: membros.filter((m) => (m.ativadas_qtd as number) > 0).length,
    membros,
  };
}

// ============================================
// HELPERS
// ============================================
function extractAllCookies(resp: Response): string {
  const sc = resp.headers.get("set-cookie");
  if (!sc) return "";
  const map: Record<string, string> = {};
  sc.split(/,(?=\s*\w+=)/).forEach((part) => {
    const m = part.split(";")[0].trim();
    const [k, ...v] = m.split("=");
    if (k) map[k.trim()] = v.join("=");
  });
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

function mergeCookies(existing: string, resp: Response): string {
  const map: Record<string, string> = {};
  if (existing) {
    existing.split("; ").forEach((c) => {
      const [k, ...v] = c.split("=");
      if (k) map[k.trim()] = v.join("=");
    });
  }
  const sc = resp.headers.get("set-cookie");
  if (sc) {
    sc.split(/,(?=\s*\w+=)/).forEach((part) => {
      const m = part.split(";")[0].trim();
      const [k, ...v] = m.split("=");
      if (k) map[k.trim()] = v.join("=");
    });
  }
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join("; ");
}

function extractCidade(centroCusto: string | null): string | null {
  if (!centroCusto) return null;
  // "02 - Petrolina - Pe" → "Petrolina"
  const parts = centroCusto.split(" - ");
  if (parts.length >= 2) return parts[1].trim();
  return centroCusto;
}

function parseMoneyBR(str: string): number {
  if (!str) return 0;
  // "R$ 1.234,56" or "1234.56" or "1.234,56"
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
