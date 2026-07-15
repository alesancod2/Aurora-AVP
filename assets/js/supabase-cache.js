/**
 * Aurora AVP - Supabase Cache Layer
 * 
 * Cache inteligente que armazena resultados de consultas no Supabase DB:
 * - Hash dos filtros como chave (evita duplicação)
 * - TTL configurável (padrão 15min)
 * - Fallback para localStorage se Supabase offline
 * - Limpeza automática de cache expirado
 */

'use strict';

const SupabaseCache = (function () {

    const CONFIG = {
        supabaseUrl: 'https://zjacembodtjrkynfmtxf.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
        defaultTTL: 15 * 60 * 1000, // 15 minutes
        table: 'relatorios_cache',
        localPrefix: 'aurora_cache_sb_',
    };

    // --- Generate hash from filter params ---
    function generateHash(tipo, params) {
        const str = tipo + '|' + JSON.stringify(params, Object.keys(params).sort());
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash |= 0;
        }
        return 'h_' + Math.abs(hash).toString(36);
    }

    // --- GET from cache ---
    async function get(tipo, params) {
        const hash = generateHash(tipo, params);

        // 1. Try Supabase first
        try {
            const resp = await fetch(
                `${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?filtro_hash=eq.${hash}&select=dados,expires_at,updated_at,total_registros`,
                { headers: headers() }
            );

            if (resp.ok) {
                const rows = await resp.json();
                if (rows.length > 0) {
                    const row = rows[0];
                    const expiresAt = new Date(row.expires_at).getTime();

                    if (expiresAt > Date.now()) {
                        console.log(`[Cache] HIT Supabase: ${tipo} (${hash})`);
                        return {
                            data: row.dados,
                            source: 'supabase',
                            age: Math.round((Date.now() - new Date(row.updated_at).getTime()) / 1000),
                            total: row.total_registros
                        };
                    }
                    // Expired - delete it
                    fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?filtro_hash=eq.${hash}`, {
                        method: 'DELETE', headers: headers()
                    }).catch(() => {});
                }
            }
        } catch (e) {
            console.warn('[Cache] Supabase read failed:', e.message);
        }

        // 2. Fallback: localStorage
        try {
            const local = localStorage.getItem(CONFIG.localPrefix + hash);
            if (local) {
                const parsed = JSON.parse(local);
                if (parsed.expiresAt > Date.now()) {
                    console.log(`[Cache] HIT localStorage: ${tipo} (${hash})`);
                    return {
                        data: parsed.data,
                        source: 'local',
                        age: Math.round((Date.now() - parsed.savedAt) / 1000),
                        total: parsed.total
                    };
                }
                localStorage.removeItem(CONFIG.localPrefix + hash);
            }
        } catch (e) {}

        return null; // MISS
    }

    // --- SET to cache ---
    async function set(tipo, params, data, options = {}) {
        const hash = generateHash(tipo, params);
        const ttl = options.ttl || CONFIG.defaultTTL;
        const expiresAt = new Date(Date.now() + ttl).toISOString();
        const total = Array.isArray(data) ? data.length : (data?.total || 0);

        // 1. Save to Supabase (non-blocking)
        const record = {
            filtro_hash: hash,
            tipo_relatorio: tipo,
            data_inicial: params.DataInicial || params.dataInicial || null,
            data_final: params.DataFinal || params.dataFinal || null,
            gestor_id: params.gestorId || null,
            regional: params.regional || null,
            dados: data,
            total_registros: total,
            expires_at: expiresAt,
            created_by: options.userId || 'anonymous'
        };

        fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}`, {
            method: 'POST',
            headers: { ...headers(), 'Prefer': 'resolution=merge-duplicates' },
            body: JSON.stringify(record)
        }).then(() => {
            console.log(`[Cache] Saved to Supabase: ${tipo} (${hash}), ${total} records, TTL ${Math.round(ttl/60000)}min`);
        }).catch(e => {
            console.warn('[Cache] Supabase write failed:', e.message);
        });

        // 2. Save to localStorage (synchronous fallback)
        try {
            localStorage.setItem(CONFIG.localPrefix + hash, JSON.stringify({
                data, total, savedAt: Date.now(), expiresAt: Date.now() + ttl
            }));
        } catch (e) {
            // localStorage full - evict oldest
            evictOldestLocal();
            try {
                localStorage.setItem(CONFIG.localPrefix + hash, JSON.stringify({
                    data, total, savedAt: Date.now(), expiresAt: Date.now() + ttl
                }));
            } catch (e2) {}
        }
    }

    // --- Invalidate specific cache ---
    async function invalidate(tipo, params) {
        const hash = generateHash(tipo, params);

        // Remove from Supabase
        fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?filtro_hash=eq.${hash}`, {
            method: 'DELETE', headers: headers()
        }).catch(() => {});

        // Remove from localStorage
        localStorage.removeItem(CONFIG.localPrefix + hash);
        console.log(`[Cache] Invalidated: ${tipo} (${hash})`);
    }

    // --- Clear all cache ---
    async function clearAll() {
        // Supabase
        fetch(`${CONFIG.supabaseUrl}/rest/v1/${CONFIG.table}?filtro_hash=neq.`, {
            method: 'DELETE', headers: headers()
        }).catch(() => {});

        // localStorage
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CONFIG.localPrefix)) localStorage.removeItem(key);
        });
        console.log('[Cache] All cache cleared');
    }

    // --- Evict oldest localStorage entries ---
    function evictOldestLocal() {
        const entries = [];
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CONFIG.localPrefix)) {
                try {
                    const val = JSON.parse(localStorage.getItem(key));
                    entries.push({ key, savedAt: val.savedAt || 0 });
                } catch (e) { entries.push({ key, savedAt: 0 }); }
            }
        });
        entries.sort((a, b) => a.savedAt - b.savedAt);
        // Remove oldest 3
        entries.slice(0, 3).forEach(e => localStorage.removeItem(e.key));
    }

    // --- Stats ---
    function stats() {
        let localCount = 0, localSize = 0;
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith(CONFIG.localPrefix)) {
                localCount++;
                localSize += (localStorage.getItem(key) || '').length;
            }
        });
        return { localEntries: localCount, localSizeKB: Math.round(localSize / 1024) };
    }

    // --- Helpers ---
    function headers() {
        return {
            'apikey': CONFIG.supabaseKey,
            'Authorization': 'Bearer ' + CONFIG.supabaseKey,
            'Content-Type': 'application/json'
        };
    }

    return { get, set, invalidate, clearAll, stats, generateHash };
})();
