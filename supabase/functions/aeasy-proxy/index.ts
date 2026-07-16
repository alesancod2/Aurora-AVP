import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";

// ─── CREDENCIAIS VIA SECRETS (variaveis de ambiente) ─────────
const AEASY_CPF = Deno.env.get("AEASY_CPF") || "";
const AEASY_SENHA = Deno.env.get("AEASY_SENHA") || "";

// Cache da sessao em memoria
let cachedSession: string | null = null;
let sessionExpiry: number = 0;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ─── EXTRAIR COOKIE DE RESPOSTA ──────────────────────────────
function extractSessionCookie(res: Response): string | null {
  // Metodo 1: getSetCookie (Deno moderno)
  try {
    const cookies = res.headers.getSetCookie?.() || [];
    for (const c of cookies) {
      if (c.startsWith("PHPSESSID")) {
        return c.split(";")[0]; // "PHPSESSID=abc123"
      }
    }
  } catch (e) { /* fallback */ }

  // Metodo 2: get('set-cookie') manual
  try {
    const raw = res.headers.get("set-cookie") || "";
    const match = raw.match(/PHPSESSID=([^;]+)/);
    if (match) return "PHPSESSID=" + match[1];
  } catch (e) { /* fallback */ }

  return null;
}

// ─── LOGIN INTERNO (usa credenciais do Secret) ───────────────
async function doInternalLogin(cpf?: string, senha?: string): Promise<{ session: string | null; error: string | null; debug: any }> {
  const loginCpf = cpf || AEASY_CPF;
  const loginSenha = senha || AEASY_SENHA;

  if (!loginCpf || !loginSenha) {
    return { session: null, error: "CPF e senha nao configurados", debug: { cpf_length: loginCpf.length, senha_length: loginSenha.length } };
  }

  const res = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      UsuariosLogin: loginCpf,
      UsuariosSenha: loginSenha,
    }),
    redirect: "manual",
  });

  const phpSession = extractSessionCookie(res);
  const responseText = await res.text();
  let data: any = null;
  try { data = JSON.parse(responseText); } catch (e) { /* nao e JSON */ }

  const debug = {
    status: res.status,
    phpSession: phpSession ? phpSession.substring(0, 20) + "..." : null,
    responsePreview: responseText.substring(0, 200),
    hasSetCookie: !!res.headers.get("set-cookie"),
    allHeaders: Object.fromEntries(res.headers.entries()),
  };

  if (phpSession && data?.mensagem?.includes("sucesso")) {
    cachedSession = phpSession;
    sessionExpiry = Date.now() + 55 * 60 * 1000;
    return { session: phpSession, error: null, debug };
  }

  return { session: null, error: data?.mensagem || "Login falhou (status " + res.status + ")", debug };
}

// ─── OBTER SESSAO ────────────────────────────────────────────
async function getSession(clientSession?: string): Promise<string | null> {
  if (clientSession) return clientSession;
  if (cachedSession && Date.now() < sessionExpiry) return cachedSession;
  const result = await doInternalLogin();
  return result.session;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, session_cookie, ...params } = body;

    // ─── LOGIN ───────────────────────────────────────────────
    // Login manual (frontend envia CPF/senha) OU login automatico (sem parametros)
    if (action === "login") {
      const result = await doInternalLogin(params.cpf, params.senha);

      if (result.session) {
        return jsonResponse({ success: true, session_cookie: result.session, debug: result.debug });
      }
      return jsonResponse({ success: false, error: result.error, debug: result.debug }, 401);
    }

    // ─── GESTORES (Top Vendas) ───────────────────────────────
    if (action === "gestores") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel. Configure AEASY_CPF/AEASY_SENHA ou envie session_cookie." }, 401);

      const { tipo_data, data_inicial, data_final, ordenar, campo_order, centro_custo, retornar_lider, consultor_id, equipe_id } = params;

      // TopVendas usa GET com parametros na query string
      const qs = new URLSearchParams();
      qs.append("TipoData", tipo_data || "3");
      qs.append("DataInicial", data_inicial);
      qs.append("DataFinal", data_final);
      qs.append("Ordenar", ordenar || "3");
      qs.append("CampoOrder", campo_order || "Quantidade");
      qs.append("ConsultoresId", consultor_id || "");
      qs.append("EquipeId", equipe_id || "");
      qs.append("CentrodeCusto", centro_custo || "");
      qs.append("RetornarLiderComEquipe", retornar_lider || "ATE_NIVEL_1");

      const url = `${AEASY_BASE}/TopVendas?${qs.toString()}`;

      const res = await fetch(url, {
        method: "GET",
        headers: {
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Cookie": session,
          "Referer": AEASY_BASE + "/",
        },
      });

      const html = await res.text();
      return jsonResponse({
        success: true,
        html,
        debug: {
          session_used: session.substring(0, 25) + "...",
          response_status: res.status,
          html_length: html.length,
          html_preview: html.substring(0, 500),
          request_url: url,
        }
      });
    }

    // ─── VENDAS (Associados) ─────────────────────────────────
    if (action === "vendas") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel" }, 401);

      const { start, length, situacao, tipo_data, data_inicial, data_final, campo_pesquisa, search, centro_custo } = params;

      const formData = new URLSearchParams();
      formData.append("draw", "1");
      formData.append("start", String(start || 0));
      formData.append("length", String(length || 50));
      formData.append("columns[0][data]", "ClientesIndividuosNome");
      formData.append("columns[0][name]", "ClientesIndividuosNome");
      formData.append("columns[0][searchable]", "false");
      formData.append("columns[0][orderable]", "true");
      formData.append("order[0][column]", "0");
      formData.append("order[0][dir]", "asc");
      formData.append("formPesquisa[submitFilter]", "true");

      if (situacao) {
        const sits = Array.isArray(situacao) ? situacao : [situacao];
        sits.forEach((s: string) => formData.append("formPesquisa[VendasSituacao][]", s));
      }
      if (tipo_data) formData.append("formPesquisa[TipoData]", tipo_data);
      if (data_inicial) formData.append("formPesquisa[DataInicial]", data_inicial);
      if (data_final) formData.append("formPesquisa[DataFinal]", data_final);
      if (campo_pesquisa) formData.append("formPesquisa[campo_pesquisa]", campo_pesquisa);
      if (search) formData.append("formPesquisa[search]", search);
      if (centro_custo) formData.append("formPesquisa[ConsultoresCentroCustoId][]", centro_custo);

      const res = await fetch(`${AEASY_BASE}/vendas/listagem`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: session,
        },
        body: formData.toString(),
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── CONSULTORES ─────────────────────────────────────────
    if (action === "consultores") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel" }, 401);

      const { start, length, situacao, centro_custo, tipo_consultor } = params;

      const qs = new URLSearchParams();
      qs.append("draw", "1");
      qs.append("start", String(start || 0));
      qs.append("length", String(length || 50));
      qs.append("columns[0][data]", "IndividuosNome");
      qs.append("columns[0][name]", "IndividuosNome");
      qs.append("columns[0][orderable]", "true");
      qs.append("columns[0][searchable]", "false");
      qs.append("order[0][column]", "0");
      qs.append("order[0][dir]", "asc");
      qs.append("formPesquisa[submitFilter]", "true");

      if (situacao) {
        const sits = Array.isArray(situacao) ? situacao : [situacao];
        sits.forEach((s: string) => qs.append("formPesquisa[Situacao][]", s));
      }
      if (centro_custo) qs.append("formPesquisa[CentroCustoId][]", centro_custo);
      if (tipo_consultor) qs.append("formPesquisa[TipoConsultor]", tipo_consultor);

      const res = await fetch(`${AEASY_BASE}/consultores/listagem?${qs.toString()}`, {
        method: "GET",
        headers: {
          "X-Requested-With": "XMLHttpRequest",
          Cookie: session,
        },
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── FLUXO DE CAIXA ─────────────────────────────────────
    if (action === "fluxo-caixa") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel" }, 401);

      const { page, length, data_inicial, data_final, tipo_data, faturas_tipo, forma_cobranca } = params;

      const formData = new URLSearchParams();
      formData.append("page", String(page || 1));
      formData.append("length", String(length || 100));
      formData.append("DataInicial", data_inicial);
      formData.append("DataFinal", data_final);
      if (tipo_data) formData.append("TipoData", tipo_data);
      if (faturas_tipo) formData.append("FaturasTipo", faturas_tipo);
      if (forma_cobranca) formData.append("FormaCobranca", forma_cobranca);

      const res = await fetch(`${AEASY_BASE}/fluxo-caixa/buscar-pagina`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: session,
        },
        body: formData.toString(),
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── BATCH (multiplos gestores) ──────────────────────────
    if (action === "batch") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel" }, 401);

      const { gestores, tipo_data, data_inicial, data_final, ordenar, campo_order, retornar_lider } = params;
      const results: any[] = [];

      for (const gestor of gestores) {
        const formData = new URLSearchParams();
        formData.append("TipoData", tipo_data || "3");
        formData.append("DataInicial", data_inicial);
        formData.append("DataFinal", data_final);
        formData.append("Ordenar", ordenar || "3");
        formData.append("CampoOrder", campo_order || "Quantidade");
        formData.append("ConsultoresId", gestor.id);
        if (retornar_lider) formData.append("RetornarLiderComEquipe", retornar_lider);

        const res = await fetch(`${AEASY_BASE}/TopVendas`, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "X-Requested-With": "XMLHttpRequest",
            Cookie: session,
          },
          body: formData.toString(),
        });

        const html = await res.text();
        results.push({ gestor: gestor.nome, id: gestor.id, html });
      }

      return jsonResponse({ success: true, data: results });
    }

    return jsonResponse({ error: "Action nao reconhecida: " + action }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 500);
  }
});

function jsonResponse(data: any, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
