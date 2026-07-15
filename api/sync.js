/**
 * Sync Job - Sincroniza dados do aEasy → Supabase PostgreSQL
 * 
 * Execução: Vercel Cron (a cada 15 minutos)
 * Configurado em vercel.json: crons[{ path: "/api/sync", schedule: "*/15 * * * *" }]
 * 
 * Estratégia:
 *   - Incremental: busca apenas registros alterados desde último sync
 *   - Full: 1x por dia (00:00) reconstrói tudo
 *   - Consultores: sync a cada 1h (muda pouco)
 *   - Vendas: sync a cada 15min (muda frequentemente)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const AEASY_BASE = 'https://aeasy.autovaleprevencoes.org';
const SUPABASE_URL = 'https://zjacembodtjrkynfmtxf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4';
const AEASY_LOGIN = process.env.AEASY_LOGIN || '03268401503';
const AEASY_SENHA = process.env.AEASY_SENHA || 'Ale@2026';

// Cookie store para sessão aEasy
let sessionCookies = '';

export default async function handler(req, res) {
    const startTime = Date.now();
    const tipo = req.query?.tipo || 'incremental'; // incremental | full | consultores

    try {
        // Inicializar Supabase (service role para bypass RLS)
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

        // Login no aEasy
        await loginAeasy();

        let resultado;

        switch (tipo) {
            case 'full':
                resultado = await syncFull(supabase);
                break;
            case 'consultores':
                resultado = await syncConsultores(supabase);
                break;
            case 'incremental':
            default:
                resultado = await syncIncremental(supabase);
                break;
        }

        // Registrar no sync_log
        const elapsed = Date.now() - startTime;
        await supabase.from('sync_log').insert({
            tabela: tipo === 'consultores' ? 'consultores' : 'vendas',
            tipo,
            registros_processados: resultado.processados,
            registros_inseridos: resultado.inseridos,
            registros_atualizados: resultado.atualizados,
            filtros_aplicados: resultado.filtros,
            duracao_ms: elapsed,
            status: 'success',
        });

        return res.status(200).json({
            success: true,
            tipo,
            elapsed,
            ...resultado,
        });

    } catch (error) {
        const elapsed = Date.now() - startTime;

        // Log do erro no banco (se possível)
        try {
            const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
            await supabase.from('sync_log').insert({
                tabela: tipo,
                tipo,
                duracao_ms: elapsed,
                status: 'error',
                erro: error.message,
            });
        } catch { /* ignore */ }

        return res.status(500).json({ error: error.message, elapsed });
    }
}

// ============================================
// SYNC INCREMENTAL (a cada 15 minutos)
// Busca vendas cadastradas/alteradas nas últimas 24h
// ============================================
async function syncIncremental(supabase) {
    // Buscar última sincronização bem sucedida
    const { data: lastSync } = await supabase
        .from('sync_log')
        .select('concluido_em')
        .eq('tabela', 'vendas')
        .eq('status', 'success')
        .order('concluido_em', { ascending: false })
        .limit(1);

    // Data de referência: último sync ou 24h atrás
    const desde = lastSync?.[0]?.concluido_em 
        ? new Date(lastSync[0].concluido_em).toISOString().split('T')[0]
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const hoje = new Date().toISOString().split('T')[0];

    console.log(`[SYNC] Incremental: buscando vendas desde ${desde} até ${hoje}`);

    // Buscar do aEasy (todos os registros do período)
    const vendas = await fetchVendasAeasy({
        TipoData: 'VendasDataCadastro',
        DataInicial: desde,
        DataFinal: hoje,
    });

    // Upsert no Supabase
    const { inseridos, atualizados } = await upsertVendas(supabase, vendas);

    return {
        processados: vendas.length,
        inseridos,
        atualizados,
        filtros: { desde, ate: hoje },
    };
}

// ============================================
// SYNC FULL (1x por dia)
// Reconstrói tabela completa de vendas ativas
// ============================================
async function syncFull(supabase) {
    console.log('[SYNC] Full: buscando todas as vendas ativas');

    // Buscar ativos + suspensos + novos (situações relevantes)
    const situacoes = ['1', '2', '4', '5', '6'];
    let totalVendas = [];

    for (const sit of situacoes) {
        const vendas = await fetchVendasAeasy({ VendasSituacao: [sit] });
        totalVendas = totalVendas.concat(vendas);
        console.log(`[SYNC] Situação ${sit}: ${vendas.length} registros`);
    }

    // Também buscar cancelados do último mês
    const umMesAtras = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const cancelados = await fetchVendasAeasy({
        VendasSituacao: ['3'],
        TipoData: 'VendasDataCancelamento',
        DataInicial: umMesAtras,
        DataFinal: new Date().toISOString().split('T')[0],
    });
    totalVendas = totalVendas.concat(cancelados);

    // Upsert no Supabase
    const { inseridos, atualizados } = await upsertVendas(supabase, totalVendas);

    // Sync consultores junto
    await syncConsultores(supabase);

    return {
        processados: totalVendas.length,
        inseridos,
        atualizados,
        filtros: { tipo: 'full', situacoes, cancelados: cancelados.length },
    };
}

// ============================================
// SYNC CONSULTORES (a cada 1h)
// ============================================
async function syncConsultores(supabase) {
    console.log('[SYNC] Consultores: buscando todos os ativos');

    const consultores = await fetchConsultoresAeasy();

    // Upsert
    let inseridos = 0, atualizados = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < consultores.length; i += BATCH_SIZE) {
        const batch = consultores.slice(i, i + BATCH_SIZE).map(c => ({
            consultores_id: c.ConsultoresId,
            individuos_nome: c.IndividuosNome,
            individuos_documento: c.IndividuosDocumento,
            individuos_email: c.IndividuosEmail,
            individuos_data_nascimento: c.IndividuosDataNascimento || null,
            individuos_sexo: c.IndividuosSexo,
            individuos_contatos_ddd: c.IndividuosContatosDdd,
            individuos_contatos_telefone: c.IndividuosContatosTelefone,
            individuos_enderecos_cidades_nome: c.IndividuosEnderecosCidadesNome,
            individuos_enderecos_estados_nome: c.IndividuosEnderecosEstadosNome,
            individuos_enderecos_estados_uf: c.IndividuosEnderecosEstadosUf,
            consultores_tipo_consultor: c.ConsultoresTipoConsultor,
            consultores_tipo_consultor_enum: parseInt(c.ConsultoresTipoConsultorEnum) || null,
            consultores_situacao_cadastro: c.ConsultoresSituacaoCadastro,
            consultores_situacao_cadastro_enum: parseInt(c.ConsultoresSituacaoCadastroEnum) || null,
            consultores_gerar_comissao: c.ConsultoresGerarComissao === '1',
            consultores_patrocinador_individuos_nome: c.ConsultoresPatrocinadorIndividuosNome,
            consultores_indicador_individuos_nome: c.ConsultoresIndicadorIndividuosNome,
            consultores_niveis_nome: c.ConsultoresNiveisNome,
            grupos_empresas_nome: c.GruposEmpresasNome,
            grupos_consultores_nome: c.GruposConsultoresNome,
            synced_at: new Date().toISOString(),
            raw_data: c,
        }));

        const { error } = await supabase
            .from('consultores')
            .upsert(batch, { onConflict: 'consultores_id' });

        if (error) console.error('[SYNC] Erro consultores batch:', error.message);
        else inseridos += batch.length;
    }

    return { processados: consultores.length, inseridos, atualizados: 0, filtros: { situacao: 'ativos' } };
}

// ============================================
// FETCH DO AEASY (com paginação)
// ============================================
async function fetchVendasAeasy(filters = {}) {
    let allData = [];
    let start = 0;
    const length = 500;
    let total = 0;

    do {
        const params = new URLSearchParams();
        params.append('draw', '1');
        params.append('start', String(start));
        params.append('length', String(length));
        params.append('columns[0][data]', 'ClientesIndividuosNome');
        params.append('columns[0][name]', 'ClientesIndividuosNome');
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');
        params.append('formPesquisa[submitFilter]', 'true');

        // Filtros
        Object.entries(filters).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(v => params.append(`formPesquisa[${key}][]`, v));
            } else if (value) {
                params.append(`formPesquisa[${key}]`, value);
            }
        });

        const resp = await fetch(`${AEASY_BASE}/vendas/listagem`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': sessionCookies,
            },
            body: params.toString(),
            redirect: 'manual',
        });

        if (resp.status === 302) {
            // Sessão expirada - re-login
            await loginAeasy();
            continue;
        }

        const text = await resp.text();
        const jsonStart = text.indexOf('{');
        if (jsonStart < 0) break;

        const data = JSON.parse(text.substring(jsonStart));
        total = parseInt(data.recordsFiltered || data.recordsTotal || 0);
        allData = allData.concat(data.data || []);
        start += length;

        console.log(`[SYNC] Vendas: ${allData.length}/${total}`);

    } while (start < total && start < 50000);

    return allData;
}

async function fetchConsultoresAeasy() {
    let allData = [];
    let start = 0;
    const length = 500;
    let total = 0;

    do {
        const params = new URLSearchParams();
        params.append('draw', '1');
        params.append('start', String(start));
        params.append('length', String(length));
        params.append('columns[0][data]', 'IndividuosNome');
        params.append('columns[0][name]', 'IndividuosNome');
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');
        params.append('formPesquisa[submitFilter]', 'true');
        params.append('formPesquisa[Situacao][]', '2'); // Ativos

        const resp = await fetch(`${AEASY_BASE}/consultores/listagem?${params.toString()}`, {
            method: 'GET',
            headers: {
                'X-Requested-With': 'XMLHttpRequest',
                'Cookie': sessionCookies,
            },
            redirect: 'manual',
        });

        const text = await resp.text();
        const jsonStart = text.indexOf('{');
        if (jsonStart < 0) break;

        const data = JSON.parse(text.substring(jsonStart));
        total = parseInt(data.recordsFiltered || data.recordsTotal || 0);
        allData = allData.concat(data.data || []);
        start += length;

    } while (start < total);

    return allData;
}

// ============================================
// UPSERT VENDAS NO SUPABASE
// ============================================
async function upsertVendas(supabase, vendas) {
    let inseridos = 0, atualizados = 0;
    const BATCH_SIZE = 100;

    for (let i = 0; i < vendas.length; i += BATCH_SIZE) {
        const batch = vendas.slice(i, i + BATCH_SIZE).map(v => ({
            vendas_id: v.VendasId,
            vendas_clientes_id: v.VendasClientesId,
            clientes_individuos_nome: v.ClientesIndividuosNome,
            clientes_individuos_documento: v.ClientesIndividuosDocumento,
            clientes_individuos_email: v.ClientesIndividuosEmail,
            clientes_individuos_contatos_ddd: v.ClientesIndividuosContatosDdd,
            clientes_individuos_contatos_telefone: v.ClientesIndividuosContatosTelefone,
            clientes_individuos_id: v.ClientesIndividuosId,
            vendas_carros_placa: v.VendasCarrosPlaca,
            vendas_carros_marcas_nome: v.VendasCarrosMarcasNome,
            vendas_carros_modelos_nome: v.VendasCarrosModelosNome,
            vendas_carros_categorias_planos_nome: v.VendasCarrosCategoriasPlanosNome,
            vendas_carros_categorias_planos_id: v.VendasCarrosCategoriasPlanosId,
            vendas_carros_categorias_carros_nome: v.VendasCarrosCategoriasCarrosNome,
            vendas_carros_valor_mensal: parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.')) || 0,
            vendas_carros_valor_total: parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.')) || 0,
            vendas_valor: parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.')) || 0,
            vendas_vencimento: parseInt(v.VendasVencimento) || null,
            vendas_forma_pagamento_enum: parseInt(v.VendasFormaPagamentoEnum) || null,
            vendas_situacao: v.VendasSituacao,
            vendas_situacao_enum: parseInt(v.VendasSituacaoEnum) || null,
            vendas_classificacao: v.VendasClassificacao,
            vendas_motivos_cancelamentos_nome: v.VendasMotivosCancelamentosNome,
            vendas_data_cadastro: parseDataAeasy(v.VendasDataCadastro),
            vendas_data_ativacao: parseDataAeasy(v.VendasDataAtivacao),
            vendas_data_cancelamento: parseDataAeasy(v.VendasDataCancelamento),
            vendas_data_suspensao: parseDataAeasy(v.VendasDataSuspensao),
            vendas_data_pagamento: parseDataAeasy(v.VendasDataPagamento),
            vendas_consultores_id: v.VendasConsultoresId,
            consultores_nome: v.ConsultoresNome,
            consultores_centro_custo_id: v.ConsultoresCentroCustoId,
            consultores_centro_custo_nome: v.ConsultoresCentroCustoNome,
            vendas_quantidade_faturas_pagas: parseInt(v.VendasQuantidadeFaturasPagas) || 0,
            vendas_dias_atraso: parseInt(v.VendasDiasAtraso) || 0,
            vendas_produtos_id: v.VendasProdutosId,
            vendas_produtos_nome: v.VendasProdutosNome,
            cotacoes_numero_cotacao: v.CotacoesNumeroCotacao,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            raw_data: v,
        }));

        const { error } = await supabase
            .from('vendas')
            .upsert(batch, { onConflict: 'vendas_id' });

        if (error) {
            console.error(`[SYNC] Erro vendas batch ${i}:`, error.message);
        } else {
            inseridos += batch.length;
        }
    }

    return { inseridos, atualizados };
}

// ============================================
// LOGIN AEASY
// ============================================
async function loginAeasy() {
    // GET para sessão
    const sessResp = await fetch(`${AEASY_BASE}/conta/login`, { redirect: 'manual' });
    extractCookies(sessResp);

    // POST login
    const loginResp = await fetch(`${AEASY_BASE}/conta/login`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Cookie': sessionCookies,
        },
        body: `UsuariosLogin=${encodeURIComponent(AEASY_LOGIN)}&UsuariosSenha=${encodeURIComponent(AEASY_SENHA)}`,
        redirect: 'manual',
    });
    extractCookies(loginResp);

    const text = await loginResp.text();
    if (!text.includes('sucesso')) {
        throw new Error('Login aEasy falhou: ' + text.substring(0, 200));
    }

    console.log('[SYNC] Login aEasy OK');
}

// ============================================
// UTILITÁRIOS
// ============================================
function extractCookies(response) {
    const raw = response.headers.get('set-cookie');
    if (!raw) return;
    const map = {};
    if (sessionCookies) {
        sessionCookies.split('; ').forEach(c => {
            const [k, ...v] = c.split('=');
            if (k) map[k.trim()] = v.join('=');
        });
    }
    raw.split(/,(?=\s*\w+=)/).forEach(part => {
        const main = part.split(';')[0].trim();
        const [k, ...v] = main.split('=');
        if (k) map[k.trim()] = v.join('=');
    });
    sessionCookies = Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

function parseDataAeasy(dataStr) {
    if (!dataStr || dataStr === '-' || dataStr === 'null') return null;
    // Formato "DD/MM/YYYY HH:MM:SS" ou "DD/MM/YYYY"
    const parts = dataStr.split(' ')[0].split('/');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`; // YYYY-MM-DD
    }
    // Já está em YYYY-MM-DD
    if (dataStr.match(/^\d{4}-\d{2}-\d{2}/)) return dataStr.split(' ')[0];
    return null;
}

// Vercel Cron config
export const config = {
    maxDuration: 300, // 5 minutos max
};
