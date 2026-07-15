/**
 * Aurora AVP - Gestores Ocultos
 * 
 * Permite ocultar/mostrar gestores do ranking e filtros.
 * Persistido em localStorage + Supabase (cross-device).
 */

'use strict';

const GestoresOcultos = (function () {

    const CONFIG = {
        supabaseUrl: 'https://zjacembodtjrkynfmtxf.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
        storageKey: 'aurora_gestores_ocultos',
        table: 'gestores_ocultos',
        userId: 'default', // Will be set on init
    };

    let _ocultos = []; // [{gestor_id, gestor_nome}]
    let _onChanged = null;

    // --- Init ---
    function init(userId, onChanged) {
        CONFIG.userId = userId || 'default';
        _onChanged = onChanged;
        loadFromStorage();
        loadFromSupabase(); // async, will update if different
    }

    // --- Ocultar gestor ---
    function ocultar(gestorId, gestorNome) {
        if (isOculto(gestorId)) return;
        _ocultos.push({ gestor_id: gestorId, gestor_nome: gestorNome });
        save();
        notify();
    }

    // --- Mostrar gestor (desocultar) ---
    function mostrar(gestorId) {
        _ocultos = _ocultos.filter(g => g.gestor_id !== gestorId);
        save();
        notify();
    }

    // --- Check ---
    function isOculto(gestorId) {
        return _ocultos.some(g => g.gestor_id === gestorId);
    }

    // --- Get list ---
    function getOcultos() {
        return [..._ocultos];
    }

    function getCount() {
        return _ocultos.length;
    }

    // --- Filter array of gestores (remove ocultos) ---
    function filtrar(gestores, idField = 'id') {
        const ocultosIds = new Set(_ocultos.map(g => g.gestor_id));
        return gestores.filter(g => !ocultosIds.has(g[idField]));
    }

    // --- Save ---
    function save() {
        saveToStorage();
        syncToSupabase();
    }

    function saveToStorage() {
        try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(_ocultos)); } catch (e) {}
    }

    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.storageKey);
            if (raw) _ocultos = JSON.parse(raw);
        } catch (e) { _ocultos = []; }
    }

    // --- Supabase sync ---
    async function loadFromSupabase() {
        try {
            const resp = await fetch(
                `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?usuario_id=eq.${CONFIG.userId}&select=gestor_id,gestor_nome`,
                { headers: headers() }
            );
            if (resp.ok) {
                const rows = await resp.json();
                if (rows.length > 0) {
                    // Merge: use Supabase as source of truth
                    _ocultos = rows;
                    saveToStorage();
                    notify();
                }
            }
        } catch (e) {
            console.warn('[GestoresOcultos] Supabase load failed:', e.message);
        }
    }

    async function syncToSupabase() {
        try {
            // Delete all for this user
            await fetch(
                `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?usuario_id=eq.${CONFIG.userId}`,
                { method: 'DELETE', headers: headers() }
            );

            // Re-insert current list
            if (_ocultos.length > 0) {
                const records = _ocultos.map(g => ({
                    usuario_id: CONFIG.userId,
                    gestor_id: g.gestor_id,
                    gestor_nome: g.gestor_nome
                }));
                await fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`, {
                    method: 'POST',
                    headers: { ...headers(), 'Prefer': 'return=minimal' },
                    body: JSON.stringify(records)
                });
            }
        } catch (e) {
            console.warn('[GestoresOcultos] Supabase sync failed:', e.message);
        }
    }

    function notify() {
        if (_onChanged) _onChanged(_ocultos);
    }

    function headers() {
        return {
            'apikey': CONFIG.supabaseKey,
            'Authorization': 'Bearer ' + CONFIG.supabaseKey,
            'Content-Type': 'application/json'
        };
    }

    return { init, ocultar, mostrar, isOculto, getOcultos, getCount, filtrar };
})();
