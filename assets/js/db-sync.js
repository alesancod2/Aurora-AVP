/**
 * Aurora AVP - Database Sync (Frontend)
 * 
 * Botão "Atualizar DB" no dashboard que chama a Edge Function import-data
 * em loop até importar todos os dados, com progresso visual.
 * 
 * Fluxo:
 *   1. Usuário clica "Iniciar Importação"
 *   2. Chama Edge Function import-data com offset=0
 *   3. Se retornar next_offset (partial), chama novamente
 *   4. Repete até status="complete" ou erro
 *   5. Mostra resultado final
 */

'use strict';

const DbSync = (function () {

    // --- Config ---
    const CONFIG = {
        edgeFunctionUrl: 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-prox',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
        supabaseServiceKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NDExNzc1MSwiZXhwIjoyMDk5NjkzNzUxfQ.4nIV41kQHEFAwCV2VjROZcm20BnySmZ7FVlAMJAFvr4',
        supabaseUrl: 'https://zjacembodtjrkynfmtxf.supabase.co',
        delayBetweenCalls: 1500,
        batchSize: 500,
        upsertChunkSize: 200,
    };

    // --- State ---
    let _running = false;
    let _cancelled = false;
    let _totalInserted = { consultores: 0, vendas: 0 };

    // --- DOM Elements ---
    function el(id) { return document.getElementById(id); }

    // --- Init ---
    function init() {
        // Open modal
        el('btn-sync-db').addEventListener('click', openModal);

        // Close modal
        el('btn-close-sync-modal').addEventListener('click', closeModal);
        el('modal-sync-db').addEventListener('click', function (e) {
            if (e.target === this) closeModal();
        });

        // Start import
        el('btn-sync-start').addEventListener('click', startImport);

        // Cancel
        el('btn-sync-cancel').addEventListener('click', function () {
            _cancelled = true;
            addLog('Importação cancelada pelo usuário.', 'warn');
        });
    }

    function openModal() {
        el('modal-sync-db').style.display = 'flex';
        el('sync-progress').style.display = 'none';
        el('sync-result').style.display = 'none';
        el('btn-sync-start').style.display = '';
        el('btn-sync-cancel').style.display = 'none';
        el('sync-log').innerHTML = '';
        _totalInserted = { consultores: 0, vendas: 0 };
    }

    function closeModal() {
        if (_running) {
            if (!confirm('Importação em andamento. Deseja realmente fechar?')) return;
            _cancelled = true;
        }
        el('modal-sync-db').style.display = 'none';
    }

    // --- Import Logic ---
    async function startImport() {
        if (_running) return;
        _running = true;
        _cancelled = false;
        _totalInserted = { consultores: 0, vendas: 0 };

        const target = el('sync-target').value;
        const maxBatches = parseInt(el('sync-max-batches').value);
        const batchSize = parseInt(el('sync-batch-size').value);

        // UI state
        el('btn-sync-start').style.display = 'none';
        el('btn-sync-cancel').style.display = '';
        el('sync-progress').style.display = 'block';
        el('sync-result').style.display = 'none';
        el('sync-log').innerHTML = '';

        updateProgress(0, 'Iniciando importação...');
        addLog(`Alvo: ${target} | Lotes: ${maxBatches} | Batch: ${batchSize}`, 'info');

        const startTime = Date.now();

        try {
            if (target === 'consultores' || target === 'all') {
                await importTarget('consultores', batchSize, maxBatches);
            }

            if (!_cancelled && (target === 'vendas' || target === 'all')) {
                await importTarget('vendas', batchSize, maxBatches);
            }

            // Done
            const elapsed = Math.round((Date.now() - startTime) / 1000);
            showResult(true, elapsed);

        } catch (e) {
            addLog(`ERRO: ${e.message}`, 'error');
            showResult(false, Math.round((Date.now() - startTime) / 1000), e.message);
        }

        _running = false;
        el('btn-sync-start').style.display = '';
        el('btn-sync-cancel').style.display = 'none';
    }

    async function importTarget(target, batchSize, maxBatches) {
        let offset = 0;
        let totalRecords = 0;
        let iteration = 0;

        addLog(`Importando ${target}...`, 'info');

        while (!_cancelled) {
            iteration++;
            addLog(`Lote #${iteration} (offset=${offset}, batch=${batchSize})`, 'info');

            // 1. Fetch from aEasy via aeasy-prox
            const fetchResult = await fetchFromAeasy(target, offset, batchSize);

            if (!fetchResult || !fetchResult.data || !fetchResult.data.length) {
                addLog(`Sem mais registros para ${target}`, 'info');
                break;
            }

            totalRecords = fetchResult.total || totalRecords;
            const records = fetchResult.data;

            // 2. Map and upsert to Supabase
            const mapped = records.map(target === 'consultores' ? mapConsultor : mapVenda);
            const inserted = await upsertToSupabase(target, mapped);
            _totalInserted[target] += inserted;

            const pct = totalRecords > 0
                ? Math.min(100, Math.round((_totalInserted[target] / totalRecords) * 100))
                : 0;

            updateProgress(pct, `${target}: ${_totalInserted[target]}/${totalRecords} registros`);
            addLog(`${target}: +${inserted} inseridos (${_totalInserted[target]}/${totalRecords})`, 'ok');

            offset += batchSize;
            if (offset >= totalRecords) {
                addLog(`${target} concluído!`, 'ok');
                updateProgress(100, `${target}: ${_totalInserted[target]}/${totalRecords} - Completo!`);
                break;
            }

            if (iteration >= maxBatches) {
                addLog(`Limite de ${maxBatches} lotes atingido. Parcial.`, 'warn');
                break;
            }

            await sleep(CONFIG.delayBetweenCalls);
        }
    }

    // --- Fetch data from aEasy via aeasy-prox ---
    async function fetchFromAeasy(target, offset, length) {
        const endpoint = target === 'consultores' ? '/consultores/listagem' : '/vendas/listagem';
        const method = target === 'consultores' ? 'GET' : 'POST';
        const columnName = target === 'consultores' ? 'IndividuosNome' : 'ClientesIndividuosNome';

        // Build DataTables params
        const params = new URLSearchParams();
        params.append('draw', '1');
        params.append('start', String(offset));
        params.append('length', String(length));
        params.append('columns[0][data]', columnName);
        params.append('columns[0][name]', columnName);
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');
        params.append('formPesquisa[submitFilter]', 'true');

        const payload = {
            action: 'request',
            method: method,
            endpoint: method === 'GET' ? `${endpoint}?${params.toString()}` : endpoint,
            body: method === 'POST' ? params.toString() : '',
        };

        const response = await fetch(CONFIG.edgeFunctionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${CONFIG.supabaseAnonKey}`,
                'apikey': CONFIG.supabaseAnonKey,
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const result = await response.json();
        if (result.error) throw new Error(result.error);

        const data = result.data;
        if (!data || !data.data) throw new Error('Resposta sem dados');

        return { data: data.data, total: parseInt(data.recordsFiltered || data.recordsTotal || '0') };
    }

    // --- Upsert to Supabase DB ---
    async function upsertToSupabase(table, records) {
        let inserted = 0;
        for (let i = 0; i < records.length; i += CONFIG.upsertChunkSize) {
            const chunk = records.slice(i, i + CONFIG.upsertChunkSize);
            const resp = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${table}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${CONFIG.supabaseServiceKey}`,
                    'apikey': CONFIG.supabaseServiceKey,
                    'Prefer': 'resolution=merge-duplicates',
                },
                body: JSON.stringify(chunk),
            });
            if (resp.ok) {
                inserted += chunk.length;
            } else {
                const err = await resp.text();
                addLog(`Erro upsert: ${resp.status} - ${err.substring(0, 100)}`, 'error');
            }
        }
        return inserted;
    }

    // --- Field Mappers ---
    function parseDecimal(value) {
        if (!value) return null;
        const str = String(value).replace(/[R$\s.]/g, '').replace(',', '.');
        const num = parseFloat(str);
        return isNaN(num) ? null : num;
    }

    function mapConsultor(raw) {
        return {
            consultores_id: raw.ConsultoresId,
            individuos_nome: raw.IndividuosNome || '',
            individuos_documento: raw.IndividuosDocumento || null,
            individuos_email: raw.IndividuosEmail || null,
            individuos_login: raw.IndividuosLogin || null,
            consultores_tipo_consultor_enum: raw.ConsultoresTipoConsultorEnum ? parseInt(String(raw.ConsultoresTipoConsultorEnum)) : null,
            consultores_situacao_cadastro_enum: raw.ConsultoresSituacaoCadastroEnum ? parseInt(String(raw.ConsultoresSituacaoCadastroEnum)) : null,
            consultores_patrocinador_individuos_nome: raw.ConsultoresPatrocinadorIndividuosNome || null,
            grupos_empresas_nome: raw.GruposEmpresasNome || null,
            synced_at: new Date().toISOString(),
        };
    }

    function mapVenda(raw) {
        return {
            vendas_id: raw.VendasId,
            clientes_individuos_nome: raw.ClientesIndividuosNome || null,
            clientes_individuos_documento: raw.ClientesIndividuosDocumento || null,
            vendas_carros_placa: raw.VendasCarrosPlaca || null,
            vendas_carros_marcas_nome: raw.VendasCarrosMarcasNome || null,
            vendas_carros_modelos_nome: raw.VendasCarrosModelosNome || null,
            vendas_carros_valor_total: parseDecimal(raw.VendasCarrosValorTotal),
            vendas_situacao_enum: raw.VendasSituacaoEnum ? parseInt(String(raw.VendasSituacaoEnum)) : 1,
            vendas_data_cadastro: raw.VendasDataCadastro || null,
            vendas_data_ativacao: raw.VendasDataAtivacao || null,
            vendas_consultores_id: raw.VendasConsultoresId || null,
            consultores_nome: raw.ConsultoresNome || null,
            consultores_centro_custo_nome: raw.ConsultoresCentroCustoNome || null,
            synced_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        };
    }

    // --- UI Helpers ---
    function updateProgress(pct, text) {
        el('sync-progress-bar').style.width = pct + '%';
        el('sync-progress-text').textContent = text;
    }

    function addLog(message, type) {
        const logEl = el('sync-log');
        const ts = new Date().toLocaleTimeString('pt-BR');
        const colors = { info: '#60a5fa', ok: '#34d399', warn: '#fbbf24', error: '#f87171' };
        const color = colors[type] || colors.info;
        logEl.innerHTML += `<div style="color:${color}">[${ts}] ${message}</div>`;
        logEl.scrollTop = logEl.scrollHeight;
    }

    function showResult(success, elapsed, error) {
        const resultEl = el('sync-result');
        resultEl.style.display = 'block';

        if (success && !_cancelled) {
            resultEl.innerHTML = `
                <div class="sync-result-success">
                    <i class="bi bi-check-circle-fill"></i>
                    <h4>Importação Concluída!</h4>
                    <p>
                        ${_totalInserted.consultores > 0 ? `<strong>${_totalInserted.consultores}</strong> consultores` : ''}
                        ${_totalInserted.consultores > 0 && _totalInserted.vendas > 0 ? ' + ' : ''}
                        ${_totalInserted.vendas > 0 ? `<strong>${_totalInserted.vendas}</strong> vendas` : ''}
                        importados em <strong>${elapsed}s</strong>
                    </p>
                </div>`;
        } else if (_cancelled) {
            resultEl.innerHTML = `
                <div class="sync-result-warn">
                    <i class="bi bi-pause-circle-fill"></i>
                    <h4>Importação Interrompida</h4>
                    <p>
                        ${_totalInserted.consultores + _totalInserted.vendas} registros importados antes da pausa.
                        Você pode continuar de onde parou.
                    </p>
                </div>`;
        } else {
            resultEl.innerHTML = `
                <div class="sync-result-error">
                    <i class="bi bi-x-circle-fill"></i>
                    <h4>Erro na Importação</h4>
                    <p>${error || 'Erro desconhecido'}</p>
                    <p class="sync-result-hint">Tente novamente com lotes menores ou verifique o console.</p>
                </div>`;
        }
    }

    function sleep(ms) {
        return new Promise(r => setTimeout(r, ms));
    }

    // --- Auto-init ---
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    return { startImport, openModal, closeModal };
})();
