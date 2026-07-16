import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, session_cookie, ...params } = body;

    // ─── LOGIN ───────────────────────────────────────────────
    if (action === "login") {
      const { cpf, senha } = params;
      const res = await fetch(`${AEASY_BASE}/conta/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          UsuariosLogin: cpf,
          UsuariosSenha: senha,
        }),
        redirect: "manual",
      });

      const cookies = res.headers.getSetCookie?.() || [];
      const phpSession = cookies
        .find((c: string) => c.startsWith("PHPSESSID"))
        ?.split(";")[0];

      const data = await res.json().catch(() => null);

      if (phpSession && data?.mensagem?.includes("sucesso")) {
        return jsonResponse({ success: true, session_cookie: phpSession });
      }
      return jsonResponse({ success: false, error: data?.mensagem || "Falha no login" }, 401);
    }

    // ─── GESTORES (Top Vendas) ───────────────────────────────
    if (action === "gestores") {
      const { tipo_data, data_inicial, data_final, ordenar, campo_order, centro_custo, retornar_lider } = params;

      const formData = new URLSearchParams();
      formData.append("TipoData", tipo_data || "3");
      formData.append("DataInicial", data_inicial);
      formData.append("DataFinal", data_final);
      formData.append("Ordenar", ordenar || "3");
      formData.append("CampoOrder", campo_order || "Quantidade");
      if (centro_custo) formData.append("CentrodeCusto", centro_custo);
      if (retornar_lider) formData.append("RetornarLiderComEquipe", retornar_lider);

      const res = await fetch(`${AEASY_BASE}/TopVendas`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "X-Requested-With": "XMLHttpRequest",
          Cookie: session_cookie,
        },
        body: formData.toString(),
      });

      const html = await res.text();
      return jsonResponse({ success: true, html });
    }

    // ─── VENDAS (Associados) ─────────────────────────────────
    if (action === "vendas") {
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
          Cookie: session_cookie,
        },
        body: formData.toString(),
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── CONSULTORES ─────────────────────────────────────────
    if (action === "consultores") {
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
          Cookie: session_cookie,
        },
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── FLUXO DE CAIXA ─────────────────────────────────────
    if (action === "fluxo-caixa") {
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
          Cookie: session_cookie,
        },
        body: formData.toString(),
      });

      const data = await res.json();
      return jsonResponse({ success: true, data });
    }

    // ─── BATCH (multiplos gestores) ──────────────────────────
    if (action === "batch") {
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
            Cookie: session_cookie,
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
