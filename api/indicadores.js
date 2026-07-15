/**
 * API Indicadores - Lê do Supabase (cache DB)
 * 
 * Fluxo: Browser → /api/indicadores → Supabase DB → resposta (~200ms)
 * Em vez de: Browser → /api/proxy → aEasy (3-15s)
 * 
 * Query params:
 *   ?gestorId=xxx       - Filtrar por gestor (inclui equipe)
 *   ?de=2026-01-01      - Data início
 *   ?ate=2026-07-15     - Data fim
 *   ?regional=xxx       - Filtrar por centro de custo
 *   ?vendedorId=xxx     - Filtrar por vendedor específico
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = 'https://zjacembodtjrkynfmtxf.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4';

export default async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');

    if (req.method === 'OPTIONS') return res.status(204).end();

    try {
        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
        const { gestorId, vendedorId, de, ate, regional } = req.query;

        const dataInicio = de || new Date(new Date().setDate(1)).toISOString().split('T')[0];
        const dataFim = ate || new Date().toISOString().split('T')[0];

        // 1. Obter IDs da equipe (se gestorId fornecido)
        let idsEquipe = [];

        if (vendedorId) {
            idsEquipe = [vendedorId];
        } else if (gestorId) {
            // Buscar gestor + membros da equipe
            const { data: gestor } = await supabase
                .from('consultores')
                .select('individuos_nome')
                .eq('consultores_id', gestorId)
                .single();

            if (gestor) {
                // Buscar vendedores que têm esse gestor como patrocinador
                const { data: equipe } = await supabase
                    .from('consultores')
                    .select('consultores_id')
                    .eq('consultores_patrocinador_individuos_nome', gestor.individuos_nome);

                idsEquipe = [gestorId, ...(equipe || []).map(e => e.consultores_id)];
            }
        }

        // 2. Query principal nas vendas
        let query = supabase
            .from('vendas')
            .select('vendas_situacao_enum, vendas_carros_valor_mensal, vendas_consultores_id, consultores_nome, vendas_data_cadastro')
            .gte('vendas_data_cadastro', dataInicio)
            .lte('vendas_data_cadastro', dataFim);

        // Filtros
        if (idsEquipe.length > 0) {
            query = query.in('vendas_consultores_id', idsEquipe);
        }
        if (regional) {
            query = query.eq('consultores_centro_custo_id', regional);
        }

        const { data: vendas, error } = await query;

        if (error) throw error;

        // 3. Calcular indicadores
        const cotacoes = vendas.length;
        const vendasAtivas = vendas.filter(v => v.vendas_situacao_enum === 1);
        const canceladas = vendas.filter(v => v.vendas_situacao_enum === 3);
        const perdidas = vendas.filter(v => [2, 3].includes(v.vendas_situacao_enum));

        const valorVendido = vendasAtivas.reduce((sum, v) => sum + (v.vendas_carros_valor_mensal || 0), 0);
        const valorPerdido = perdidas.reduce((sum, v) => sum + (v.vendas_carros_valor_mensal || 0), 0);

        // 4. Ranking por vendedor
        const rankingMap = {};
        vendas.forEach(v => {
            const id = v.vendas_consultores_id;
            if (!rankingMap[id]) rankingMap[id] = { id, nome: v.consultores_nome, vendas: 0, valor: 0, cotacoes: 0 };
            rankingMap[id].cotacoes++;
            if (v.vendas_situacao_enum === 1) {
                rankingMap[id].vendas++;
                rankingMap[id].valor += v.vendas_carros_valor_mensal || 0;
            }
        });

        const ranking = Object.values(rankingMap)
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10)
            .map((r, i) => ({
                ...r,
                posicao: i + 1,
                conversao: r.cotacoes > 0 ? ((r.vendas / r.cotacoes) * 100).toFixed(1) : '0.0',
            }));

        // 5. Evolução mensal
        const mesesMap = {};
        vendas.forEach(v => {
            if (!v.vendas_data_cadastro) return;
            const mes = v.vendas_data_cadastro.substring(0, 7); // YYYY-MM
            if (!mesesMap[mes]) mesesMap[mes] = { mes, cotacoes: 0, vendas: 0, cancelamentos: 0, perdidas: 0 };
            mesesMap[mes].cotacoes++;
            if (v.vendas_situacao_enum === 1) mesesMap[mes].vendas++;
            if (v.vendas_situacao_enum === 3) mesesMap[mes].cancelamentos++;
            if (v.vendas_situacao_enum === 2) mesesMap[mes].perdidas++;
        });
        const evolucao = Object.values(mesesMap).sort((a, b) => a.mes.localeCompare(b.mes));

        // 6. Último sync
        const { data: lastSync } = await supabase
            .from('sync_log')
            .select('concluido_em, duracao_ms')
            .eq('status', 'success')
            .order('concluido_em', { ascending: false })
            .limit(1);

        // Resposta
        return res.status(200).json({
            indicadores: {
                cotacoes,
                vendas: vendasAtivas.length,
                canceladas: canceladas.length,
                perdidas: perdidas.length,
                taxaConversao: cotacoes > 0 ? ((vendasAtivas.length / cotacoes) * 100).toFixed(1) : '0.0',
                valorTotalVendido: valorVendido,
                valorTotalPerdido: valorPerdido,
                ticketMedio: vendasAtivas.length > 0 ? valorVendido / vendasAtivas.length : 0,
                percentualCanceladas: cotacoes > 0 ? ((canceladas.length / cotacoes) * 100).toFixed(1) : '0.0',
                percentualPerdidas: cotacoes > 0 ? ((perdidas.length / cotacoes) * 100).toFixed(1) : '0.0',
            },
            ranking,
            evolucaoMensal: evolucao,
            meta: {
                fonte: 'supabase_cache',
                registros: vendas.length,
                equipe: idsEquipe.length,
                periodo: { de: dataInicio, ate: dataFim },
                ultimoSync: lastSync?.[0]?.concluido_em || null,
            }
        });

    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}

export const config = {
    api: { bodyParser: false },
};
