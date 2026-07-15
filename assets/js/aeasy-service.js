/**
 * AEasy Service Layer - Integração com endpoints do sistema aEasy
 * Auto Vale Prevenções - Dashboard Comercial
 * 
 * Responsabilidades:
 * - Autenticação e gestão de sessão
 * - Requisições aos endpoints DataTables
 * - Cache inteligente
 * - Logs detalhados
 * - Tratamento de erros
 */

'use strict';

const AeasyService = (function () {

    // ============================================
    // CONFIGURAÇÃO
    // ============================================
    const CONFIG = {
        baseUrl: 'https://aeasy.autovaleprevencoes.org',
        credentials: {
            login: '03268401503',   // CPF Admin
            senha: 'Ale@2026'
        },
        admin: {
            UsuariosId: 'B69B8C45-68C2-FFF9-5FEE-B75E99911451',
            IndividuosId: 'B69B8C45-68C2-FFF9-5FEE-B75E99911451',
            Nome: 'Alesanco dos Santos Ferreira',
            Empresa: 'autovaleprevencoes',
        },
        // Proxy CORS - Supabase Edge Function
        corsProxy: {
            enabled: true,
            provider: 'supabase',
            providers: {
                supabase: 'https://zjacembodtjrkynfmtxf.supabase.co/functions/v1/aeasy-prox',
            },
            supabaseAnonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY',
            fallbackOrder: ['supabase'],
        },
        cache: {
            enabled: true,
            ttl: 15 * 60 * 1000, // 15 minutos (cache-first)
        },
        pagination: {
            defaultLength: 500,  // Otimizado: menos requests
            maxLength: 1000,
        },
        timeout: 120000, // 2 minutos
    };


    // ============================================
    // ESTADO INTERNO
    // ============================================
    let _sessionCookie = null;
    let _isAuthenticated = false;
    let _cache = new Map();
    let _logs = [];

    // ============================================
    // LOGGER
    // ============================================
    const Logger = {
        _maxLogs: 500,

        log(type, message, data = null) {
            const entry = {
                time: new Date().toISOString(),
                type, // 'req', 'res', 'err', 'info'
                message,
                data
            };
            _logs.push(entry);
            if (_logs.length > this._maxLogs) _logs.shift();

            // Console output
            const prefix = `[${entry.time.split('T')[1].split('.')[0]}] [${type.toUpperCase()}]`;
            if (type === 'err') {
                console.error(prefix, message, data || '');
            } else {
                console.log(prefix, message, data || '');
            }

            // Dispatch event for UI
            document.dispatchEvent(new CustomEvent('aeasy-log', { detail: entry }));
        },

        getLogs() { return [..._logs]; },
        clear() { _logs = []; }
    };


    // ============================================
    // CACHE-FIRST (localStorage persistente + memória)
    // 
    // Estratégia:
    //   1. Verifica localStorage (persiste entre reloads) - TTL 15min
    //   2. Se HIT: retorna imediato (0ms) + refresh em background
    //   3. Se MISS: busca do aEasy → salva em localStorage → retorna
    //   4. Background: atualiza cache silenciosamente
    //
    // Resultado: Após primeira carga, dashboard abre em <100ms
    // ============================================
    const Cache = {
        PREFIX: 'aurora_cache_',
        TTL: 15 * 60 * 1000,          // 15 minutos
        STALE_TTL: 60 * 60 * 1000,    // 1 hora (retorna stale enquanto atualiza)
        MAX_STORAGE: 4.5 * 1024 * 1024, // 4.5MB (limite localStorage ~5MB)

        /**
         * Busca do cache (localStorage + memória)
         * Retorna dados mesmo se stale (e dispara refresh em background)
         */
        get(key) {
            if (!CONFIG.cache.enabled) return null;

            // 1. Tentar memória primeiro (mais rápido)
            const memItem = _cache.get(key);
            if (memItem && Date.now() - memItem.timestamp < this.TTL) {
                return memItem.data;
            }

            // 2. Tentar localStorage (persiste entre reloads)
            try {
                const stored = localStorage.getItem(this.PREFIX + key);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    const age = Date.now() - parsed.timestamp;

                    // Fresh: retorna direto
                    if (age < this.TTL) {
                        // Restaurar na memória também
                        _cache.set(key, parsed);
                        Logger.log('info', `Cache HIT (localStorage, ${Math.round(age/1000)}s): ${key.substring(0, 50)}`);
                        return parsed.data;
                    }

                    // Stale (< 1h): retorna dados antigos, atualiza em background
                    if (age < this.STALE_TTL) {
                        _cache.set(key, parsed);
                        Logger.log('info', `Cache STALE (${Math.round(age/60000)}min): ${key.substring(0, 50)} - retornando + refresh bg`);
                        // Marcar para refresh (não bloqueia)
                        this._scheduleRefresh(key);
                        return parsed.data;
                    }

                    // Expirado: remover
                    localStorage.removeItem(this.PREFIX + key);
                }
            } catch (e) {
                // localStorage indisponível ou quota excedida
            }

            return null;
        },

        /**
         * Salva no cache (memória + localStorage)
         */
        set(key, data) {
            if (!CONFIG.cache.enabled) return;

            const item = { data, timestamp: Date.now() };

            // Salvar na memória
            _cache.set(key, item);

            // Salvar em localStorage (async, não bloqueia)
            try {
                const serialized = JSON.stringify(item);
                // Verificar tamanho antes de salvar
                if (serialized.length < this.MAX_STORAGE) {
                    localStorage.setItem(this.PREFIX + key, serialized);
                } else {
                    // Dados muito grandes: salvar só indicadores resumidos
                    Logger.log('info', `Cache muito grande (${Math.round(serialized.length/1024)}KB) - salvando só em memória`);
                }
            } catch (e) {
                // QuotaExceeded: limpar caches antigos
                this._evictOldest();
                try {
                    localStorage.setItem(this.PREFIX + key, JSON.stringify(item));
                } catch { /* ignore */ }
            }
        },

        /**
         * Limpa todo o cache
         */
        clear() {
            _cache.clear();
            // Limpar localStorage
            Object.keys(localStorage)
                .filter(k => k.startsWith(this.PREFIX))
                .forEach(k => localStorage.removeItem(k));
            Logger.log('info', 'Cache limpo (memória + localStorage)');
        },

        /**
         * Gera chave de cache
         */
        generateKey(endpoint, params) {
            return `${endpoint}|${JSON.stringify(params)}`;
        },

        /**
         * Agenda refresh em background (stale-while-revalidate)
         */
        _pendingRefreshes: new Set(),
        _scheduleRefresh(key) {
            if (this._pendingRefreshes.has(key)) return;
            this._pendingRefreshes.add(key);

            // Dispatch evento para que o caller saiba que precisa refrescar
            setTimeout(() => {
                document.dispatchEvent(new CustomEvent('cache-stale', { detail: { key } }));
                this._pendingRefreshes.delete(key);
            }, 100);
        },

        /**
         * Evict: remove entradas mais antigas quando localStorage está cheio
         */
        _evictOldest() {
            const entries = [];
            Object.keys(localStorage)
                .filter(k => k.startsWith(this.PREFIX))
                .forEach(k => {
                    try {
                        const parsed = JSON.parse(localStorage.getItem(k));
                        entries.push({ key: k, timestamp: parsed.timestamp });
                    } catch { entries.push({ key: k, timestamp: 0 }); }
                });

            // Remover os 50% mais antigos
            entries.sort((a, b) => a.timestamp - b.timestamp);
            const toRemove = Math.ceil(entries.length / 2);
            entries.slice(0, toRemove).forEach(e => localStorage.removeItem(e.key));
            Logger.log('info', `Cache eviction: removidos ${toRemove} itens antigos`);
        },

        /**
         * Estatísticas do cache
         */
        stats() {
            const memSize = _cache.size;
            const lsKeys = Object.keys(localStorage).filter(k => k.startsWith(this.PREFIX));
            const lsSize = lsKeys.reduce((sum, k) => sum + (localStorage.getItem(k)?.length || 0), 0);
            return {
                memoryEntries: memSize,
                localStorageEntries: lsKeys.length,
                localStorageSize: `${Math.round(lsSize / 1024)}KB`,
                maxSize: `${Math.round(this.MAX_STORAGE / 1024)}KB`,
                ttl: `${this.TTL / 60000}min`,
                staleTtl: `${this.STALE_TTL / 60000}min`,
            };
        }
    };


    // ============================================
    // HTTP CLIENT com PROXY CORS
    // Problema: Proxies genéricos (allorigins) NÃO mantêm cookies/sessão
    // Solução: Usar corsproxy.io que preserva headers e permite credenciais
    //          OU usar Cloudflare Worker próprio
    // ============================================

    /**
     * Monta a URL com proxy CORS
     * corsproxy.io: NÃO usa encodeURIComponent, passa a URL direta
     */
    function buildProxiedUrl(targetUrl) {
        if (!CONFIG.corsProxy.enabled) return targetUrl;
        const provider = CONFIG.corsProxy.provider;
        const proxyBase = CONFIG.corsProxy.providers[provider];
        if (!proxyBase) return targetUrl;

        // corsproxy.io usa formato: https://corsproxy.io/?url
        // allorigins usa: https://api.allorigins.win/raw?url=encodedUrl
        if (provider === 'corsproxy') {
            return proxyBase + encodeURIComponent(targetUrl);
        }
        return proxyBase + encodeURIComponent(targetUrl);
    }

    /**
     * Detecta se está rodando em localhost (não precisa de proxy)
     */
    function isLocalhost() {
        const host = window.location.hostname;
        return host === 'localhost' || host === '127.0.0.1' || host === '';
    }

    /**
     * HTTP Request - usa Supabase Edge Function como proxy
     * A Edge Function mantém a sessão PHP server-side
     */
    async function httpRequest(method, endpoint, data = null, headers = {}) {
        const useProxy = CONFIG.corsProxy.enabled && !isLocalhost();
        const startTime = performance.now();

        // Se NÃO usa proxy (localhost), faz requisição direta
        if (!useProxy) {
            return await directRequest(method, endpoint, data, headers);
        }

        // Via proxy com sessão server-side (PHP, Vercel, Supabase ou Netlify)
        if (['supabase', 'php', 'vercel', 'netlify'].includes(CONFIG.corsProxy.provider)) {
            return await supabaseProxyRequest(method, endpoint, data);
        }

        // Via proxy genérico (fallback)
        return await genericProxyRequest(method, endpoint, data, headers);
    }

    /**
     * Requisição via proxy com sessão (PHP ou Supabase Edge Function)
     * Ambos usam o mesmo formato JSON: { action, method, endpoint, body }
     */
    async function supabaseProxyRequest(method, endpoint, data) {
        const provider = CONFIG.corsProxy.provider;
        const proxyUrl = CONFIG.corsProxy.providers[provider];
        const startTime = performance.now();

        const payload = {
            action: 'request',
            method: method,
            endpoint: endpoint,
            body: data ? (typeof data === 'string' ? data : new URLSearchParams(data).toString()) : '',
        };

        Logger.log('req', `${method} ${endpoint} [via ${provider}]`);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);

            const response = await fetch(proxyUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(provider === 'supabase' ? {
                        'apikey': CONFIG.corsProxy.supabaseAnonKey,
                        'Authorization': `Bearer ${CONFIG.corsProxy.supabaseAnonKey}`,
                    } : {}),
                },
                body: JSON.stringify(payload),
                signal: controller.signal,
            });

            clearTimeout(timeoutId);
            const elapsed = Math.round(performance.now() - startTime);

            const result = await response.json();

            // Tratar sessão expirada
            if (result.error === 'SESSION_EXPIRED' || response.status === 401) {
                Logger.log('err', `Sessão expirada - tentando re-login`);
                _isAuthenticated = false;

                // Re-login automático
                const loginOk = await login();
                if (loginOk) {
                    // Retry da requisição original
                    return await supabaseProxyRequest(method, endpoint, data);
                }
                throw new Error('SESSION_EXPIRED');
            }

            Logger.log('res', `${method} ${endpoint} [${result.status || 200}] (${elapsed}ms)`, {
                records: result.data?.recordsTotal || result.data?.dados?.length || null
            });

            return {
                ok: (result.status || 200) >= 200 && (result.status || 200) < 300,
                status: result.status || 200,
                data: result.data
            };

        } catch (error) {
            const elapsed = Math.round(performance.now() - startTime);
            if (error.name === 'AbortError') {
                Logger.log('err', `TIMEOUT ${endpoint} (${elapsed}ms) [Supabase]`);
                throw new Error('TIMEOUT');
            }
            Logger.log('err', `FALHA ${endpoint}: ${error.message} [Supabase]`);
            throw error;
        }
    }

    /**
     * Requisição direta (sem proxy - para localhost)
     */
    async function directRequest(method, endpoint, data, headers) {
        const url = CONFIG.baseUrl + endpoint;
        const startTime = performance.now();

        const defaultHeaders = {
            'X-Requested-With': 'XMLHttpRequest',
            ...headers
        };

        if (method === 'POST' && !headers['Content-Type']) {
            defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
        }

        const options = {
            method,
            headers: defaultHeaders,
            credentials: 'include',
        };

        if (data && method === 'POST') {
            options.body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
        }

        Logger.log('req', `${method} ${endpoint} [direto]`);

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
        options.signal = controller.signal;

        const response = await fetch(url, options);
        clearTimeout(timeoutId);
        const elapsed = Math.round(performance.now() - startTime);

        let responseData;
        const text = await response.text();
        try {
            const jsonStart = text.indexOf('{');
            responseData = jsonStart >= 0 ? JSON.parse(text.substring(jsonStart)) : text;
        } catch {
            responseData = text;
        }

        Logger.log('res', `${method} ${endpoint} [${response.status}] (${elapsed}ms)`);
        return { ok: response.ok, status: response.status, data: responseData };
    }

    /**
     * Requisição via proxy genérico (fallback - não mantém sessão)
     */
    async function genericProxyRequest(method, endpoint, data, headers) {
        const targetUrl = CONFIG.baseUrl + endpoint;
        const startTime = performance.now();
        const providers = CONFIG.corsProxy.fallbackOrder.filter(p => p !== 'supabase');

        for (const provider of providers) {
            try {
                const proxyBase = CONFIG.corsProxy.providers[provider];
                if (!proxyBase) continue;

                const url = proxyBase + encodeURIComponent(targetUrl);

                const defaultHeaders = {
                    'X-Requested-With': 'XMLHttpRequest',
                    ...headers
                };
                if (method === 'POST') defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
                if (_sessionCookie) defaultHeaders['Cookie'] = _sessionCookie;

                const options = { method, headers: defaultHeaders, credentials: 'omit' };
                if (data && method === 'POST') {
                    options.body = typeof data === 'string' ? data : new URLSearchParams(data).toString();
                }

                Logger.log('req', `${method} ${endpoint} [via ${provider}]`);

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
                options.signal = controller.signal;

                const response = await fetch(url, options);
                clearTimeout(timeoutId);

                const text = await response.text();
                let responseData;
                try {
                    const jsonStart = text.indexOf('{');
                    responseData = jsonStart >= 0 ? JSON.parse(text.substring(jsonStart)) : text;
                } catch {
                    responseData = text;
                }

                const elapsed = Math.round(performance.now() - startTime);
                Logger.log('res', `${method} ${endpoint} [${response.status}] (${elapsed}ms) via ${provider}`);
                return { ok: response.ok, status: response.status, data: responseData };

            } catch (error) {
                Logger.log('err', `Falha ${provider}: ${error.message}`);
                continue;
            }
        }

        throw new Error('ALL_PROXIES_FAILED');
    }


    // ============================================
    // AUTENTICAÇÃO
    // Via Supabase: chama action "login" na Edge Function
    // A sessão fica armazenada server-side na Edge Function
    // ============================================
    async function login() {
        Logger.log('info', 'Iniciando login...');

        try {
            const useProxy = CONFIG.corsProxy.enabled && !isLocalhost();

            if (useProxy && ['supabase', 'php', 'vercel', 'netlify'].includes(CONFIG.corsProxy.provider)) {
                // Login via proxy com sessão server-side
                const proxyUrl = CONFIG.corsProxy.providers[CONFIG.corsProxy.provider];

                const response = await fetch(proxyUrl, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'login',
                        login: CONFIG.credentials.login,
                        senha: CONFIG.credentials.senha,
                    }),
                });

                const result = await response.json();

                if (result.success) {
                    _isAuthenticated = true;
                    Logger.log('info', `Login via ${CONFIG.corsProxy.provider} realizado com sucesso`);
                    return true;
                }

                // Se gateway rejeitou (Supabase com problema)
                if (result.code === 'INVALID_CREDENTIALS' || result.message === 'Invalid credentials') {
                    Logger.log('err', `Gateway ${CONFIG.corsProxy.provider} rejeitou - tentando fallback...`);
                    return await loginViaFallback();
                }

                Logger.log('err', 'Login falhou via Supabase: ' + (result.error || 'desconhecido'));
                return false;

            } else {
                // Login direto (localhost) ou via proxy genérico
                // Passo 1: obter sessão
                await directRequest('GET', '/conta/login', null, {});

                // Passo 2: login
                const result = await directRequest('POST', '/conta/login', {
                    UsuariosLogin: CONFIG.credentials.login,
                    UsuariosSenha: CONFIG.credentials.senha
                }, {});

                if (result.data?.mensagem?.includes('sucesso')) {
                    _isAuthenticated = true;
                    Logger.log('info', 'Login direto realizado com sucesso');
                    return true;
                }

                Logger.log('err', 'Login direto falhou', result.data);
                return false;
            }
        } catch (error) {
            Logger.log('err', `Erro no login: ${error.message}`);
            return false;
        }
    }

    async function ensureAuthenticated() {
        if (!_isAuthenticated) {
            const success = await login();
            if (!success) throw new Error('AUTH_FAILED');
        }
    }

    /**
     * Fallback login: tenta via proxy genérico quando Supabase está indisponível
     */
    async function loginViaFallback() {
        Logger.log('info', 'Tentando login via proxy genérico (fallback)...');

        try {
            // Usar thingproxy ou corsproxy como fallback
            const proxyBase = CONFIG.corsProxy.providers.thingproxy || CONFIG.corsProxy.providers.corsproxy;
            if (!proxyBase) return false;

            const targetUrl = CONFIG.baseUrl + '/conta/login';
            const url = proxyBase + encodeURIComponent(targetUrl);

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'X-Requested-With': 'XMLHttpRequest',
                },
                body: `UsuariosLogin=${encodeURIComponent(CONFIG.credentials.login)}&UsuariosSenha=${encodeURIComponent(CONFIG.credentials.senha)}`,
            });

            const text = await response.text();
            try {
                const data = JSON.parse(text);
                if (data.mensagem && data.mensagem.includes('sucesso')) {
                    _isAuthenticated = true;
                    // Mudar provider para fallback para as próximas requests
                    CONFIG.corsProxy.provider = 'thingproxy';
                    Logger.log('info', 'Login via fallback (thingproxy) realizado com sucesso');
                    return true;
                }
            } catch {
                // Resposta não é JSON
            }

            Logger.log('err', 'Login via fallback também falhou');
            return false;
        } catch (error) {
            Logger.log('err', `Fallback login error: ${error.message}`);
            return false;
        }
    }


    // ============================================
    // DATATABLES REQUEST BUILDER
    // Conforme documentação oficial aEasy:
    // - draw, start, length (paginação)
    // - columns[0][data/name/orderable/searchable]
    // - order[0][column/dir]
    // - formPesquisa[submitFilter]=true (OBRIGATÓRIO para ativar filtros)
    // - formPesquisa[campo]=valor (filtros dinâmicos)
    // - Arrays: formPesquisa[campo][]=valor1&formPesquisa[campo][]=valor2
    // ============================================
    function buildDataTablesParams(columnName, filters = {}, start = 0, length = 500) {
        const params = new URLSearchParams();

        // DataTables base params
        params.append('draw', '1');
        params.append('start', String(start));
        params.append('length', String(length));
        params.append('columns[0][data]', columnName);
        params.append('columns[0][name]', columnName);
        params.append('columns[0][orderable]', 'true');
        params.append('columns[0][searchable]', 'false');
        params.append('order[0][column]', '0');
        params.append('order[0][dir]', 'asc');

        // OBRIGATÓRIO para ativar filtros
        params.append('formPesquisa[submitFilter]', 'true');

        // Filtros dinâmicos
        Object.entries(filters).forEach(([key, value]) => {
            if (value === null || value === undefined || value === '') return;

            if (Array.isArray(value)) {
                // Arrays: formPesquisa[VendasSituacao][]=1&formPesquisa[VendasSituacao][]=3
                value.forEach(v => {
                    params.append(`formPesquisa[${key}][]`, String(v));
                });
            } else {
                params.append(`formPesquisa[${key}]`, String(value));
            }
        });

        return params;
    }

    // Serializar URLSearchParams ou objeto para body string
    function serializeParams(params) {
        if (params instanceof URLSearchParams) {
            return params.toString();
        }
        const parts = [];
        Object.entries(params).forEach(([key, value]) => {
            if (Array.isArray(value)) {
                value.forEach(v => parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(v)}`));
            } else {
                parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
            }
        });
        return parts.join('&');
    }


    // ============================================
    // PAGINAÇÃO AUTOMÁTICA
    // Conforme doc: start=offset (0,500,1000...)
    // Resposta: { draw, recordsTotal, recordsFiltered, data:[] }
    // Loop até start >= recordsFiltered
    // ============================================
    async function fetchAllPaginated(endpoint, method, columnName, filters, maxRecords = 5000) {
        const cacheKey = Cache.generateKey(endpoint, { filters, maxRecords });
        const cached = Cache.get(cacheKey);
        if (cached) return cached;

        await ensureAuthenticated();

        let allData = [];
        let start = 0;
        const length = CONFIG.pagination.defaultLength;
        let totalRecords = 0;
        let requestCount = 0;

        do {
            requestCount++;
            const params = buildDataTablesParams(columnName, filters, start, length);
            let result;

            if (method === 'POST') {
                // POST /vendas/listagem usa body
                result = await httpRequest('POST', endpoint, params.toString());
            } else {
                // GET /consultores/listagem usa query string
                result = await httpRequest('GET', endpoint + '?' + params.toString());
            }

            if (!result.ok || !result.data || !result.data.data) {
                Logger.log('err', `Falha na paginação ${endpoint} (start=${start}, request #${requestCount})`);
                break;
            }

            totalRecords = parseInt(result.data.recordsFiltered || result.data.recordsTotal || 0);
            allData = allData.concat(result.data.data);
            start += length;

            Logger.log('info', `Paginação #${requestCount}: ${allData.length}/${totalRecords} registros de ${endpoint}`);

            // Safety: não buscar mais que maxRecords
            if (allData.length >= maxRecords) {
                Logger.log('info', `Limite de ${maxRecords} registros atingido em ${endpoint}`);
                break;
            }

        } while (start < totalRecords);

        const resultado = { data: allData, total: totalRecords, requests: requestCount };
        Cache.set(cacheKey, resultado);

        Logger.log('info', `✓ ${endpoint} completo: ${allData.length}/${totalRecords} registros em ${requestCount} requisições`, {
            total: totalRecords,
            fetched: allData.length,
            requests: requestCount
        });

        return resultado;
    }


    // ============================================
    // ENDPOINT: CONSULTORES
    // Doc: GET /consultores/listagem
    // Headers: X-Requested-With: XMLHttpRequest
    // Filtros: formPesquisa[Situacao][]=2 (Ativos)
    // TipoConsultor: 1=Consultor, 2=Vendedor, 3=Sede, 4=Indicador, 5=Regional/Gestor, 6=Gestor, 7=Interno
    // Campos chave: ConsultoresId, IndividuosNome, ConsultoresTipoConsultorEnum,
    //              ConsultoresPatrocinadorIndividuosNome (=nome do gestor vinculado)
    //              ConsultoresIndicadorIndividuosNome, GruposEmpresasNome (centro custo)
    // ============================================
    async function getConsultores(filters = {}) {
        const defaultFilters = { 'Situacao': ['2'] }; // Apenas ativos
        const mergedFilters = { ...defaultFilters, ...filters };

        return await fetchAllPaginated(
            '/consultores/listagem',
            'GET',
            'IndividuosNome',
            mergedFilters,
            10000
        );
    }

    // ============================================
    // ENDPOINT: VENDAS/ASSOCIADOS (Principal)
    // Doc: POST /vendas/listagem
    // Headers: Content-Type: application/x-www-form-urlencoded + X-Requested-With: XMLHttpRequest
    // ~31.705 registros ativos | 225 campos por registro
    //
    // Filtros principais:
    //   formPesquisa[VendasSituacao][]=1 (1=Ativo,2=Suspenso,3=Cancelado,4=AguardandoPgto,5=Novo...)
    //   formPesquisa[TipoData]=VendasDataCadastro|VendasDataAtivacao|VendasDataCancelamento...
    //   formPesquisa[DataInicial]=YYYY-MM-DD
    //   formPesquisa[DataFinal]=YYYY-MM-DD
    //   formPesquisa[ConsultoresIndividuosId][]=UUID (filtrar por consultor)
    //   formPesquisa[ConsultoresCentroCustoId][]=ID (filtrar por sede/regional)
    //   formPesquisa[VendasCarrosCategoriasPlanosId][]=UUID (filtrar por plano)
    //   formPesquisa[campo_pesquisa]=cpf_cnpj|nome|placa|telefone
    //   formPesquisa[search]=VALOR
    //
    // Campos financeiros:
    //   VendasCarrosValorTotal (numeric string ex: "65.90")
    //   VendasCarrosValorAdesao (ex: "R$ 250,00")
    //   VendasCarrosValorFipe (ex: "R$ 15.524,00")
    //   VendasCarrosValorTotal (numeric: "65.90")
    //
    // Campos situação:
    //   VendasSituacaoEnum: "1"=Ativo, "2"=Suspenso, "3"=Cancelado
    //   VendasClassificacao: "Nova Adesão", "Renovação", "Reativação"
    // ============================================
    async function getVendas(filters = {}) {
        return await fetchAllPaginated(
            '/vendas/listagem',
            'POST',
            'ClientesIndividuosNome',
            filters,
            50000
        );
    }

    // Vendas ativas no período (TipoData=VendasDataAtivacao)
    async function getVendasAtivas(dataInicial, dataFinal, extraFilters = {}) {
        return await getVendas({
            'VendasSituacao': ['1'],
            'TipoData': 'VendasDataAtivacao',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        });
    }

    // Vendas canceladas (TipoData=VendasDataCancelamento)
    async function getVendasCanceladas(dataInicial, dataFinal, extraFilters = {}) {
        return await getVendas({
            'VendasSituacao': ['3'],
            'TipoData': 'VendasDataCancelamento',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        });
    }

    // Todos os cadastros do período (= cotações/propostas)
    async function getNovasCotacoes(dataInicial, dataFinal, extraFilters = {}) {
        return await getVendas({
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        });
    }

    // Busca por CPF (campo_pesquisa + search conforme doc)
    async function buscarPorCPF(cpf) {
        return await getVendas({
            'campo_pesquisa': 'cpf_cnpj',
            'search': cpf.replace(/\D/g, '')
        });
    }

    // Busca por Placa
    async function buscarPorPlaca(placa) {
        return await getVendas({
            'campo_pesquisa': 'placa',
            'search': placa.toUpperCase()
        });
    }


    // ============================================
    // ENDPOINT: FLUXO DE CAIXA
    // Doc: POST /fluxo-caixa/buscar-pagina
    // Headers: Content-Type: application/x-www-form-urlencoded + X-Requested-With: XMLHttpRequest
    // Params: page, length, DataInicial (OBRIG), DataFinal (OBRIG), TipoData
    //
    // TipoData: FaturasDataVencimento|FaturasDataOriginal|FaturasDataCredito|FaturasDataPagamento|VendasDataAtivacao
    // OrdenarPor: IndividuosNome|FaturasDataPagamento|FaturasDataVencimento|FaturasDataOriginal
    // FaturasTipo: 1=Adesão,2=Contribuição,3=Avulsa,4=Rastreador,5=AdesãoConsultor,6=CotaParticipação,7=Cobrança,8=Reativação,9=Cancelamento,10=TaxaInstalação
    // FormaCobranca: 1=Boleto, 2=Cartão
    //
    // Resposta: { code:200, dados:[...], totais:{ValorTotal,ValorPago,ValorAberto,Quantidade,QuantidadePago,...}, paginacao:null }
    // Cada fatura: FaturasId, FaturasDataVencimento, FaturasValor, FaturasValorPago, Situacao, TipoFatura, IndividuosNome, VendasPlaca, VendasConsultoresNome, CentroCusto
    // ============================================
    async function getFluxoCaixa(dataInicial, dataFinal, filters = {}) {
        const cacheKey = Cache.generateKey('/fluxo-caixa', { dataInicial, dataFinal, filters });
        const cached = Cache.get(cacheKey);
        if (cached) return cached;

        await ensureAuthenticated();

        const params = new URLSearchParams();
        params.append('page', '1');
        params.append('length', '500');
        params.append('DataInicial', dataInicial);
        params.append('DataFinal', dataFinal);
        params.append('TipoData', filters.TipoData || 'FaturasDataVencimento');

        // Filtros opcionais
        if (filters.FaturasTipo) params.append('FaturasTipo', filters.FaturasTipo);
        if (filters.FormaCobranca) params.append('FormaCobranca', filters.FormaCobranca);
        if (filters.Nome) params.append('Nome', filters.Nome);
        if (filters.Placa) params.append('Placa', filters.Placa);
        if (filters.VendasConsultoresId) params.append('VendasConsultoresId', filters.VendasConsultoresId);
        if (filters.VendasSituacao) {
            filters.VendasSituacao.forEach(s => params.append('VendasSituacao[]', s));
        }
        if (filters.VendasCentroCustoId) {
            filters.VendasCentroCustoId.forEach(s => params.append('VendasCentroCustoId[]', s));
        }
        if (filters.PagamentoEmAberto) params.append('PagamentoEmAberto', '1');
        if (filters.PagamentoRealizados) params.append('PagamentoRealizados', '1');

        const result = await httpRequest('POST', '/fluxo-caixa/buscar-pagina', params.toString());

        if (result.ok && result.data && result.data.code === 200) {
            Cache.set(cacheKey, result.data);
            return result.data;
        }

        Logger.log('err', 'Falha ao buscar fluxo de caixa', result.data);
        return null;
    }


    // ============================================
    // HIERARQUIA GESTOR/VENDEDOR
    // ============================================

    /**
     * Mapeia a hierarquia de consultores.
     * Retorna: { gestorId: { gestor: {...}, equipe: [{...}] } }
     * 
     * No aEasy, o campo ConsultoresPatrocinadorIndividuosNome indica o gestor.
     * TipoConsultor: 5=Regional/Gestor, 6=Gestor, 1=Consultor, 2=Vendedor
     */
    async function buildHierarquia() {
        const cacheKey = 'hierarquia_completa';
        const cached = Cache.get(cacheKey);
        if (cached) return cached;

        Logger.log('info', 'Construindo hierarquia Gestor/Vendedor...');

        const { data: consultores } = await getConsultores();
        const hierarquia = {};

        // Separar gestores e vendedores
        const gestores = consultores.filter(c => 
            ['5', '6'].includes(String(c.ConsultoresTipoConsultorEnum))
        );
        const vendedores = consultores.filter(c =>
            ['1', '2', '4'].includes(String(c.ConsultoresTipoConsultorEnum))
        );

        // Criar mapa de gestores
        gestores.forEach(g => {
            hierarquia[g.ConsultoresId] = {
                gestor: {
                    id: g.ConsultoresId,
                    nome: g.IndividuosNome,
                    documento: g.IndividuosDocumento,
                    email: g.IndividuosEmail,
                    telefone: g.IndividuosContatosTelefone,
                    ddd: g.IndividuosContatosDdd,
                    tipo: g.ConsultoresTipoConsultor,
                    tipoEnum: g.ConsultoresTipoConsultorEnum,
                    centroCusto: g.GruposEmpresasNome,
                    nivel: g.ConsultoresNiveisNome,
                },
                equipe: []
            };
        });

        // Vincular vendedores aos gestores (via PatrocinadorId ou CentroCusto)
        vendedores.forEach(v => {
            // Buscar gestor pelo PatrocinadorIndividuosNome
            const gestorNome = v.ConsultoresPatrocinadorIndividuosNome;
            const gestorMatch = gestores.find(g => g.IndividuosNome === gestorNome);

            if (gestorMatch && hierarquia[gestorMatch.ConsultoresId]) {
                hierarquia[gestorMatch.ConsultoresId].equipe.push({
                    id: v.ConsultoresId,
                    nome: v.IndividuosNome,
                    documento: v.IndividuosDocumento,
                    email: v.IndividuosEmail,
                    telefone: v.IndividuosContatosTelefone,
                    ddd: v.IndividuosContatosDdd,
                    tipo: v.ConsultoresTipoConsultor,
                    tipoEnum: v.ConsultoresTipoConsultorEnum,
                    centroCusto: v.GruposEmpresasNome,
                    nivel: v.ConsultoresNiveisNome,
                    gestorId: gestorMatch.ConsultoresId,
                });
            }
        });

        const totalGestores = Object.keys(hierarquia).length;
        const totalVinculados = Object.values(hierarquia).reduce((sum, h) => sum + h.equipe.length, 0);

        Logger.log('info', `Hierarquia construída: ${totalGestores} gestores, ${totalVinculados} vendedores vinculados`, {
            gestores: totalGestores,
            vendedoresVinculados: totalVinculados,
            vendedoresSemGestor: vendedores.length - totalVinculados
        });

        Cache.set(cacheKey, hierarquia);
        return hierarquia;
    }

    /**
     * Obter equipe de um gestor específico
     */
    async function getEquipeGestor(gestorId) {
        const hierarquia = await buildHierarquia();
        return hierarquia[gestorId] || null;
    }

    /**
     * Obter lista de todos os gestores
     */
    async function getListaGestores() {
        const hierarquia = await buildHierarquia();
        return Object.values(hierarquia).map(h => ({
            ...h.gestor,
            qtdEquipe: h.equipe.length
        }));
    }


    // ============================================
    // CONSOLIDAÇÃO DE INDICADORES POR EQUIPE
    // ============================================

    /**
     * Calcula indicadores comerciais para um gestor e sua equipe.
     * 
     * @param {string} gestorId - ID do gestor
     * @param {string} dataInicial - YYYY-MM-DD
     * @param {string} dataFinal - YYYY-MM-DD
     * @param {object} extraFilters - Filtros adicionais
     * @returns {object} Indicadores consolidados
     */
    async function calcularIndicadores(gestorId, dataInicial, dataFinal, extraFilters = {}) {
        Logger.log('info', `Calculando indicadores para gestor ${gestorId} (${dataInicial} a ${dataFinal})`);

        // 1. Buscar equipe do gestor
        const equipeData = await getEquipeGestor(gestorId);
        if (!equipeData) {
            Logger.log('err', `Gestor ${gestorId} não encontrado na hierarquia`);
            return null;
        }

        // IDs: gestor + equipe
        const idsEquipe = [gestorId, ...equipeData.equipe.map(v => v.id)];

        Logger.log('info', `Equipe: ${idsEquipe.length} membros (1 gestor + ${equipeData.equipe.length} vendedores)`);

        // 2. Buscar todos os cadastros/cotações do período
        // NOTA: O aEasy não suporta arrays grandes em ConsultoresIndividuosId
        // Estratégia: buscar sem filtro de consultor e filtrar client-side
        const filters = {
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        };

        // Se há filtro de regional/centro de custo, usar para reduzir volume
        if (equipeData.gestor.centroCusto) {
            // Não adicionar ConsultoresIndividuosId - filtrar client-side
        }

        const { data: allRegistros } = await getVendas(filters);

        // 3. Filtrar client-side: apenas registros dos membros da equipe
        const todosRegistros = allRegistros.filter(r => idsEquipe.includes(r.VendasConsultoresId));

        Logger.log('info', `Filtro equipe: ${todosRegistros.length} de ${allRegistros.length} registros pertencem à equipe de ${idsEquipe.length} membros`);

        // 3. Separar por situação
        const cotacoes = todosRegistros; // Todos os cadastros = cotações
        const vendas = todosRegistros.filter(r => r.VendasSituacaoEnum === '1'); // Ativos
        const cancelados = todosRegistros.filter(r => r.VendasSituacaoEnum === '3');
        const suspensos = todosRegistros.filter(r => r.VendasSituacaoEnum === '2');
        const aguardando = todosRegistros.filter(r => 
            ['4', '5', '6', '7', '9', '10', '11'].includes(r.VendasSituacaoEnum)
        );

        // Perdidas = cancelados + suspensos (que não foram reativados)
        const perdidas = [...cancelados, ...suspensos];

        // 4. Calcular valores financeiros
        const valorTotalVendido = vendas.reduce((sum, v) => {
            const valor = parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.'));
            return sum + valor;
        }, 0);

        const valorTotalPerdido = perdidas.reduce((sum, v) => {
            const valor = parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.'));
            return sum + valor;
        }, 0);

        // 5. Calcular indicadores
        const totalCotacoes = cotacoes.length;
        const totalVendas = vendas.length;
        const totalCanceladas = cancelados.length;
        const totalPerdidas = perdidas.length;
        const taxaConversao = totalCotacoes > 0 ? (totalVendas / totalCotacoes) * 100 : 0;
        const ticketMedio = totalVendas > 0 ? valorTotalVendido / totalVendas : 0;

        // 6. Ranking por vendedor
        const rankingMap = {};
        idsEquipe.forEach(id => {
            rankingMap[id] = { id, vendas: 0, valor: 0, cotacoes: 0, nome: '' };
        });

        // Nome do gestor
        rankingMap[gestorId].nome = equipeData.gestor.nome;
        equipeData.equipe.forEach(v => {
            if (rankingMap[v.id]) rankingMap[v.id].nome = v.nome;
        });

        // Contabilizar
        todosRegistros.forEach(r => {
            const consultorId = r.VendasConsultoresId;
            if (rankingMap[consultorId]) {
                rankingMap[consultorId].cotacoes++;
                if (r.VendasSituacaoEnum === '1') {
                    rankingMap[consultorId].vendas++;
                    const valor = parseFloat(String(r.VendasCarrosValorTotal || '0').replace(',', '.'));
                    rankingMap[consultorId].valor += valor;
                }
            }
        });

        const ranking = Object.values(rankingMap)
            .filter(r => r.nome)
            .sort((a, b) => b.valor - a.valor)
            .map((r, i) => ({
                ...r,
                posicao: i + 1,
                conversao: r.cotacoes > 0 ? ((r.vendas / r.cotacoes) * 100).toFixed(1) : '0.0'
            }));

        // 7. Evolução mensal (agrupar por mês)
        const evolucaoMensal = calcularEvolucaoMensal(todosRegistros);

        const resultado = {
            periodo: { dataInicial, dataFinal },
            gestor: equipeData.gestor,
            equipe: equipeData.equipe,
            indicadores: {
                cotacoes: totalCotacoes,
                vendas: totalVendas,
                canceladas: totalCanceladas,
                perdidas: totalPerdidas,
                aguardando: aguardando.length,
                taxaConversao: taxaConversao.toFixed(1),
                valorTotalVendido,
                valorTotalPerdido,
                ticketMedio,
                percentualCanceladas: totalCotacoes > 0 ? ((totalCanceladas / totalCotacoes) * 100).toFixed(1) : '0.0',
                percentualPerdidas: totalCotacoes > 0 ? ((totalPerdidas / totalCotacoes) * 100).toFixed(1) : '0.0',
            },
            ranking,
            evolucaoMensal,
            _meta: {
                registrosProcessados: todosRegistros.length,
                membrosEquipe: idsEquipe.length,
                criterioAgrupamento: 'VendasConsultoresId',
                dataProcessamento: new Date().toISOString(),
            }
        };

        Logger.log('info', 'Indicadores calculados com sucesso', {
            cotacoes: totalCotacoes,
            vendas: totalVendas,
            canceladas: totalCanceladas,
            conversao: taxaConversao.toFixed(1) + '%',
            ticketMedio: ticketMedio.toFixed(2),
            registrosProcessados: todosRegistros.length,
        });

        return resultado;
    }


    // ============================================
    // EVOLUÇÃO MENSAL
    // ============================================
    function calcularEvolucaoMensal(registros) {
        const meses = {};

        registros.forEach(r => {
            // Usar data de cadastro para evolução
            const dataCadastro = r.VendasDataCadastro;
            if (!dataCadastro || dataCadastro === '-') return;

            // Formato: "DD/MM/YYYY HH:MM:SS"
            const parts = dataCadastro.split(' ')[0].split('/');
            if (parts.length < 3) return;

            const mesAno = `${parts[1]}/${parts[2]}`; // MM/YYYY

            if (!meses[mesAno]) {
                meses[mesAno] = { mes: mesAno, cotacoes: 0, vendas: 0, cancelamentos: 0, perdidas: 0 };
            }

            meses[mesAno].cotacoes++;

            if (r.VendasSituacaoEnum === '1') meses[mesAno].vendas++;
            else if (r.VendasSituacaoEnum === '3') meses[mesAno].cancelamentos++;
            else if (r.VendasSituacaoEnum === '2') meses[mesAno].perdidas++;
        });

        // Ordenar por mês
        return Object.values(meses).sort((a, b) => {
            const [ma, ya] = a.mes.split('/');
            const [mb, yb] = b.mes.split('/');
            return (parseInt(ya) * 12 + parseInt(ma)) - (parseInt(yb) * 12 + parseInt(mb));
        });
    }


    // ============================================
    // INDICADORES PARA VENDEDOR INDIVIDUAL
    // ============================================
    async function calcularIndicadoresVendedor(vendedorId, dataInicial, dataFinal, extraFilters = {}) {
        Logger.log('info', `Calculando indicadores individuais para vendedor ${vendedorId}`);

        const filters = {
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            'ConsultoresIndividuosId': [vendedorId],
            ...extraFilters
        };

        const { data: registros } = await getVendas(filters);

        const vendas = registros.filter(r => r.VendasSituacaoEnum === '1');
        const cancelados = registros.filter(r => r.VendasSituacaoEnum === '3');
        const perdidas = registros.filter(r => ['2', '3'].includes(r.VendasSituacaoEnum));

        const valorVendido = vendas.reduce((sum, v) => {
            return sum + parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.'));
        }, 0);

        return {
            cotacoes: registros.length,
            vendas: vendas.length,
            canceladas: cancelados.length,
            perdidas: perdidas.length,
            taxaConversao: registros.length > 0 ? ((vendas.length / registros.length) * 100).toFixed(1) : '0.0',
            valorTotalVendido: valorVendido,
            ticketMedio: vendas.length > 0 ? valorVendido / vendas.length : 0,
        };
    }


    // ============================================
    // API PÚBLICA (exposição do módulo)
    // ============================================
    return {
        // Configuração
        CONFIG,

        // Autenticação
        login,
        ensureAuthenticated,
        isAuthenticated: () => _isAuthenticated,

        // Endpoints diretos (conforme doc aEasy)
        getConsultores,          // GET /consultores/listagem
        getVendas,               // POST /vendas/listagem
        getVendasAtivas,         // POST /vendas/listagem (situacao=1, data ativação)
        getVendasCanceladas,     // POST /vendas/listagem (situacao=3, data cancelamento)
        getNovasCotacoes,        // POST /vendas/listagem (data cadastro = cotações)
        getFluxoCaixa,           // POST /fluxo-caixa/buscar-pagina
        buscarPorCPF,            // POST /vendas/listagem (campo_pesquisa=cpf_cnpj)
        buscarPorPlaca,          // POST /vendas/listagem (campo_pesquisa=placa)

        // Hierarquia Gestor/Vendedor
        buildHierarquia,
        getEquipeGestor,
        getListaGestores,

        // Indicadores consolidados
        calcularIndicadores,
        calcularIndicadoresVendedor,

        // Cache
        clearCache: () => Cache.clear(),
        cacheStats: () => Cache.stats(),

        // Logger
        getLogs: () => Logger.getLogs(),
        clearLogs: () => Logger.clear(),

        // Utilitários
        calcularEvolucaoMensal,
    };

})();

// Exportar globalmente
window.AeasyService = AeasyService;
