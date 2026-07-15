/**
 * Supabase Edge Function - Import Data from aEasy
 * 
 * Importa consultores e vendas do aEasy para o Supabase PostgreSQL.
 * Projetado para ser chamado via cron (a cada 15min) ou manualmente.
 * 
 * Estratégia anti-timeout:
 * - Processa em lotes de 500 registros (configurable via batch_size)
 * - Usa offset para continuar de onde parou (resumable)
 * - Timeout interno de 50s (Edge Functions têm limite de 60s)
 * - Registra progresso no sync_log para rastreamento
 * 
 * Uso:
 *   POST /functions/v1/import-data
 *   Body: { "target": "consultores"|"vendas"|"all", "batch_size": 500, "offset": 0 }
 * 
 * Deploy: supabase functions deploy import-data --no-verify-jwt
 */

const AEASY_BASE = "https://aeasy.autovaleprevencoes.org";
const SUPABASE_URL = "https://zjacembodtjrkynfmtxf.supabase.co";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || 
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4";

const EXECUTION_TIMEOUT = 50_000; // 50s (Edge Function limit = 60s)

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

// --- aEasy Session Management ---
let sessionCookies = "";
let lastLoginTime = 0;

async function aeasyLogin(): Promise<boolean> {
  const s = await fetch(`${AEASY_BASE}/conta/login`, { method: "GET", redirect: "manual" });
  extractCookies(s);

  const r = await fetch(`${AEASY_BASE}/conta/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": sessionCookies,
    },
    body: `UsuariosLogin=03268401503&UsuariosSenha=${encodeURIComponent("Ale@2026")}`,
    redirect: "manual",
  });
  extractCookies(r);

  const text = await r.text();
  try {
    const data = JSON.parse(text);
    if (data.mensagem?.includes("sucesso")) {
      lastLoginTime = Date.now();
      return true;
    }
  } catch { /* ignore */ }
  return false;
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

// --- aEasy Data Fetching ---
async function fetchFromAeasy(endpoint: string, method: string, params: string): Promise<{ data: unknown[]; total: number }> {
  if (!sessionCookies || Date.now() - lastLoginTime > 50 * 60 * 1000) {
    const ok = await aeasyLogin();
    if (!ok) throw new Error("LOGIN_FAILED");
  }

  const headers: Record<string, string> = {
    "X-Requested-With": "XMLHttpRequest",
    "Cookie": sessionCookies,
  };
  if (method === "POST") headers["Content-Type"] = "application/x-www-form-urlencoded";

  const url = method === "GET" ? `${AEASY_BASE}${endpoint}?${params}` : `${AEASY_BASE}${endpoint}`;
  const opts: RequestInit = { method, headers, redirect: "manual" };
  if (method === "POST") opts.body = params;

  const resp = await fetch(url, opts);
  extractCookies(resp);

  if (resp.status === 302 || resp.status === 301) {
    sessionCookies = "";
    lastLoginTime = 0;
    throw new Error("SESSION_EXPIRED");
  }

  const text = await resp.text();
  const jsonStart = text.indexOf("{");
  if (jsonStart < 0) throw new Error("INVALID_RESPONSE");

  const json = JSON.parse(text.substring(jsonStart));
  return {
    data: json.data || [],
    total: parseInt(json.recordsFiltered || json.recordsTotal || "0"),
  };
}

function buildDataTablesParams(columnName: string, filters: Record<string, string | string[]>, start: number, length: number): string {
  const params = new URLSearchParams();
  params.append("draw", "1");
  params.append("start", String(start));
  params.append("length", String(length));
  params.append("columns[0][data]", columnName);
  params.append("columns[0][name]", columnName);
  params.append("columns[0][orderable]", "true");
  params.append("columns[0][searchable]", "false");
  params.append("order[0][column]", "0");
  params.append("order[0][dir]", "asc");
  params.append("formPesquisa[submitFilter]", "true");

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach(v => params.append(`formPesquisa[${key}][]`, v));
    } else {
      params.append(`formPesquisa[${key}]`, value);
    }
  }
  return params.toString();
}

// --- Supabase DB Operations ---
async function upsertToSupabase(table: string, records: Record<string, unknown>[], conflictColumn: string): Promise<{ inserted: number; error?: string }> {
  const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "apikey": SUPABASE_SERVICE_KEY,
      "Prefer": "resolution=merge-duplicates",
    },
    body: JSON.stringify(records),
  });

  if (!resp.ok) {
    const err = await resp.text();
    return { inserted: 0, error: `${resp.status}: ${err.substring(0, 500)}` };
  }
  return { inserted: records.length };
}

async function logSync(tabela: string, tipo: string, status: string, registros: number, erro?: string): Promise<void> {
  await fetch(`${SUPABASE_URL}/rest/v1/sync_log`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`,
      "apikey": SUPABASE_SERVICE_KEY,
    },
    body: JSON.stringify({
      tabela,
      tipo,
      status,
      registros_processados: registros,
      registros_inseridos: registros,
      erro: erro || null,
      concluido_em: status !== "running" ? new Date().toISOString() : null,
    }),
  });
}

// --- Field Mapping ---
function mapConsultor(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    consultores_id: raw.ConsultoresId,
    individuos_nome: raw.IndividuosNome || "",
    individuos_documento: raw.IndividuosDocumento || null,
    individuos_nome_fantasia: raw.IndividuosNomeFantasia || null,
    individuos_email: raw.IndividuosEmail || null,
    individuos_data_nascimento: raw.IndividuosDataNascimento || null,
    individuos_sexo: raw.IndividuosSexo || null,
    individuos_login: raw.IndividuosLogin || null,
    individuos_contatos_ddd: raw.IndividuosContatosDdd || null,
    individuos_contatos_telefone: raw.IndividuosContatosTelefone || null,
    individuos_enderecos_logradouro: raw.IndividuosEnderecosLogradouro || null,
    individuos_enderecos_numero: raw.IndividuosEnderecosNumero || null,
    individuos_enderecos_bairro: raw.IndividuosEnderecosBairro || null,
    individuos_enderecos_cep: raw.IndividuosEnderecosCep || null,
    individuos_enderecos_cidades_nome: raw.IndividuosEnderecosCidadesNome || null,
    individuos_enderecos_estados_nome: raw.IndividuosEnderecosEstadosNome || null,
    individuos_enderecos_estados_uf: raw.IndividuosEnderecosEstadosUf || null,
    consultores_tipo_consultor: raw.ConsultoresTipoConsultor || null,
    consultores_tipo_consultor_enum: raw.ConsultoresTipoConsultorEnum ? parseInt(String(raw.ConsultoresTipoConsultorEnum)) : null,
    consultores_situacao_cadastro: raw.ConsultoresSituacaoCadastro || null,
    consultores_situacao_cadastro_enum: raw.ConsultoresSituacaoCadastroEnum ? parseInt(String(raw.ConsultoresSituacaoCadastroEnum)) : null,
    consultores_gerar_comissao: raw.ConsultoresGerarComissao === "1" || raw.ConsultoresGerarComissao === true,
    consultores_data_cadastro: raw.ConsultoresDataCadastro || null,
    consultores_patrocinador_individuos_nome: raw.ConsultoresPatrocinadorIndividuosNome || null,
    consultores_indicador_individuos_nome: raw.ConsultoresIndicadorIndividuosNome || null,
    consultores_niveis_nome: raw.ConsultoresNiveisNome || null,
    grupos_empresas_nome: raw.GruposEmpresasNome || null,
    grupos_consultores_nome: raw.GruposConsultoresNome || null,
    individuos_dados_bancarios_bancos_nome: raw.IndividuosDadosBancariosNome || null,
    individuos_dados_bancarios_conta: raw.IndividuosDadosBancariosConta || null,
    individuos_dados_bancarios_agencia: raw.IndividuosDadosBancariosAgencia || null,
    synced_at: new Date().toISOString(),
    raw_data: raw,
  };
}

function mapVenda(raw: Record<string, unknown>): Record<string, unknown> {
  return {
    vendas_id: raw.VendasId,
    vendas_clientes_id: raw.VendasClientesId || null,
    clientes_individuos_nome: raw.ClientesIndividuosNome || null,
    clientes_individuos_documento: raw.ClientesIndividuosDocumento || null,
    clientes_individuos_email: raw.ClientesIndividuosEmail || null,
    clientes_individuos_data_nascimento: raw.ClientesIndividuosDataNascimento || null,
    clientes_individuos_sexo: raw.ClientesIndividuosSexo || null,
    clientes_individuos_rg: raw.ClientesIndividuosRg || null,
    clientes_individuos_contatos_ddd: raw.ClientesIndividuosContatosDdd || null,
    clientes_individuos_contatos_telefone: raw.ClientesIndividuosContatosTelefone || null,
    clientes_individuos_id: raw.ClientesIndividuosId || null,
    individuos_enderecos_logradouro: raw.IndividuosEnderecosLogradouro || null,
    individuos_enderecos_numero: raw.IndividuosEnderecosNumero || null,
    individuos_enderecos_bairro: raw.IndividuosEnderecosBairro || null,
    individuos_enderecos_cep: raw.IndividuosEnderecosCep || null,
    individuos_enderecos_cidades_nome: raw.IndividuosEnderecosCidadesNome || null,
    individuos_enderecos_estados_nome: raw.IndividuosEnderecosEstadosNome || null,
    individuos_enderecos_estados_uf: raw.IndividuosEnderecosEstadosUf || null,
    individuos_enderecos_complemento: raw.IndividuosEnderecosComplemento || null,
    vendas_carros_placa: raw.VendasCarrosPlaca || null,
    vendas_carros_marcas_nome: raw.VendasCarrosMarcasNome || null,
    vendas_carros_modelos_nome: raw.VendasCarrosModelosNome || null,
    vendas_carros_anos_modelos_nome: raw.VendasCarrosAnosModelosNome || null,
    carros_ano_fabricacao: raw.CarrosAnoFabricacao || null,
    vendas_carros_carros_cor: raw.VendasCarrosCarrosCor || null,
    carros_chassi: raw.CarrosChassi || null,
    carros_renavan: raw.CarrosRenavan || null,
    vendas_carros_codigo_fipe: raw.VendasCarrosCodigoFipe || null,
    vendas_carros_categorias_carros_nome: raw.VendasCarrosCategoriasCarrosNome || null,
    vendas_carros_categorias_planos_nome: raw.VendasCarrosCategoriasplanosNome || raw.VendasCarrosCategoriasPlanosNome || null,
    vendas_carros_categorias_planos_id: raw.VendasCarrosCategoriasPlanosId || null,
    vendas_carros_placa_implemento: raw.VendasCarrosPlacaImplemento || null,
    vendas_carros_placa_implemento2: raw.VendasCarrosPlacaImplemento2 || null,
    vendas_carros_placa_implemento3: raw.VendasCarrosPlacaImplemento3 || null,
    vendas_valor: parseDecimal(raw.VendasValor),
    vendas_carros_valor_adesao: parseDecimal(raw.VendasCarrosValorAdesao),
    vendas_carros_valor_fipe: parseDecimal(raw.VendasCarrosValorFipe),
    vendas_carros_cota: parseDecimal(raw.VendasCarrosCota),
    vendas_carros_valor_mensal: parseDecimal(raw.VendasCarrosValorMensal),
    vendas_carros_valor_total: parseDecimal(raw.VendasCarrosValorTotal),
    vendas_vencimento: raw.VendasVencimento ? parseInt(String(raw.VendasVencimento)) : null,
    vendas_forma_pagamento_enum: raw.VendasFormaPagamentoEnum ? parseInt(String(raw.VendasFormaPagamentoEnum)) : null,
    vendas_quantidade_faturas_pagas: raw.VendasQuantidadeFaturasPagas ? parseInt(String(raw.VendasQuantidadeFaturasPagas)) : 0,
    vendas_quantidade_faturas_atraso: raw.VendasQuantidadeFaturasAtraso ? parseInt(String(raw.VendasQuantidadeFaturasAtraso)) : 0,
    vendas_dias_atraso: raw.VendasDiasAtraso ? parseInt(String(raw.VendasDiasAtraso)) : 0,
    vendas_parcelas: raw.VendasParcelas ? parseInt(String(raw.VendasParcelas)) : 12,
    vendas_isenta_cobranca: raw.VendasIsentaCobranca === "1" || raw.VendasIsentaCobranca === true,
    vendas_situacao: raw.VendasSituacao || null,
    vendas_situacao_enum: raw.VendasSituacaoEnum ? parseInt(String(raw.VendasSituacaoEnum)) : 1,
    vendas_classificacao: raw.VendasClassificacao || null,
    vendas_tipo_suspensao: raw.VendasTipoSuspensao || null,
    vendas_motivos_cancelamentos_nome: raw.VendasMotivosCancelamentosNome || null,
    vendas_motivos_cancelamentos_id: raw.VendasMotivosCancelamentosId || null,
    vendas_data_cadastro: raw.VendasDataCadastro || null,
    vendas_data_ativacao: raw.VendasDataAtivacao || null,
    vendas_data_cancelamento: raw.VendasDataCancelamento || null,
    vendas_data_suspensao: raw.VendasDataSuspensao || null,
    vendas_data_reativacao: raw.VendasDataReativacao || null,
    vendas_data_fidelidade: raw.VendasDataFidelidade || null,
    vendas_data_pagamento: raw.VendasDataPagamento || null,
    vendas_data_ultimo_fatura_carne: raw.VendasDataUltimoFaturaCarne || null,
    vendas_data_impressao_carne: raw.VendasDataImpressaoCarne || null,
    vendas_consultores_id: raw.VendasConsultoresId || null,
    consultores_nome: raw.ConsultoresNome || raw.VendasConsultoresIndividuosNome || null,
    consultores_login: raw.ConsultoresLogin || null,
    consultores_email: raw.ConsultoresEmail || null,
    consultores_ddd: raw.ConsultoresDdd || null,
    consultores_telefone: raw.ConsultoresTelefone || null,
    consultores_centro_custo_id: raw.ConsultoresCentroCustoId || raw.VendasConsultoresCentroCustoId || null,
    consultores_centro_custo_nome: raw.ConsultoresCentroCustoNome || raw.VendasConsultoresCentroCustoNome || null,
    cotacoes_numero_cotacao: raw.CotacoesNumeroCotacao || null,
    vendas_produtos_id: raw.VendasProdutosId || null,
    vendas_produtos_nome: raw.VendasProdutosNome || null,
    vendas_contabiliza_para_meta: raw.VendasContabilizaParaMeta !== "0",
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw_data: raw,
  };
}

function parseDecimal(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const str = String(value).replace(/[R$\s.]/g, "").replace(",", ".");
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

// --- Main Handler ---
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    const body = await req.json();
    const target = body.target || "all"; // "consultores", "vendas", "all"
    const batchSize = Math.min(body.batch_size || 500, 1000);
    const offset = body.offset || 0;
    const maxBatches = body.max_batches || 10; // Max lotes por execução (safety)

    const results: Record<string, unknown> = {};

    if (target === "consultores" || target === "all") {
      results.consultores = await importConsultores(batchSize, offset, maxBatches, startTime);
    }

    if (target === "vendas" || target === "all") {
      // Se importou consultores, usa o offset=0 para vendas (ou body.vendas_offset)
      const vendasOffset = body.vendas_offset || (target === "all" ? 0 : offset);
      results.vendas = await importVendas(batchSize, vendasOffset, maxBatches, startTime);
    }

    return respond({ success: true, results, elapsed: Date.now() - startTime });
  } catch (e) {
    const err = (e as Error).message;
    await logSync("import", "batch", "error", 0, err);
    return respond({ success: false, error: err, elapsed: Date.now() - startTime }, 500);
  }
});

async function importConsultores(batchSize: number, startOffset: number, maxBatches: number, execStart: number) {
  let offset = startOffset;
  let totalInserted = 0;
  let totalRecords = 0;
  let batchCount = 0;

  await logSync("consultores", "batch", "running", 0);

  while (batchCount < maxBatches) {
    // Check timeout
    if (Date.now() - execStart > EXECUTION_TIMEOUT) {
      await logSync("consultores", "batch", "timeout", totalInserted, `Parou no offset ${offset}`);
      return { status: "timeout", inserted: totalInserted, total: totalRecords, next_offset: offset };
    }

    const params = buildDataTablesParams("IndividuosNome", {}, offset, batchSize);
    const result = await fetchFromAeasy("/consultores/listagem", "GET", params);

    if (!result.data.length) break;

    totalRecords = result.total;
    const mapped = result.data.map((r) => mapConsultor(r as Record<string, unknown>));

    const { inserted, error } = await upsertToSupabase("consultores", mapped, "consultores_id");
    if (error) {
      await logSync("consultores", "batch", "error", totalInserted, error);
      return { status: "error", inserted: totalInserted, total: totalRecords, error, next_offset: offset };
    }

    totalInserted += inserted;
    offset += batchSize;
    batchCount++;

    // Se já pegou todos, para
    if (offset >= totalRecords) break;
  }

  const status = offset >= totalRecords ? "complete" : "partial";
  await logSync("consultores", "batch", status === "complete" ? "success" : "partial", totalInserted);

  return { status, inserted: totalInserted, total: totalRecords, next_offset: offset >= totalRecords ? null : offset };
}

async function importVendas(batchSize: number, startOffset: number, maxBatches: number, execStart: number) {
  let offset = startOffset;
  let totalInserted = 0;
  let totalRecords = 0;
  let batchCount = 0;

  await logSync("vendas", "batch", "running", 0);

  while (batchCount < maxBatches) {
    // Check timeout
    if (Date.now() - execStart > EXECUTION_TIMEOUT) {
      await logSync("vendas", "batch", "timeout", totalInserted, `Parou no offset ${offset}`);
      return { status: "timeout", inserted: totalInserted, total: totalRecords, next_offset: offset };
    }

    const params = buildDataTablesParams("ClientesIndividuosNome", {}, offset, batchSize);
    const result = await fetchFromAeasy("/vendas/listagem", "POST", params);

    if (!result.data.length) break;

    totalRecords = result.total;
    const mapped = result.data.map((r) => mapVenda(r as Record<string, unknown>));

    // Upsert em sub-lotes de 200 (evita payload muito grande no REST API)
    for (let i = 0; i < mapped.length; i += 200) {
      const chunk = mapped.slice(i, i + 200);
      const { inserted, error } = await upsertToSupabase("vendas", chunk, "vendas_id");
      if (error) {
        await logSync("vendas", "batch", "error", totalInserted, error);
        return { status: "error", inserted: totalInserted, total: totalRecords, error, next_offset: offset };
      }
      totalInserted += inserted;
    }

    offset += batchSize;
    batchCount++;

    if (offset >= totalRecords) break;
  }

  const status = offset >= totalRecords ? "complete" : "partial";
  await logSync("vendas", "batch", status === "complete" ? "success" : "partial", totalInserted);

  return { status, inserted: totalInserted, total: totalRecords, next_offset: offset >= totalRecords ? null : offset };
}

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
