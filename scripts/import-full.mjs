#!/usr/bin/env node
/**
 * Aurora AVP - Full Batch Import Script
 * 
 * Importa TODOS os dados do aEasy para o Supabase PostgreSQL.
 * Roda localmente sem limite de timeout.
 * 
 * Uso:
 *   node scripts/import-full.mjs                    # Importa tudo
 *   node scripts/import-full.mjs --target vendas    # Só vendas
 *   node scripts/import-full.mjs --target consultores
 *   node scripts/import-full.mjs --offset 5000      # Continuar de onde parou
 *   node scripts/import-full.mjs --batch-size 300   # Lotes menores (mais seguro)
 * 
 * Requisitos: Node.js 18+
 */

import { argv } from 'process';

// --- Configuration ---
const CONFIG = {
  aeasyBase: 'https://aeasy.autovaleprevencoes.org',
  supabaseUrl: 'https://zjacembodtjrkynfmtxf.supabase.co',
  supabaseServiceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4',
  credentials: { login: '03268401503', senha: 'Ale@2026' },
  batchSize: 500,
  upsertChunkSize: 200,
  delayBetweenBatches: 1000, // 1s entre lotes (evita rate limit)
  delayBetweenUpserts: 300,  // 300ms entre upserts
  maxRetries: 3,
};


// --- CLI Args ---
function parseArgs() {
  const args = { target: 'all', offset: 0, batchSize: CONFIG.batchSize };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = argv[++i];
    if (argv[i] === '--offset') args.offset = parseInt(argv[++i]);
    if (argv[i] === '--batch-size') args.batchSize = parseInt(argv[++i]);
  }
  return args;
}

// --- Logger ---
function log(level, msg, data = '') {
  const ts = new Date().toISOString().split('T')[1].split('.')[0];
  const prefix = { info: '\x1b[36mINFO\x1b[0m', ok: '\x1b[32m OK \x1b[0m', err: '\x1b[31mERRO\x1b[0m', warn: '\x1b[33mAVIS\x1b[0m' };
  console.log(`[${ts}] [${prefix[level] || level}] ${msg}`, data || '');
}

function progressBar(current, total, label = '') {
  const pct = Math.round((current / total) * 100);
  const filled = Math.round(pct / 2.5);
  const bar = '█'.repeat(filled) + '░'.repeat(40 - filled);
  process.stdout.write(`\r  ${bar} ${pct}% (${current}/${total}) ${label}   `);
  if (current >= total) process.stdout.write('\n');
}

// --- Sleep helper ---
const sleep = (ms) => new Promise(r => setTimeout(r, ms));


// --- aEasy Session ---
let sessionCookies = '';
let lastLoginTime = 0;

function extractCookies(response) {
  const setCookie = response.headers.get('set-cookie');
  if (!setCookie) return;
  const map = {};
  if (sessionCookies) {
    sessionCookies.split('; ').forEach(c => {
      const [k, ...v] = c.split('=');
      if (k) map[k.trim()] = v.join('=');
    });
  }
  setCookie.split(/,(?=\s*\w+=)/).forEach(part => {
    const m = part.split(';')[0].trim();
    const [k, ...v] = m.split('=');
    if (k) map[k.trim()] = v.join('=');
  });
  sessionCookies = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

async function aeasyLogin() {
  log('info', 'Fazendo login no aEasy...');
  
  // Step 1: Get session
  const s = await fetch(`${CONFIG.aeasyBase}/conta/login`, { method: 'GET', redirect: 'manual' });
  extractCookies(s);

  // Step 2: Login
  const r = await fetch(`${CONFIG.aeasyBase}/conta/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Requested-With': 'XMLHttpRequest',
      'Cookie': sessionCookies,
    },
    body: `UsuariosLogin=${encodeURIComponent(CONFIG.credentials.login)}&UsuariosSenha=${encodeURIComponent(CONFIG.credentials.senha)}`,
    redirect: 'manual',
  });
  extractCookies(r);

  const text = await r.text();
  try {
    const data = JSON.parse(text);
    if (data.mensagem?.includes('sucesso')) {
      lastLoginTime = Date.now();
      log('ok', 'Login realizado com sucesso');
      return true;
    }
    log('err', 'Login falhou', data.mensagem);
  } catch {
    log('err', 'Login falhou - resposta inválida');
  }
  return false;
}

async function ensureAuth() {
  if (!sessionCookies || Date.now() - lastLoginTime > 50 * 60 * 1000) {
    const ok = await aeasyLogin();
    if (!ok) throw new Error('LOGIN_FAILED');
  }
}


// --- aEasy Data Fetching ---
function buildDataTablesParams(columnName, filters, start, length) {
  const params = new URLSearchParams();
  params.append('draw', '1');
  params.append('start', String(start));
  params.append('length', String(length));
  params.append('columns[0][data]', columnName);
  params.append('columns[0][name]', columnName);
  params.append('columns[0][orderable]', 'true');
  params.append('columns[0][searchable]', 'false');
  params.append('order[0][column]', '0');
  params.append('order[0][dir]', 'asc');
  params.append('formPesquisa[submitFilter]', 'true');

  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      value.forEach(v => params.append(`formPesquisa[${key}][]`, v));
    } else {
      params.append(`formPesquisa[${key}]`, value);
    }
  }
  return params.toString();
}

async function fetchBatch(endpoint, method, columnName, filters, start, length) {
  await ensureAuth();

  const params = buildDataTablesParams(columnName, filters, start, length);
  const headers = {
    'X-Requested-With': 'XMLHttpRequest',
    'Cookie': sessionCookies,
  };
  if (method === 'POST') headers['Content-Type'] = 'application/x-www-form-urlencoded';

  const url = method === 'GET' ? `${CONFIG.aeasyBase}${endpoint}?${params}` : `${CONFIG.aeasyBase}${endpoint}`;
  const opts = { method, headers, redirect: 'manual' };
  if (method === 'POST') opts.body = params;

  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const resp = await fetch(url, opts);
      extractCookies(resp);

      if (resp.status === 302 || resp.status === 301) {
        log('warn', `Sessão expirada (redirect ${resp.status}), re-logando...`);
        sessionCookies = '';
        lastLoginTime = 0;
        await aeasyLogin();
        opts.headers = { ...headers, 'Cookie': sessionCookies };
        continue;
      }

      const text = await resp.text();
      const jsonStart = text.indexOf('{');
      if (jsonStart < 0) throw new Error('Resposta sem JSON');

      const json = JSON.parse(text.substring(jsonStart));
      return { data: json.data || [], total: parseInt(json.recordsFiltered || json.recordsTotal || '0') };
    } catch (e) {
      if (attempt < CONFIG.maxRetries) {
        log('warn', `Tentativa ${attempt}/${CONFIG.maxRetries} falhou: ${e.message}. Retry em 3s...`);
        await sleep(3000);
      } else {
        throw e;
      }
    }
  }
}


// --- Supabase Upsert ---
async function upsertBatch(table, records, conflictColumn) {
  for (let attempt = 1; attempt <= CONFIG.maxRetries; attempt++) {
    try {
      const resp = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${CONFIG.supabaseServiceKey}`,
          'apikey': CONFIG.supabaseServiceKey,
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify(records),
      });

      if (!resp.ok) {
        const err = await resp.text();
        if (attempt < CONFIG.maxRetries) {
          log('warn', `Upsert falhou (${resp.status}), retry ${attempt}/${CONFIG.maxRetries}...`);
          await sleep(2000);
          continue;
        }
        throw new Error(`Upsert ${table} failed: ${resp.status} - ${err.substring(0, 300)}`);
      }
      return records.length;
    } catch (e) {
      if (attempt >= CONFIG.maxRetries) throw e;
      log('warn', `Upsert error: ${e.message}. Retry em 2s...`);
      await sleep(2000);
    }
  }
}

async function logSync(tabela, tipo, status, registros, erro = null) {
  try {
    await fetch(`${CONFIG.supabaseUrl}/rest/v1/sync_log`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${CONFIG.supabaseServiceKey}`,
        'apikey': CONFIG.supabaseServiceKey,
      },
      body: JSON.stringify({
        tabela, tipo, status,
        registros_processados: registros,
        registros_inseridos: registros,
        erro,
        concluido_em: status !== 'running' ? new Date().toISOString() : null,
      }),
    });
  } catch { /* non-critical */ }
}


// --- Field Mapping ---
function parseDecimal(value) {
  if (value === null || value === undefined || value === '') return null;
  const str = String(value).replace(/[R$\s.]/g, '').replace(',', '.');
  const num = parseFloat(str);
  return isNaN(num) ? null : num;
}

function mapConsultor(raw) {
  return {
    consultores_id: raw.ConsultoresId,
    individuos_nome: raw.IndividuosNome || '',
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
    consultores_gerar_comissao: raw.ConsultoresGerarComissao === '1' || raw.ConsultoresGerarComissao === true,
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


function mapVenda(raw) {
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
    vendas_isenta_cobranca: raw.VendasIsentaCobranca === '1' || raw.VendasIsentaCobranca === true,
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
    vendas_contabiliza_para_meta: raw.VendasContabilizaParaMeta !== '0',
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    raw_data: raw,
  };
}


// --- Import Orchestrators ---
async function importConsultores(startOffset, batchSize) {
  log('info', '═══════════════════════════════════════════════');
  log('info', '  IMPORTANDO CONSULTORES (~5.918 registros)');
  log('info', '═══════════════════════════════════════════════');

  await logSync('consultores', 'full', 'running', 0);
  const startTime = Date.now();
  let offset = startOffset;
  let totalInserted = 0;
  let totalRecords = 0;
  let batchNum = 0;

  while (true) {
    batchNum++;
    log('info', `Lote #${batchNum}: buscando ${batchSize} registros (offset=${offset})...`);

    const result = await fetchBatch('/consultores/listagem', 'GET', 'IndividuosNome', {}, offset, batchSize);

    if (!result.data.length) {
      log('info', 'Sem mais registros.');
      break;
    }

    totalRecords = result.total;
    const mapped = result.data.map(mapConsultor);

    // Upsert em chunks
    for (let i = 0; i < mapped.length; i += CONFIG.upsertChunkSize) {
      const chunk = mapped.slice(i, i + CONFIG.upsertChunkSize);
      const inserted = await upsertBatch('consultores', chunk, 'consultores_id');
      totalInserted += inserted;
      if (i + CONFIG.upsertChunkSize < mapped.length) await sleep(CONFIG.delayBetweenUpserts);
    }

    progressBar(Math.min(offset + batchSize, totalRecords), totalRecords, 'consultores');
    offset += batchSize;

    if (offset >= totalRecords) break;
    await sleep(CONFIG.delayBetweenBatches);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  await logSync('consultores', 'full', 'success', totalInserted);
  log('ok', `Consultores: ${totalInserted}/${totalRecords} importados em ${elapsed}s`);
  return { inserted: totalInserted, total: totalRecords, elapsed };
}

async function importVendas(startOffset, batchSize) {
  log('info', '═══════════════════════════════════════════════');
  log('info', '  IMPORTANDO VENDAS (~31.705 registros)');
  log('info', '═══════════════════════════════════════════════');

  await logSync('vendas', 'full', 'running', 0);
  const startTime = Date.now();
  let offset = startOffset;
  let totalInserted = 0;
  let totalRecords = 0;
  let batchNum = 0;
  let errors = 0;

  while (true) {
    batchNum++;
    log('info', `Lote #${batchNum}: buscando ${batchSize} registros (offset=${offset})...`);

    try {
      const result = await fetchBatch('/vendas/listagem', 'POST', 'ClientesIndividuosNome', {}, offset, batchSize);

      if (!result.data.length) {
        log('info', 'Sem mais registros.');
        break;
      }

      totalRecords = result.total;
      const mapped = result.data.map(mapVenda);

      // Upsert em chunks de 200 (evita payload >1MB)
      for (let i = 0; i < mapped.length; i += CONFIG.upsertChunkSize) {
        const chunk = mapped.slice(i, i + CONFIG.upsertChunkSize);
        const inserted = await upsertBatch('vendas', chunk, 'vendas_id');
        totalInserted += inserted;
        if (i + CONFIG.upsertChunkSize < mapped.length) await sleep(CONFIG.delayBetweenUpserts);
      }

      progressBar(Math.min(offset + batchSize, totalRecords), totalRecords, 'vendas');

    } catch (e) {
      errors++;
      log('err', `Erro no lote #${batchNum} (offset=${offset}): ${e.message}`);
      if (errors >= 5) {
        log('err', `Muitos erros consecutivos. Parando no offset ${offset}.`);
        log('err', `Para continuar: node scripts/import-full.mjs --target vendas --offset ${offset}`);
        break;
      }
      await sleep(5000); // Wait 5s after error
    }

    offset += batchSize;
    if (offset >= totalRecords) break;
    await sleep(CONFIG.delayBetweenBatches);
  }

  const elapsed = Math.round((Date.now() - startTime) / 1000);
  const status = offset >= totalRecords ? 'success' : 'partial';
  await logSync('vendas', 'full', status, totalInserted, errors > 0 ? `${errors} erros` : null);
  log('ok', `Vendas: ${totalInserted}/${totalRecords} importados em ${elapsed}s (${errors} erros)`);
  return { inserted: totalInserted, total: totalRecords, elapsed, errors };
}


// --- Main ---
async function main() {
  const args = parseArgs();
  
  console.log('\n');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║       AURORA AVP - IMPORTAÇÃO COMPLETA            ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  console.log(`  ║  Target:     ${args.target.padEnd(37)}║`);
  console.log(`  ║  Batch Size: ${String(args.batchSize).padEnd(37)}║`);
  console.log(`  ║  Offset:     ${String(args.offset).padEnd(37)}║`);
  console.log(`  ║  Upsert:     ${String(CONFIG.upsertChunkSize).padEnd(37)}║`);
  console.log(`  ║  Delay:      ${(CONFIG.delayBetweenBatches + 'ms entre lotes').padEnd(37)}║`);
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('\n');

  const results = {};
  const globalStart = Date.now();

  try {
    // Login
    const loginOk = await aeasyLogin();
    if (!loginOk) {
      log('err', 'Não foi possível fazer login no aEasy. Abortando.');
      process.exit(1);
    }

    // Import consultores
    if (args.target === 'all' || args.target === 'consultores') {
      results.consultores = await importConsultores(
        args.target === 'consultores' ? args.offset : 0,
        args.batchSize
      );
    }

    // Import vendas
    if (args.target === 'all' || args.target === 'vendas') {
      results.vendas = await importVendas(
        args.target === 'vendas' ? args.offset : 0,
        args.batchSize
      );
    }

  } catch (e) {
    log('err', `Erro fatal: ${e.message}`);
    console.error(e);
  }

  // Summary
  const totalElapsed = Math.round((Date.now() - globalStart) / 1000);
  console.log('\n');
  console.log('  ╔═══════════════════════════════════════════════════╗');
  console.log('  ║              RESUMO DA IMPORTAÇÃO                 ║');
  console.log('  ╠═══════════════════════════════════════════════════╣');
  if (results.consultores) {
    console.log(`  ║  Consultores: ${results.consultores.inserted}/${results.consultores.total} (${results.consultores.elapsed}s)`.padEnd(54) + '║');
  }
  if (results.vendas) {
    console.log(`  ║  Vendas:      ${results.vendas.inserted}/${results.vendas.total} (${results.vendas.elapsed}s)`.padEnd(54) + '║');
    if (results.vendas.errors) {
      console.log(`  ║  Erros:       ${results.vendas.errors}`.padEnd(54) + '║');
    }
  }
  console.log(`  ║  Tempo total: ${totalElapsed}s`.padEnd(54) + '║');
  console.log('  ╚═══════════════════════════════════════════════════╝');
  console.log('\n');
}

main().catch(e => { console.error(e); process.exit(1); });
