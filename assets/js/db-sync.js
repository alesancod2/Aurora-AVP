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
        edgeFunctionUrl: 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/import-data',
        supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
        delayBetweenCalls: 2000, // 2s entre chamadas à Edge Function
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
            addLog(`Chamada #${iteration} (offset=${offset}, batch=${batchSize}, max=${maxBatches})`, 'info');

            const result = await callEdgeFunction(target, batchSize, offset, maxBatches);

            if (!result.success) {
                throw new Error(result.error || 'Edge Function retornou erro');
            }

            const data = result.results[target];
            if (!data) {
                addLog(`Sem dados retornados para ${target}`, 'warn');
                break;
            }

            totalRecords = data.total || totalRecords;
            _totalInserted[target] += data.inserted || 0;

            const pct = totalRecords > 0
                ? Math.min(100, Math.round((_totalInserted[target] / totalRecords) * 100))
                : 0;

            updateProgress(pct, `${target}: ${_totalInserted[target]}/${totalRecords} registros`);
            addLog(`${target}: +${data.inserted} inseridos (${_totalInserted[target]}/${totalRecords})`, 'ok');

            // Check if complete
            if (data.status === 'complete' || data.next_offset === null) {
                addLog(`${target} concluído!`, 'ok');
                updateProgress(100, `${target}: ${_totalInserted[target]}/${totalRecords} - Completo!`);
                break;
            }

            // Timeout or partial - continue with next offset
            if (data.status === 'timeout' || data.status === 'partial') {
                offset = data.next_offset;
                addLog(`Continuando do offset ${offset}...`, 'info');
                await sleep(CONFIG.delayBetweenCalls);
                continue;
            }

            // Error
            if (data.status === 'error') {
                throw new Error(data.error || `Erro ao importar ${target}`);
            }

            break;
        }
    }

    async function callEdgeFunction(target, batchSize, offset, maxBatches) {
        const payload = {
            target: target,
            batch_size: batchSize,
            offset: offset,
            max_batches: maxBatches,
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
            const errText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errText.substring(0, 200)}`);
        }

        return await response.json();
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
