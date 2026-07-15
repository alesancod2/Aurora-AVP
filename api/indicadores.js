/**
 * API Indicadores - Lê do Supabase (cache DB) em ~200ms
 * Usa REST API diretamente (sem SDK)
 * 
 * GET /api/indicadores?gestorId=xxx&de=2026-01-01&ate=2026-07-15&regional=xxx
 */

const SUPABASE_URL = 'https://zjacembodtjrkynfmtxf.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
        const { gestorId, vendedorId, de, ate, regional } = req.query;
        const dataInicio = de || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const dataFim = ate || new Date().toISOString().split('T')[0];

        // 1. Obter IDs da equipe
        let idsFilter = '';
        if (vendedorId) {
            idsFilter = `&vendas_consultores_id=eq.${vendedorId}`;
        } else if (gestorId) {
            // Buscar nome do gestor
            const gestorResp = await supabaseGet(`/consultores?consultores_id=eq.${gestorId}&select=individuos_nome`);
            const gestor = gestorResp?.[0];
            if (gestor) {
                // Buscar IDs da equipe
                const equipe = await supabaseGet(`/consultores?consultores_patrocinador_individuos_nome=eq.${encodeURIComponent(gestor.individuos_nome)}&select=consultores_id`);
                const ids = [gestorId, ...(equipe || []).map(e => e.consultores_id)];
                idsFilter = `&vendas_consultores_id=in.(${ids.join(',')})`;
            }
        }

        // 2. Query vendas no período
        let url = `/vendas?select=vendas_situacao_enum,vendas_carros_valor_mensal,vendas_consultores_id,consultores_nome,vendas_data_cadastro&vendas_data_cadastro=gte.${dataInicio}&vendas_data_cadastro=lte.${dataFim}${idsFilter}`;
        if (regional) url += `&consultores_centro_custo_id=eq.${regional}`;

        const vendas = await supabaseGet(url);

        if (!vendas || vendas.length === 0) {
            return res.status(200).json({
                indicadores: { cotacoes: 0, vendas: 0, canceladas: 0, perdidas: 0, taxaConversao: '0.0', valorTotalVendido: 0, ticketMedio: 0, percentualCanceladas: '0.0', percentualPerdidas: '0.0' },
                ranking: [],
                evolucaoMensal: [],
                meta: { fonte: 'supabase', registros: 0, vazio: true, periodo: { de: dataInicio, ate: dataFim } }
            });
        }

        // 3. Calcular indicadores
        const ativos = vendas.filter(v => v.vendas_situacao_enum === 1);
        const cancelados = vendas.filter(v => v.vendas_situacao_enum === 3);
        const perdidos = vendas.filter(v => [2, 3].includes(v.vendas_situacao_enum));
        const valorVendido = ativos.reduce((s, v) => s + (v.vendas_carros_valor_mensal || 0), 0);
        const total = vendas.length;

        // 4. Ranking
        const rMap = {};
        vendas.forEach(v => {
            const id = v.vendas_consultores_id;
            if (!rMap[id]) rMap[id] = { id, nome: v.consultores_nome, vendas: 0, valor: 0, cotacoes: 0 };
            rMap[id].cotacoes++;
            if (v.vendas_situacao_enum === 1) { rMap[id].vendas++; rMap[id].valor += v.vendas_carros_valor_mensal || 0; }
        });
        const ranking = Object.values(rMap).sort((a, b) => b.valor - a.valor).slice(0, 10)
            .map((r, i) => ({ ...r, posicao: i + 1, conversao: r.cotacoes > 0 ? ((r.vendas / r.cotacoes) * 100).toFixed(1) : '0.0' }));

        // 5. Evolução mensal
        const mMap = {};
        vendas.forEach(v => {
            if (!v.vendas_data_cadastro) return;
            const mes = v.vendas_data_cadastro.substring(0, 7);
            if (!mMap[mes]) mMap[mes] = { mes, cotacoes: 0, vendas: 0, cancelamentos: 0, perdidas: 0 };
            mMap[mes].cotacoes++;
            if (v.vendas_situacao_enum === 1) mMap[mes].vendas++;
            if (v.vendas_situacao_enum === 3) mMap[mes].cancelamentos++;
            if (v.vendas_situacao_enum === 2) mMap[mes].perdidas++;
        });

        return res.status(200).json({
            indicadores: {
                cotacoes: total,
                vendas: ativos.length,
                canceladas: cancelados.length,
                perdidas: perdidos.length,
                taxaConversao: total > 0 ? ((ativos.length / total) * 100).toFixed(1) : '0.0',
                valorTotalVendido: valorVendido,
                valorTotalPerdido: perdidos.reduce((s, v) => s + (v.vendas_carros_valor_mensal || 0), 0),
                ticketMedio: ativos.length > 0 ? valorVendido / ativos.length : 0,
                percentualCanceladas: total > 0 ? ((cancelados.length / total) * 100).toFixed(1) : '0.0',
                percentualPerdidas: total > 0 ? ((perdidos.length / total) * 100).toFixed(1) : '0.0',
            },
            ranking,
            evolucaoMensal: Object.values(mMap).sort((a, b) => a.mes.localeCompare(b.mes)),
            meta: { fonte: 'supabase', registros: vendas.length, periodo: { de: dataInicio, ate: dataFim } }
        });
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

async function supabaseGet(path) {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
        headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` },
    });
    if (!resp.ok) return null;
    return await resp.json();
}
