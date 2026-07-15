/**
 * Sync Job - Sincroniza aEasy → Supabase PostgreSQL
 * Usa REST API do Supabase diretamente (sem SDK/import externo)
 * 
 * Vercel Cron: GET /api/sync?tipo=incremental
 */

const AEASY_BASE = 'https://aeasy.autovaleprevencoes.org';
const SUPABASE_URL = 'https://zjacembodtjrkynfmtxf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4';
const AEASY_LOGIN = '03268401503';
const AEASY_SENHA = 'Ale@2026';

let sessionCookies = '';

export default async function handler(req, res) {
    const start = Date.now();
    const tipo = req.query?.tipo || 'incremental';

    res.setHeader('Access-Control-Allow-Origin', '*');

    try {
        await loginAeasy();

        let resultado;
        if (tipo === 'consultores') {
            resultado = await syncConsultores();
        } else {
            resultado = await syncVendas(tipo === 'full');
        }

        // Log no Supabase
        await supabaseInsert('sync_log', [{
            tabela: tipo === 'consultores' ? 'consultores' : 'vendas',
            tipo,
            registros_processados: resultado.processados,
            registros_inseridos: resultado.inseridos,
            duracao_ms: Date.now() - start,
            status: 'success',
            concluido_em: new Date().toISOString(),
        }]);

        return res.status(200).json({ success: true, tipo, elapsed: Date.now() - start, ...resultado });
    } catch (error) {
        return res.status(500).json({ error: error.message, elapsed: Date.now() - start });
    }
}

// ============ SYNC VENDAS ============
async function syncVendas(full = false) {
    const hoje = new Date().toISOString().split('T')[0];
    const desde = full
        ? '2023-01-01'
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const vendas = await fetchVendasAeasy({ TipoData: 'VendasDataCadastro', DataInicial: desde, DataFinal: hoje });

    // Transformar para formato do banco
    const rows = vendas.map(v => ({
        vendas_id: v.VendasId,
        vendas_clientes_id: v.VendasClientesId,
        clientes_individuos_nome: v.ClientesIndividuosNome,
        clientes_individuos_documento: v.ClientesIndividuosDocumento,
        clientes_individuos_contatos_ddd: v.ClientesIndividuosContatosDdd,
        clientes_individuos_contatos_telefone: v.ClientesIndividuosContatosTelefone,
        vendas_carros_placa: v.VendasCarrosPlaca,
        vendas_carros_marcas_nome: v.VendasCarrosMarcasNome,
        vendas_carros_modelos_nome: v.VendasCarrosModelosNome,
        vendas_carros_categorias_planos_nome: v.VendasCarrosCategoriasPlanosNome,
        vendas_carros_categorias_planos_id: v.VendasCarrosCategoriasPlanosId,
        vendas_carros_valor_mensal: parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.')) || 0,
        vendas_carros_valor_total: parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.')) || 0,
        vendas_situacao: v.VendasSituacao,
        vendas_situacao_enum: parseInt(v.VendasSituacaoEnum) || null,
        vendas_classificacao: v.VendasClassificacao,
        vendas_data_cadastro: parseData(v.VendasDataCadastro),
        vendas_data_ativacao: parseData(v.VendasDataAtivacao),
        vendas_data_cancelamento: parseData(v.VendasDataCancelamento),
        vendas_consultores_id: v.VendasConsultoresId,
        consultores_nome: v.ConsultoresNome,
        consultores_centro_custo_id: v.ConsultoresCentroCustoId,
        consultores_centro_custo_nome: v.ConsultoresCentroCustoNome,
        vendas_dias_atraso: parseInt(v.VendasDiasAtraso) || 0,
        vendas_quantidade_faturas_pagas: parseInt(v.VendasQuantidadeFaturasPagas) || 0,
        synced_at: new Date().toISOString(),
    }));

    // Upsert em batches
    const BATCH = 200;
    let inseridos = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const ok = await supabaseUpsert('vendas', batch, 'vendas_id');
        if (ok) inseridos += batch.length;
    }

    return { processados: vendas.length, inseridos, desde, ate: hoje };
}

// ============ SYNC CONSULTORES ============
async function syncConsultores() {
    const consultores = await fetchConsultoresAeasy();

    const rows = consultores.map(c => ({
        consultores_id: c.ConsultoresId,
        individuos_nome: c.IndividuosNome,
        individuos_documento: c.IndividuosDocumento,
        individuos_email: c.IndividuosEmail,
        individuos_contatos_ddd: c.IndividuosContatosDdd,
        individuos_contatos_telefone: c.IndividuosContatosTelefone,
        consultores_tipo_consultor: c.ConsultoresTipoConsultor,
        consultores_tipo_consultor_enum: parseInt(c.ConsultoresTipoConsultorEnum) || null,
        consultores_situacao_cadastro: c.ConsultoresSituacaoCadastro,
        consultores_situacao_cadastro_enum: parseInt(c.ConsultoresSituacaoCadastroEnum) || null,
        consultores_patrocinador_individuos_nome: c.ConsultoresPatrocinadorIndividuosNome,
        consultores_niveis_nome: c.ConsultoresNiveisNome,
        grupos_empresas_nome: c.GruposEmpresasNome,
        synced_at: new Date().toISOString(),
    }));

    const BATCH = 200;
    let inseridos = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH);
        const ok = await supabaseUpsert('consultores', batch, 'consultores_id');
        if (ok) inseridos += batch.length;
    }

    return { processados: consultores.length, inseridos };
}

// ============ SUPABASE REST (sem SDK) ============
async function supabaseUpsert(table, rows, conflictColumn) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': `resolution=merge-duplicates,return=minimal`,
        },
        body: JSON.stringify(rows),
    });
    if (!resp.ok) {
        const err = await resp.text();
        console.error(`[SYNC] Upsert ${table} falhou:`, err.substring(0, 200));
        return false;
    }
    return true;
}

async function supabaseInsert(table, rows) {
    await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal',
        },
        body: JSON.stringify(rows),
    });
}

// ============ AEASY FETCH ============
async function fetchVendasAeasy(filters) {
    let all = [], start = 0, total = 0;
    do {
        const params = new URLSearchParams();
        params.append('draw', '1');
        params.append('start', String(start));
        params.append('length', '500');
        params.append('columns[0][data]', 'ClientesIndividuosNome');
        params.append('columns[0][name]', 'ClientesIndividuosNome');
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');
        params.append('formPesquisa[submitFilter]', 'true');
        Object.entries(filters).forEach(([k, v]) => {
            if (Array.isArray(v)) v.forEach(x => params.append(`formPesquisa[${k}][]`, x));
            else if (v) params.append(`formPesquisa[${k}]`, v);
        });

        const resp = await fetch(`${AEASY_BASE}/vendas/listagem`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': sessionCookies },
            body: params.toString(),
            redirect: 'manual',
        });
        if (resp.status === 302) { await loginAeasy(); continue; }
        const text = await resp.text();
        const i = text.indexOf('{');
        if (i < 0) break;
        const data = JSON.parse(text.substring(i));
        total = parseInt(data.recordsFiltered || 0);
        all = all.concat(data.data || []);
        start += 500;
    } while (start < total && start < 50000);
    return all;
}

async function fetchConsultoresAeasy() {
    let all = [], start = 0, total = 0;
    do {
        const params = new URLSearchParams();
        params.append('draw', '1');
        params.append('start', String(start));
        params.append('length', '500');
        params.append('columns[0][data]', 'IndividuosNome');
        params.append('columns[0][name]', 'IndividuosNome');
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');
        params.append('formPesquisa[submitFilter]', 'true');
        params.append('formPesquisa[Situacao][]', '2');

        const resp = await fetch(`${AEASY_BASE}/consultores/listagem?${params.toString()}`, {
            method: 'GET',
            headers: { 'X-Requested-With': 'XMLHttpRequest', 'Cookie': sessionCookies },
            redirect: 'manual',
        });
        const text = await resp.text();
        const i = text.indexOf('{');
        if (i < 0) break;
        const data = JSON.parse(text.substring(i));
        total = parseInt(data.recordsFiltered || 0);
        all = all.concat(data.data || []);
        start += 500;
    } while (start < total);
    return all;
}

// ============ LOGIN ============
async function loginAeasy() {
    const s = await fetch(`${AEASY_BASE}/conta/login`, { redirect: 'manual' });
    extractCookies(s);
    const r = await fetch(`${AEASY_BASE}/conta/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', 'Cookie': sessionCookies },
        body: `UsuariosLogin=${encodeURIComponent(AEASY_LOGIN)}&UsuariosSenha=${encodeURIComponent(AEASY_SENHA)}`,
        redirect: 'manual',
    });
    extractCookies(r);
    const text = await r.text();
    if (!text.includes('sucesso')) throw new Error('Login aEasy falhou');
}

function extractCookies(resp) {
    const raw = resp.headers.get('set-cookie');
    if (!raw) return;
    const map = {};
    if (sessionCookies) sessionCookies.split('; ').forEach(c => { const [k,...v] = c.split('='); if(k) map[k.trim()] = v.join('='); });
    raw.split(/,(?=\s*\w+=)/).forEach(p => { const m = p.split(';')[0].trim(); const [k,...v] = m.split('='); if(k) map[k.trim()] = v.join('='); });
    sessionCookies = Object.entries(map).map(([k,v]) => `${k}=${v}`).join('; ');
}

function parseData(d) {
    if (!d || d === '-' || d === 'null') return null;
    const p = d.split(' ')[0].split('/');
    if (p.length === 3 && p[0].length <= 2) return `${p[2]}-${p[1]}-${p[0]}`;
    if (d.match(/^\d{4}-\d{2}-\d{2}/)) return d.split(' ')[0];
    return null;
}

export const config = { maxDuration: 300 };
