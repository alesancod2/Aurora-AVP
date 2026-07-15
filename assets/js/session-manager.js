/**
 * Aurora AVP - Session Manager
 * 
 * Gerencia sessão do usuário com:
 * - Token único por dispositivo (single-session)
 * - Auto-refresh de token antes de expirar
 * - Verificação periódica (outro dispositivo logou?)
 * - Inatividade → logout automático (30min)
 * - Persistência via Supabase user_sessions table
 */

'use strict';

const SessionManager = (function () {

    // --- Config ---
    const CONFIG = {
        supabaseUrl: 'https://zjacembodtjrkynfmtxf.supabase.co',
        supabaseKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
        checkInterval: 15000,       // 15s - verificar sessão
        inactivityTimeout: 30 * 60 * 1000, // 30min
        tokenRefreshBuffer: 5 * 60 * 1000, // 5min antes de expirar
        storageKey: 'aurora_session',
    };

    // --- State ---
    let _sessionToken = null;
    let _userId = null;
    let _checkTimer = null;
    let _inactivityTimer = null;
    let _lastActivity = Date.now();
    let _isActive = false;
    let _onSessionExpired = null;
    let _onSessionKicked = null;

    // --- Init ---
    function init(options = {}) {
        if (options.onSessionExpired) _onSessionExpired = options.onSessionExpired;
        if (options.onSessionKicked) _onSessionKicked = options.onSessionKicked;

        // Restore session from storage
        const saved = loadFromStorage();
        if (saved) {
            _sessionToken = saved.token;
            _userId = saved.userId;
            _isActive = true;
            startChecks();
        }

        // Track activity
        ['click', 'keydown', 'scroll', 'mousemove', 'touchstart'].forEach(evt => {
            document.addEventListener(evt, resetActivity, { passive: true, capture: true });
        });

        return _isActive;
    }

    // --- Login: create new session ---
    async function login(userId) {
        _userId = userId;
        _sessionToken = generateToken();
        _isActive = true;

        // Save locally
        saveToStorage({ token: _sessionToken, userId: _userId, loginAt: Date.now() });

        // Invalidate old sessions + create new on Supabase
        try {
            await supabaseRpc('invalidar_sessoes_login', {
                p_usuario_id: _userId,
                p_novo_token: _sessionToken,
                p_device: getDeviceInfo()
            });
        } catch (e) {
            console.warn('[Session] Failed to register session on Supabase:', e.message);
            // Non-blocking: session still works locally
        }

        startChecks();
        log('Login registrado - sessão criada');
        return _sessionToken;
    }

    // --- Logout ---
    async function logout() {
        stopChecks();
        _isActive = false;

        // Deactivate on Supabase
        if (_userId && _sessionToken) {
            try {
                await supabaseUpdate('user_sessions', { ativo: false },
                    `usuario_id=eq.${_userId}&session_token=eq.${_sessionToken}`);
            } catch (e) {
                // Non-critical
            }
        }

        clearStorage();
        _sessionToken = null;
        _userId = null;
        log('Logout - sessão encerrada');
    }

    // --- Verify session is still valid ---
    async function verify() {
        if (!_isActive || !_userId || !_sessionToken) return false;

        try {
            const result = await supabaseRpc('verificar_sessao', {
                p_usuario_id: _userId,
                p_token: _sessionToken
            });

            if (result === false) {
                // Session was invalidated (another device logged in)
                log('Sessão invalidada por outro dispositivo');
                handleKicked();
                return false;
            }
            return true;
        } catch (e) {
            // Network error - don't kick user, just warn
            console.warn('[Session] Verify failed:', e.message);
            return true; // Assume valid on network errors
        }
    }

    // --- Check inactivity ---
    function checkInactivity() {
        if (!_isActive) return;
        const elapsed = Date.now() - _lastActivity;
        if (elapsed > CONFIG.inactivityTimeout) {
            log('Sessão expirada por inatividade (' + Math.round(elapsed / 60000) + 'min)');
            handleExpired();
        }
    }

    // --- Start periodic checks ---
    function startChecks() {
        // DISABLED: Session verification requires Supabase Auth login flow.
        // The Aurora AVP dashboard uses aEasy auth via Edge Function (no Supabase Auth).
        // Re-enable when user authentication is implemented.
        return;
    }

    function stopChecks() {
        if (_checkTimer) { clearInterval(_checkTimer); _checkTimer = null; }
    }

    // --- Handle kicked by another session ---
    function handleKicked() {
        _isActive = false;
        stopChecks();
        clearStorage();
        if (_onSessionKicked) _onSessionKicked();
    }

    // --- Handle expired (inactivity) ---
    function handleExpired() {
        _isActive = false;
        stopChecks();
        clearStorage();
        if (_onSessionExpired) _onSessionExpired();
    }

    // --- Activity tracking ---
    function resetActivity() {
        _lastActivity = Date.now();
    }

    // --- Kill other sessions (admin action) ---
    async function killOtherSessions() {
        if (!_userId || !_sessionToken) return 0;
        try {
            const sessions = await supabaseSelect('user_sessions',
                `usuario_id=eq.${_userId}&ativo=eq.true&session_token=neq.${_sessionToken}`);
            for (const s of sessions) {
                await supabaseUpdate('user_sessions', { ativo: false }, `id=eq.${s.id}`);
            }
            return sessions.length;
        } catch (e) {
            console.warn('[Session] killOtherSessions failed:', e);
            return 0;
        }
    }

    // --- Supabase helpers ---
    function supabaseHeaders() {
        return {
            'apikey': CONFIG.supabaseKey,
            'Authorization': 'Bearer ' + CONFIG.supabaseKey,
            'Content-Type': 'application/json'
        };
    }

    async function supabaseRpc(fnName, params) {
        const resp = await fetch(`${CONFIG.supabaseUrl}/rest/v1/rpc/${fnName}`, {
            method: 'POST',
            headers: supabaseHeaders(),
            body: JSON.stringify(params)
        });
        if (!resp.ok) throw new Error(`RPC ${fnName}: ${resp.status}`);
        const text = await resp.text();
        return text ? JSON.parse(text) : null;
    }

    async function supabaseSelect(table, filter) {
        const resp = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${table}?${filter}`, {
            headers: supabaseHeaders()
        });
        if (!resp.ok) throw new Error(`Select ${table}: ${resp.status}`);
        return resp.json();
    }

    async function supabaseUpdate(table, data, filter) {
        const resp = await fetch(`${CONFIG.supabaseUrl}/rest/v1/${table}?${filter}`, {
            method: 'PATCH',
            headers: { ...supabaseHeaders(), 'Prefer': 'return=minimal' },
            body: JSON.stringify(data)
        });
        if (!resp.ok) throw new Error(`Update ${table}: ${resp.status}`);
    }

    // --- Storage ---
    function saveToStorage(data) {
        try { localStorage.setItem(CONFIG.storageKey, JSON.stringify(data)); } catch (e) {}
    }

    function loadFromStorage() {
        try {
            const raw = localStorage.getItem(CONFIG.storageKey);
            return raw ? JSON.parse(raw) : null;
        } catch (e) { return null; }
    }

    function clearStorage() {
        try { localStorage.removeItem(CONFIG.storageKey); } catch (e) {}
    }

    // --- Utilities ---
    function generateToken() {
        if (crypto.randomUUID) return crypto.randomUUID();
        return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
    }

    function getDeviceInfo() {
        const ua = navigator.userAgent;
        if (/Mobile|Android|iPhone/.test(ua)) return 'Mobile';
        if (/Tablet|iPad/.test(ua)) return 'Tablet';
        return 'Desktop';
    }

    function log(msg) {
        const ts = new Date().toLocaleTimeString('pt-BR');
        console.log(`[${ts}] [SESSION] ${msg}`);
    }

    // --- Public API ---
    return {
        init,
        login,
        logout,
        verify,
        killOtherSessions,
        isActive: () => _isActive,
        getToken: () => _sessionToken,
        getUserId: () => _userId,
        resetActivity,
    };
})();
