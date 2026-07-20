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

      // Buscar lista de lideres reais para filtrar
      let lideresNomes: string[] = [];
      try {
        const lideresQs = new URLSearchParams();
        lideresQs.append("draw", "1");
        lideresQs.append("start", "0");
        lideresQs.append("length", "5000");
        lideresQs.append("columns[0][data]", "IndividuosNome");
        lideresQs.append("columns[0][name]", "IndividuosNome");
        lideresQs.append("columns[0][orderable]", "true");
        lideresQs.append("columns[0][searchable]", "false");
        lideresQs.append("order[0][column]", "0");
        lideresQs.append("order[0][dir]", "asc");
        lideresQs.append("formPesquisa[submitFilter]", "true");
        lideresQs.append("formPesquisa[Situacao][]", "2");
        lideresQs.append("formPesquisa[TipoConsultor]", "5");

        const lideresRes = await fetch(
          `${AEASY_BASE}/consultores/listagem?${lideresQs.toString()}`,
          { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest", "Cookie": session } }
        );
        const lideresData = await lideresRes.json();
        // Filtrar apenas os que tem ConsultoresLider = "1"
        lideresNomes = (lideresData.data || [])
          .filter((c: any) => String(c.ConsultoresLider) === "1")
          .map((c: any) => (c.IndividuosNome || "").trim().toUpperCase());
      } catch (e) {
        // Se falhar, retorna todos (sem filtro)
        lideresNomes = [];
      }

      // Tambem retornar IDs dos lideres para buscar equipe individualmente
      let lideresInfo: any[] = [];
      try {
        const lideresQs2 = new URLSearchParams();
        lideresQs2.append("draw", "1");
        lideresQs2.append("start", "0");
        lideresQs2.append("length", "5000");
        lideresQs2.append("columns[0][data]", "IndividuosNome");
        lideresQs2.append("columns[0][name]", "IndividuosNome");
        lideresQs2.append("columns[0][orderable]", "true");
        lideresQs2.append("columns[0][searchable]", "false");
        lideresQs2.append("order[0][column]", "0");
        lideresQs2.append("order[0][dir]", "asc");
        lideresQs2.append("formPesquisa[submitFilter]", "true");
        lideresQs2.append("formPesquisa[Situacao][]", "2");
        lideresQs2.append("formPesquisa[TipoConsultor]", "5");

        const lideresRes2 = await fetch(
          `${AEASY_BASE}/consultores/listagem?${lideresQs2.toString()}`,
          { method: "GET", headers: { "X-Requested-With": "XMLHttpRequest", "Cookie": session } }
        );
        const lideresData2 = await lideresRes2.json();
        lideresInfo = (lideresData2.data || [])
          .filter((c: any) => String(c.ConsultoresLider) === "1")
          .map((c: any) => ({
            id: c.ConsultoresId,
            nome: (c.IndividuosNome || "").trim(),
            centro: c.GruposEmpresasNome || "",
            cidade: c.IndividuosEnderecosCidadesNome || "",
            forma_lider: c.ConsultoresFormaLider
          }));
      } catch (e) { /* ignore */ }

      return jsonResponse({
        success: true,
        html,
        lideres: lideresNomes,
        lideres_info: lideresInfo,
        debug: {
          session_used: session.substring(0, 25) + "...",
          response_status: res.status,
          html_length: html.length,
          lideres_count: lideresNomes.length,
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

    // ─── IMPORTAR CACHE (Cron job - autonomo, salva no DB) ─────
    // Dividido em 3 etapas para evitar timeout:
    // etapa=1: Busca TopVendas geral + lideres, salva dados base
    // etapa=2: Busca equipes dos lideres 1-20
    // etapa=3: Busca equipes dos lideres 21-40
    // etapa=4: Busca equipes dos lideres 41-60+
    if (action === "importar-cache") {
      const session = await getSession(session_cookie);
      if (!session) return jsonResponse({ success: false, error: "Sessao nao disponivel" }, 401);

      const { data_inicial, data_final, etapa } = params;
      if (!data_inicial || !data_final) {
        return jsonResponse({ success: false, error: "data_inicial e data_final obrigatorios" }, 400);
      }

      const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
      const SUPABASE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY") || "";
      const hashKey = `campo_order=Quantidade|centro_custo=|data_final=${data_final}|data_inicial=${data_inicial}|ordenar=3|retornar_lider=NAO|tipo_data=2`;

      // Helper: parsear HTML
      function parseTable(html: string): any[] {
        const tbodyStart = html.indexOf('<tbody>');
        const tbodyEnd = html.indexOf('</tbody>');
        if (tbodyStart === -1) return [];
        const tbody = html.substring(tbodyStart, tbodyEnd);
        const rows = tbody.match(/<tr>(.*?)<\/tr>/gs) || [];
        const gestores: any[] = [];
        for (const row of rows) {
          const cellMatches = row.match(/<td[^>]*>(.*?)<\/td>/gs) || [];
          const cells = cellMatches.map((c: string) => c.replace(/<[^>]+>/g, '').trim());
          if (cells.length < 20) continue;
          const nome = cells[1];
          if (!nome || nome === 'Total' || nome === 'Totais') continue;
          const pn = (s: string) => parseInt(s.replace(/[^\d]/g, '') || '0');
          const pm = (s: string) => {
            const clean = s.replace(/R\$\s*/g, '').trim().replace(/\./g, '').replace(',', '.');
            return parseFloat(clean) || 0;
          };
          gestores.push({
            gestor: nome, cidade: cells[2], taxa_conversao: cells[3],
            cot_qtd: pn(cells[4]), cot_valor: pm(cells[5]),
            ati_qtd: pn(cells[13]), ati_valor: pm(cells[14]), ati_ticket: pm(cells[15]),
            sus_qtd: pn(cells[16]), can_qtd: pn(cells[19]),
            pbp_qtd: pn(cells[22]), pbp_valor: pm(cells[23]),
            equipe: []
          });
        }
        return gestores;
      }

      // Helper: salvar no DB
      async function saveToDb(dados: any[]) {
        await fetch(`${SUPABASE_URL}/rest/v1/relatorios_cache?filtro_hash=eq.${encodeURIComponent(hashKey)}`, {
          method: "DELETE",
          headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` }
        });
        const saveRes = await fetch(`${SUPABASE_URL}/rest/v1/relatorios_cache`, {
          method: "POST",
          headers: {
            "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}`,
            "Content-Type": "application/json", "Prefer": "return=minimal"
          },
          body: JSON.stringify({
            filtro_hash: hashKey, tipo_relatorio: "dashboard",
            data_inicial, data_final, dados,
            total_registros: dados.length,
            updated_at: new Date().toISOString(),
            expires_at: "2099-12-31T23:59:59+00:00"
          })
        });
        return saveRes.status;
      }

      // Helper: ler dados do DB
      async function readFromDb(): Promise<any[]> {
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/relatorios_cache?filtro_hash=eq.${encodeURIComponent(hashKey)}&select=dados`,
          { headers: { "apikey": SUPABASE_KEY, "Authorization": `Bearer ${SUPABASE_KEY}` } }
        );
        if (!res.ok) return [];
        const data = await res.json();
        return (data && data.length > 0 && data[0].dados) ? data[0].dados : [];
      }

      // ═══ ETAPA 1: Buscar dados gerais (rapido ~5s) ═══
      if (!etapa || etapa === "1") {
        const topUrl = `${AEASY_BASE}/TopVendas?TipoData=2&DataInicial=${data_inicial}&DataFinal=${data_final}&ConsultoresId=&EquipeId=&Ordenar=3&CampoOrder=Quantidade&CentrodeCusto=&RetornarLiderComEquipe=NAO`;
        const topRes = await fetch(topUrl, {
          method: "GET", headers: { "Accept": "text/html", "Cookie": session, "Referer": AEASY_BASE + "/" }
        });
        const topHtml = await topRes.text();

        // Buscar lideres
        const lideresQs = new URLSearchParams();
        lideresQs.append("draw", "1"); lideresQs.append("start", "0"); lideresQs.append("length", "5000");
        lideresQs.append("columns[0][data]", "IndividuosNome"); lideresQs.append("columns[0][name]", "IndividuosNome");
        lideresQs.append("columns[0][orderable]", "true"); lideresQs.append("columns[0][searchable]", "false");
        lideresQs.append("order[0][column]", "0"); lideresQs.append("order[0][dir]", "asc");
        lideresQs.append("formPesquisa[submitFilter]", "true");
        lideresQs.append("formPesquisa[Situacao][]", "2"); lideresQs.append("formPesquisa[TipoConsultor]", "5");

        const lideresRes = await fetch(`${AEASY_BASE}/consultores/listagem?${lideresQs.toString()}`, {
          method: "GET", headers: { "X-Requested-With": "XMLHttpRequest", "Cookie": session }
        });
        const lideresData = await lideresRes.json();
        const lideres = (lideresData.data || [])
          .filter((c: any) => String(c.ConsultoresLider) === "1")
          .map((c: any) => ({ id: c.ConsultoresId, nome: (c.IndividuosNome || "").trim() }));
        const liderNomes = lideres.map((l: any) => l.nome.toUpperCase());

        const allGestores = parseTable(topHtml);
        const gestoresFiltrados = allGestores.filter((g: any) => liderNomes.includes(g.gestor.toUpperCase()));

        // Salvar dados base (sem equipes ainda) + lista de lideres como metadata
        const dadosComMeta = gestoresFiltrados.map((g: any) => {
          const lider = lideres.find((l: any) => l.nome.toUpperCase() === g.gestor.toUpperCase());
          return { ...g, _lider_id: lider?.id || null };
        });

        const dbStatus = await saveToDb(dadosComMeta);
        return jsonResponse({
          success: true, etapa: "1/4", message: `Base salva: ${dadosComMeta.length} gestores`,
          db_status: dbStatus, gestores_count: dadosComMeta.length,
          com_cotacoes: dadosComMeta.filter((g: any) => g.cot_qtd > 0).length
        });
      }

      // ═══ ETAPAS 2, 3, 4: Buscar equipes em lotes de 20 ═══
      if (etapa === "2" || etapa === "3" || etapa === "4") {
        const dados = await readFromDb();
        if (!dados.length) return jsonResponse({ success: false, error: "Etapa 1 nao executada (sem dados no DB)" }, 400);

        // Filtrar lideres com cotacoes que precisam de equipe
        const lideresComCotacoes = dados.filter((g: any) => g.cot_qtd > 0 && g._lider_id);
        const loteSize = Math.ceil(lideresComCotacoes.length / 3);
        const loteIdx = parseInt(etapa) - 2; // 0, 1, 2
        const lote = lideresComCotacoes.slice(loteIdx * loteSize, (loteIdx + 1) * loteSize);

        let equipesCarregadas = 0;
        for (const gd of lote) {
          const eqUrl = `${AEASY_BASE}/TopVendas?TipoData=2&DataInicial=${data_inicial}&DataFinal=${data_final}&ConsultoresId=&EquipeId=${gd._lider_id}&Ordenar=3&CampoOrder=Quantidade&CentrodeCusto=&RetornarLiderComEquipe=NAO`;
          try {
            const eqRes = await fetch(eqUrl, {
              method: "GET", headers: { "Accept": "text/html", "Cookie": session, "Referer": AEASY_BASE + "/" }
            });
            const eqHtml = await eqRes.text();
            const membros = parseTable(eqHtml)
              .filter((m: any) => m.gestor.toUpperCase() !== gd.gestor.toUpperCase() && m.cot_qtd >= 1);
            gd.equipe = membros;
            equipesCarregadas++;
          } catch (e) { /* continuar */ }
        }

        // Atualizar dados no DB (merge com equipes)
        // Re-ler dados completos, atualizar apenas os do lote
        const dadosCompletos = await readFromDb();
        for (const gAtualizado of lote) {
          const idx = dadosCompletos.findIndex((g: any) => g.gestor.toUpperCase() === gAtualizado.gestor.toUpperCase());
          if (idx !== -1) dadosCompletos[idx] = gAtualizado;
        }

        const dbStatus = await saveToDb(dadosCompletos);
        const totalMembros = dadosCompletos.reduce((acc: number, g: any) => acc + (g.equipe?.length || 0), 0);

        return jsonResponse({
          success: true, etapa: `${etapa}/4`,
          message: `Lote ${loteIdx+1}: ${equipesCarregadas} equipes carregadas`,
          db_status: dbStatus, lote_size: lote.length, equipesCarregadas, totalMembros
        });
      }

      return jsonResponse({ success: false, error: "Etapa invalida: " + etapa }, 400);
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
