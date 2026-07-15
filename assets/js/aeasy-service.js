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
            login: '03268401503',
            senha: 'Ale@2026'
        },
        cache: {
            enabled: true,
            ttl: 5 * 60 * 1000, // 5 minutos
        },
        pagination: {
            defaultLength: 100,
            maxLength: 500,
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
    // CACHE
    // ============================================
    const Cache = {
        get(key) {
            if (!CONFIG.cache.enabled) return null;
            const item = _cache.get(key);
            if (!item) return null;
            if (Date.now() - item.timestamp > CONFIG.cache.ttl) {
                _cache.delete(key);
                return null;
            }
            Logger.log('info', `Cache HIT: ${key}`);
            return item.data;
        },

        set(key, data) {
            if (!CONFIG.cache.enabled) return;
            _cache.set(key, { data, timestamp: Date.now() });
        },

        clear() {
            _cache.clear();
            Logger.log('info', 'Cache limpo');
        },

        generateKey(endpoint, params) {
            return `${endpoint}|${JSON.stringify(params)}`;
        }
    };


    // ============================================
    // HTTP CLIENT (usa proxy CORS ou direto)
    // ============================================
    async function httpRequest(method, endpoint, data = null, headers = {}) {
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
            if (typeof data === 'string') {
                options.body = data;
            } else {
                options.body = new URLSearchParams(data).toString();
            }
        }

        Logger.log('req', `${method} ${endpoint}`, {
            params: data ? (typeof data === 'string' ? data.substring(0, 200) : data) : null
        });

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.timeout);
            options.signal = controller.signal;

            const response = await fetch(url, options);
            clearTimeout(timeoutId);

            const elapsed = Math.round(performance.now() - startTime);

            if (response.redirected || response.status === 302) {
                Logger.log('err', `Sessão expirada (redirect) - ${endpoint}`, { status: response.status });
                _isAuthenticated = false;
                throw new Error('SESSION_EXPIRED');
            }

            const contentType = response.headers.get('content-type') || '';
            let responseData;

            if (contentType.includes('application/json')) {
                responseData = await response.json();
            } else {
                const text = await response.text();
                // Tentar parsear JSON mesmo se content-type não for json
                try {
                    // Remover PHP warnings antes do JSON
                    const jsonStart = text.indexOf('{');
                    if (jsonStart >= 0) {
                        responseData = JSON.parse(text.substring(jsonStart));
                    } else {
                        responseData = text;
                    }
                } catch {
                    responseData = text;
                }
            }

            Logger.log('res', `${method} ${endpoint} [${response.status}] (${elapsed}ms)`, {
                records: responseData?.recordsTotal || responseData?.dados?.length || null,
                size: JSON.stringify(responseData).length
            });

            return { ok: response.ok, status: response.status, data: responseData };
        } catch (error) {
            const elapsed = Math.round(performance.now() - startTime);
            if (error.name === 'AbortError') {
                Logger.log('err', `TIMEOUT ${method} ${endpoint} (${elapsed}ms)`);
                throw new Error('TIMEOUT');
            }
            Logger.log('err', `FALHA ${method} ${endpoint}: ${error.message}`, { elapsed });
            throw error;
        }
    }


    // ============================================
    // AUTENTICAÇÃO
    // ============================================
    async function login() {
        Logger.log('info', 'Iniciando login...');

        try {
            const result = await httpRequest('POST', '/conta/login', {
                UsuariosLogin: CONFIG.credentials.login,
                UsuariosSenha: CONFIG.credentials.senha
            });

            if (result.data && result.data.mensagem && result.data.mensagem.includes('sucesso')) {
                _isAuthenticated = true;
                Logger.log('info', 'Login realizado com sucesso');
                return true;
            }

            Logger.log('err', 'Falha no login', result.data);
            return false;
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


    // ============================================
    // DATATABLES REQUEST BUILDER
    // ============================================
    function buildDataTablesParams(columnName, filters = {}, start = 0, length = 100) {
        const params = {
            draw: '1',
            start: String(start),
            length: String(length),
            'columns[0][data]': columnName,
            'columns[0][name]': columnName,
            'columns[0][orderable]': 'true',
            'columns[0][searchable]': 'false',
            'order[0][column]': '0',
            'order[0][dir]': 'asc',
            'formPesquisa[submitFilter]': 'true',
        };

        // Aplicar filtros dinâmicos
        Object.entries(filters).forEach(([key, value]) => {
            if (value !== null && value !== undefined && value !== '') {
                if (Array.isArray(value)) {
                    value.forEach((v, i) => {
                        params[`formPesquisa[${key}][]`] = v;
                    });
                } else {
                    params[`formPesquisa[${key}]`] = value;
                }
            }
        });

        return params;
    }

    // Serializar params com arrays corretamente
    function serializeParams(params) {
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
    // PAGINAÇÃO AUTOMÁTICA (buscar todos os registros)
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

        do {
            const params = buildDataTablesParams(columnName, filters, start, length);
            let result;

            if (method === 'POST') {
                result = await httpRequest('POST', endpoint, serializeParams(params));
            } else {
                const qs = '?' + serializeParams(params);
                result = await httpRequest('GET', endpoint + qs);
            }

            if (!result.ok || !result.data || !result.data.data) {
                Logger.log('err', `Falha na paginação ${endpoint} (start=${start})`);
                break;
            }

            totalRecords = parseInt(result.data.recordsFiltered || result.data.recordsTotal || 0);
            allData = allData.concat(result.data.data);
            start += length;

            Logger.log('info', `Paginação: ${allData.length}/${totalRecords} registros de ${endpoint}`);

            // Safety: não buscar mais que maxRecords
            if (allData.length >= maxRecords) {
                Logger.log('info', `Limite de ${maxRecords} registros atingido`);
                break;
            }

        } while (start < totalRecords);

        const resultado = { data: allData, total: totalRecords };
        Cache.set(cacheKey, resultado);

        Logger.log('info', `Total processado: ${allData.length} registros de ${endpoint}`, {
            total: totalRecords,
            filtrado: allData.length
        });

        return resultado;
    }


    // ============================================
    // ENDPOINT: CONSULTORES (hierarquia gestor)
    // ============================================
    async function getConsultores(filters = {}) {
        const defaultFilters = { 'Situacao': ['2'] }; // Ativos
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
    // ENDPOINT: VENDAS/ASSOCIADOS
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

    // Vendas ativas no período
    async function getVendasAtivas(dataInicial, dataFinal, extraFilters = {}) {
        const filters = {
            'VendasSituacao': ['1'],
            'TipoData': 'VendasDataAtivacao',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        };
        return await getVendas(filters);
    }

    // Vendas canceladas no período
    async function getVendasCanceladas(dataInicial, dataFinal, extraFilters = {}) {
        const filters = {
            'VendasSituacao': ['3'],
            'TipoData': 'VendasDataCancelamento',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        };
        return await getVendas(filters);
    }

    // Novos cadastros (cotações que viraram venda)
    async function getNovasCotacoes(dataInicial, dataFinal, extraFilters = {}) {
        const filters = {
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ...extraFilters
        };
        return await getVendas(filters);
    }


    // ============================================
    // ENDPOINT: FLUXO DE CAIXA
    // ============================================
    async function getFluxoCaixa(dataInicial, dataFinal, filters = {}) {
        const cacheKey = Cache.generateKey('/fluxo-caixa', { dataInicial, dataFinal, filters });
        const cached = Cache.get(cacheKey);
        if (cached) return cached;

        await ensureAuthenticated();

        const params = {
            page: '1',
            length: '500',
            DataInicial: dataInicial,
            DataFinal: dataFinal,
            TipoData: filters.TipoData || 'FaturasDataVencimento',
            ...filters
        };

        const result = await httpRequest('POST', '/fluxo-caixa/buscar-pagina', params);

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

        // 2. Buscar todos os cadastros/cotações do período (por consultor)
        const filters = {
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            'ConsultoresIndividuosId': idsEquipe,
            ...extraFilters
        };

        const { data: todosRegistros } = await getVendas(filters);

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
            const valor = parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.'));
            return sum + valor;
        }, 0);

        const valorTotalPerdido = perdidas.reduce((sum, v) => {
            const valor = parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.'));
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
                    const valor = parseFloat(String(r.VendasCarrosValorMensal || '0').replace(',', '.'));
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
            return sum + parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.'));
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

        // Endpoints diretos
        getConsultores,
        getVendas,
        getVendasAtivas,
        getVendasCanceladas,
        getNovasCotacoes,
        getFluxoCaixa,

        // Hierarquia
        buildHierarquia,
        getEquipeGestor,
        getListaGestores,

        // Indicadores
        calcularIndicadores,
        calcularIndicadoresVendedor,

        // Cache
        clearCache: Cache.clear,

        // Logger
        getLogs: () => Logger.getLogs(),
        clearLogs: () => Logger.clear(),

        // Utilitários
        calcularEvolucaoMensal,
    };

})();

// Exportar globalmente
window.AeasyService = AeasyService;
