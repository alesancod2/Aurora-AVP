/**
 * Dashboard Comercial - Controller/View
 * Auto Vale Prevenções
 * 
 * Responsabilidades:
 * - Renderizar cards de indicadores
 * - Gráficos (Chart.js)
 * - Ranking
 * - Funil comercial
 * - Filtros interativos
 * - Painel de logs
 */

'use strict';

const DashboardComercial = (function () {

    let _chartEvolucao = null;
    let _chartFunil = null;
    let _currentGestorId = null;
    let _currentFilters = {};

    // ============================================
    // INICIALIZAÇÃO (Otimizada - não bloqueia UI)
    // ============================================
    async function init() {
        setupEventListeners();
        setupLogPanel();

        // Remove overlay imediatamente - mostra skeleton nos cards
        renderLoading(false);
        renderCardsSkeleton();

        try {
            // Login + gestores em paralelo
            const [loginOk] = await Promise.all([
                AeasyService.login(),
                carregarGestores().catch(() => {}) // Não bloqueia se gestores falhar
            ]);

            if (!loginOk) {
                showError('Falha na conexão com aEasy. Tentando novamente...');
                // Retry uma vez
                await AeasyService.login();
            }

            // Agora carrega o dashboard
            await carregarDashboard();
        } catch (error) {
            showError('Erro ao inicializar: ' + error.message);
            renderLoading(false);
        }
    }

    function renderCardsSkeleton() {
        // Mostra valores zerados enquanto carrega (não bloqueia)
        $('#card-cotacoes-valor').text('—');
        $('#card-vendas-valor').text('—');
        $('#card-vendas-total').text('—');
        $('#card-canceladas-valor').text('—');
        $('#card-canceladas-pct').text('—');
        $('#card-perdidas-valor').text('—');
        $('#card-perdidas-pct').text('—');
        $('#card-conversao-valor').text('—');
        $('#card-ticket-valor').text('—');
        $('#ultima-atualizacao').text('Carregando...');
    }


    // ============================================
    // EVENT LISTENERS
    // ============================================
    function setupEventListeners() {
        // Filtro de período
        $('#btn-filtrar').on('click', () => carregarDashboard());
        $('#filtro-periodo-rapido').on('change', aplicarPeriodoRapido);

        // Filtro de gestor
        $('#filtro-gestor').on('change', function () {
            _currentGestorId = $(this).val();
            carregarDashboard();
        });

        // Filtro de vendedor
        $('#filtro-vendedor').on('change', function () {
            _currentFilters.vendedorId = $(this).val();
            carregarDashboard();
        });

        // Outros filtros
        $('#filtro-status, #filtro-produto, #filtro-unidade, #filtro-regional').on('change', function () {
            atualizarFiltros();
            carregarDashboard();
        });

        // Toggle logs
        $('#btn-toggle-logs').on('click', () => {
            $('#logs-container').slideToggle();
        });

        // Limpar cache
        $('#btn-limpar-cache').on('click', () => {
            AeasyService.clearCache();
            carregarDashboard();
        });
    }

    function aplicarPeriodoRapido() {
        const valor = $(this).val();
        const hoje = moment();
        let inicio, fim;

        switch (valor) {
            case 'hoje':
                inicio = fim = hoje.format('YYYY-MM-DD');
                break;
            case 'semana':
                inicio = hoje.startOf('isoWeek').format('YYYY-MM-DD');
                fim = moment().endOf('isoWeek').format('YYYY-MM-DD');
                break;
            case 'mes':
                inicio = hoje.startOf('month').format('YYYY-MM-DD');
                fim = moment().endOf('month').format('YYYY-MM-DD');
                break;
            case 'trimestre':
                inicio = hoje.startOf('quarter').format('YYYY-MM-DD');
                fim = moment().endOf('quarter').format('YYYY-MM-DD');
                break;
            case 'ano':
                inicio = hoje.startOf('year').format('YYYY-MM-DD');
                fim = moment().format('YYYY-MM-DD');
                break;
            default:
                return;
        }

        $('#filtro-data-inicio').val(inicio);
        $('#filtro-data-fim').val(fim);
    }

    function atualizarFiltros() {
        const status = $('#filtro-status').val();
        const produto = $('#filtro-produto').val();
        const unidade = $('#filtro-unidade').val();
        const regional = $('#filtro-regional').val();

        _currentFilters = {};
        if (status) _currentFilters['VendasSituacao'] = [status];
        if (produto) _currentFilters['ProdutosId'] = produto;
        if (unidade) _currentFilters['ConsultoresCentroCustoId'] = [unidade];
        if (regional) _currentFilters['ConsultoresCentroCustoId'] = [regional];
    }


    // ============================================
    // CARREGAR GESTORES NO SELECT
    // ============================================
    async function carregarGestores() {
        try {
            const gestores = await AeasyService.getListaGestores();
            const $select = $('#filtro-gestor');
            $select.empty().append('<option value="">Todos os Gestores</option>');

            gestores.sort((a, b) => a.nome.localeCompare(b.nome));
            gestores.forEach(g => {
                $select.append(`<option value="${g.id}">${g.nome} (${g.qtdEquipe} vendedores)</option>`);
            });

            // Se tiver gestor selecionado, carregar vendedores
            if (_currentGestorId) {
                $select.val(_currentGestorId);
                await carregarVendedoresGestor(_currentGestorId);
            }
        } catch (error) {
            console.error('Erro ao carregar gestores:', error);
        }
    }

    async function carregarVendedoresGestor(gestorId) {
        const $select = $('#filtro-vendedor');
        $select.empty().append('<option value="">Toda a Equipe</option>');

        if (!gestorId) return;

        const equipe = await AeasyService.getEquipeGestor(gestorId);
        if (equipe && equipe.equipe) {
            equipe.equipe.sort((a, b) => a.nome.localeCompare(b.nome));
            equipe.equipe.forEach(v => {
                $select.append(`<option value="${v.id}">${v.nome}</option>`);
            });
        }
    }


    // ============================================
    // CARREGAR DASHBOARD (principal)
    // ============================================
    async function carregarDashboard() {
        const dataInicial = $('#filtro-data-inicio').val() || moment().startOf('month').format('YYYY-MM-DD');
        const dataFinal = $('#filtro-data-fim').val() || moment().format('YYYY-MM-DD');
        const gestorId = _currentGestorId || $('#filtro-gestor').val();
        const vendedorId = _currentFilters.vendedorId;

        // Mostra indicador leve (não overlay bloqueante)
        $('#ultima-atualizacao').html('<i class="bi bi-arrow-repeat spin-icon"></i> Atualizando...');

        try {
            let dados;

            if (vendedorId) {
                dados = await AeasyService.calcularIndicadoresVendedor(vendedorId, dataInicial, dataFinal, _currentFilters);
                renderCardsVendedor(dados);
                $('#ranking-section').hide();
            } else if (gestorId) {
                dados = await AeasyService.calcularIndicadores(gestorId, dataInicial, dataFinal, _currentFilters);
                renderCards(dados.indicadores);
                renderRanking(dados.ranking);
                renderEvolucaoMensal(dados.evolucaoMensal);
                renderFunil(dados.indicadores);
                $('#ranking-section').show();
            } else {
                dados = await carregarVisaoGeral(dataInicial, dataFinal);
                renderCards(dados.indicadores);
                renderRanking(dados.ranking);
                renderEvolucaoMensal(dados.evolucaoMensal);
                renderFunil(dados.indicadores);
                $('#ranking-section').show();
            }

            renderUltimaAtualizacao();
        } catch (error) {
            showError('Erro ao carregar dados: ' + error.message);
            $('#ultima-atualizacao').text('Erro ao carregar');
        }
    }

    // Visão geral (todos os consultores)
    async function carregarVisaoGeral(dataInicial, dataFinal) {
        const filters = {
            'TipoData': 'VendasDataCadastro',
            'DataInicial': dataInicial,
            'DataFinal': dataFinal,
            ..._currentFilters
        };

        const { data: registros } = await AeasyService.getVendas(filters);

        const vendas = registros.filter(r => r.VendasSituacaoEnum === '1');
        const cancelados = registros.filter(r => r.VendasSituacaoEnum === '3');
        const perdidas = registros.filter(r => ['2', '3'].includes(r.VendasSituacaoEnum));

        const valorVendido = vendas.reduce((sum, v) => {
            return sum + parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.'));
        }, 0);

        const valorPerdido = perdidas.reduce((sum, v) => {
            return sum + parseFloat(String(v.VendasCarrosValorTotal || '0').replace(',', '.'));
        }, 0);

        // Ranking por consultor
        const rankingMap = {};
        registros.forEach(r => {
            const id = r.VendasConsultoresId;
            const nome = r.ConsultoresNome;
            if (!rankingMap[id]) rankingMap[id] = { id, nome, vendas: 0, valor: 0, cotacoes: 0 };
            rankingMap[id].cotacoes++;
            if (r.VendasSituacaoEnum === '1') {
                rankingMap[id].vendas++;
                rankingMap[id].valor += parseFloat(String(r.VendasCarrosValorTotal || '0').replace(',', '.'));
            }
        });

        const ranking = Object.values(rankingMap)
            .sort((a, b) => b.valor - a.valor)
            .slice(0, 10)
            .map((r, i) => ({
                ...r,
                posicao: i + 1,
                conversao: r.cotacoes > 0 ? ((r.vendas / r.cotacoes) * 100).toFixed(1) : '0.0'
            }));

        const evolucaoMensal = AeasyService.calcularEvolucaoMensal(registros);

        return {
            indicadores: {
                cotacoes: registros.length,
                vendas: vendas.length,
                canceladas: cancelados.length,
                perdidas: perdidas.length,
                taxaConversao: registros.length > 0 ? ((vendas.length / registros.length) * 100).toFixed(1) : '0.0',
                valorTotalVendido: valorVendido,
                valorTotalPerdido: valorPerdido,
                ticketMedio: vendas.length > 0 ? valorVendido / vendas.length : 0,
                percentualCanceladas: registros.length > 0 ? ((cancelados.length / registros.length) * 100).toFixed(1) : '0.0',
                percentualPerdidas: registros.length > 0 ? ((perdidas.length / registros.length) * 100).toFixed(1) : '0.0',
            },
            ranking,
            evolucaoMensal
        };
    }


    // ============================================
    // RENDER CARDS
    // ============================================
    function renderCards(ind) {
        $('#card-cotacoes-valor').text(formatNumber(ind.cotacoes));
        $('#card-vendas-valor').text(formatNumber(ind.vendas));
        $('#card-vendas-total').text(formatMoney(ind.valorTotalVendido));
        $('#card-canceladas-valor').text(formatNumber(ind.canceladas));
        $('#card-canceladas-pct').text(ind.percentualCanceladas + '%');
        $('#card-perdidas-valor').text(formatNumber(ind.perdidas));
        $('#card-perdidas-pct').text(ind.percentualPerdidas + '%');
        $('#card-conversao-valor').text(ind.taxaConversao + '%');
        $('#card-ticket-valor').text(formatMoney(ind.ticketMedio));
    }

    function renderCardsVendedor(ind) {
        renderCards(ind);
        // Ocultar ranking para vendedor individual
    }

    // ============================================
    // RENDER RANKING (com equipe expandível + gestores ocultos)
    // ============================================
    function renderRanking(ranking) {
        const $container = $('#ranking-list');
        $container.empty();

        if (!ranking || ranking.length === 0) {
            $container.html('<p class="text-muted text-center py-3">Sem dados para o período</p>');
            return;
        }

        // Filtrar gestores ocultos
        const visibleRanking = typeof GestoresOcultos !== 'undefined'
            ? GestoresOcultos.filtrar(ranking, 'id')
            : ranking;

        // Barra de ocultos
        if (typeof GestoresOcultos !== 'undefined' && GestoresOcultos.getCount() > 0) {
            $container.append(`
                <div class="ranking-hidden-bar">
                    <span><i class="bi bi-eye-slash"></i> ${GestoresOcultos.getCount()} gestor(es) oculto(s)</span>
                    <button class="btn-ranking-manage" onclick="DashboardComercial.toggleOcultosPanel()">Gerenciar</button>
                </div>
            `);
        }

        // Painel de gestores ocultos (inicialmente escondido)
        $container.append('<div id="ranking-ocultos-panel" class="ranking-ocultos-panel" style="display:none"></div>');

        visibleRanking.slice(0, 10).forEach((item, index) => {
            const posClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : 'default';
            const html = `
                <div class="ranking-item" data-gestor-id="${item.id}" data-gestor-nome="${item.nome}">
                    <div class="ranking-pos ${posClass}">${index + 1}</div>
                    <div class="ranking-info" onclick="DashboardComercial.expandEquipe('${item.id}', '${item.nome.replace(/'/g, "\\'")}')">
                        <div class="ranking-name">${item.nome} <i class="bi bi-chevron-down ranking-expand-icon"></i></div>
                        <div class="ranking-stats">
                            ${item.vendas} vendas &bull; ${item.conversao}% conversão &bull; ${item.cotacoes} cotações
                        </div>
                    </div>
                    <div class="ranking-value">${formatMoney(item.valor)}</div>
                    <button class="btn-hide-gestor" onclick="DashboardComercial.ocultarGestor('${item.id}', '${item.nome.replace(/'/g, "\\'")}')" title="Ocultar gestor">
                        <i class="bi bi-eye-slash"></i>
                    </button>
                </div>
                <div class="ranking-equipe-detail" id="equipe-${item.id}" style="display:none"></div>
            `;
            $container.append(html);
        });
    }

    // --- Expandir equipe de um gestor ---
    async function expandEquipe(gestorId, gestorNome) {
        const $detail = $(`#equipe-${gestorId}`);
        const isOpen = $detail.is(':visible');

        // Toggle: fechar se já estiver aberto
        if (isOpen) {
            $detail.slideUp(200);
            $(`.ranking-item[data-gestor-id="${gestorId}"]`).removeClass('expanded');
            return;
        }

        // Fechar outros abertos
        $('.ranking-equipe-detail').slideUp(200);
        $('.ranking-item').removeClass('expanded');

        // Marcar como aberto
        $(`.ranking-item[data-gestor-id="${gestorId}"]`).addClass('expanded');
        $detail.html('<div class="equipe-loading"><div class="spinner"></div> Carregando equipe...</div>').slideDown(200);

        try {
            const equipe = await AeasyService.getEquipeGestor(gestorId);
            if (!equipe || !equipe.equipe || equipe.equipe.length === 0) {
                $detail.html('<div class="equipe-empty">Nenhum vendedor vinculado</div>');
                return;
            }

            let html = `<div class="equipe-header-info">
                <span><i class="bi bi-people"></i> Equipe de ${gestorNome}</span>
                <span class="equipe-count">${equipe.equipe.length} vendedores</span>
            </div>`;
            html += '<div class="equipe-list">';

            equipe.equipe.sort((a, b) => a.nome.localeCompare(b.nome)).forEach((v, i) => {
                html += `<div class="equipe-member">
                    <span class="equipe-member-pos">${i + 1}</span>
                    <div class="equipe-member-info">
                        <span class="equipe-member-name">${v.nome}</span>
                        <span class="equipe-member-meta">${v.centroCusto || ''}</span>
                    </div>
                </div>`;
            });

            html += '</div>';
            $detail.html(html);
        } catch (e) {
            $detail.html(`<div class="equipe-empty">Erro ao carregar: ${e.message}</div>`);
        }
    }

    // --- Ocultar gestor ---
    function ocultarGestor(gestorId, gestorNome) {
        if (typeof GestoresOcultos !== 'undefined') {
            GestoresOcultos.ocultar(gestorId, gestorNome);
            carregarDashboard(); // Re-render
        }
    }

    // --- Toggle painel de ocultos ---
    function toggleOcultosPanel() {
        const $panel = $('#ranking-ocultos-panel');
        if ($panel.is(':visible')) {
            $panel.slideUp(200);
            return;
        }

        const ocultos = typeof GestoresOcultos !== 'undefined' ? GestoresOcultos.getOcultos() : [];
        let html = '<div class="ocultos-list">';
        ocultos.forEach(g => {
            html += `<div class="ocultos-item">
                <span>${g.gestor_nome}</span>
                <button onclick="DashboardComercial.mostrarGestor('${g.gestor_id}')" class="btn-show-gestor">
                    <i class="bi bi-eye"></i> Mostrar
                </button>
            </div>`;
        });
        html += '</div>';
        $panel.html(html).slideDown(200);
    }

    function mostrarGestor(gestorId) {
        if (typeof GestoresOcultos !== 'undefined') {
            GestoresOcultos.mostrar(gestorId);
            carregarDashboard();
        }
    }


    // ============================================
    // RENDER GRÁFICO EVOLUÇÃO MENSAL
    // ============================================
    function renderEvolucaoMensal(dados) {
        const ctx = document.getElementById('chart-evolucao');
        if (!ctx) return;

        if (_chartEvolucao) _chartEvolucao.destroy();

        const labels = dados.map(d => d.mes);
        
        _chartEvolucao = new Chart(ctx, {
            type: 'line',
            data: {
                labels,
                datasets: [
                    {
                        label: 'Cotações',
                        data: dados.map(d => d.cotacoes),
                        borderColor: '#1a73e8',
                        backgroundColor: 'rgba(26, 115, 232, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Vendas',
                        data: dados.map(d => d.vendas),
                        borderColor: '#0f7b3f',
                        backgroundColor: 'rgba(15, 123, 63, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Cancelamentos',
                        data: dados.map(d => d.cancelamentos),
                        borderColor: '#d32f2f',
                        backgroundColor: 'rgba(211, 47, 47, 0.1)',
                        fill: true,
                        tension: 0.3,
                    },
                    {
                        label: 'Perdidas',
                        data: dados.map(d => d.perdidas),
                        borderColor: '#e65100',
                        backgroundColor: 'rgba(230, 81, 0, 0.1)',
                        fill: true,
                        tension: 0.3,
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom' },
                    tooltip: { mode: 'index', intersect: false }
                },
                scales: {
                    y: { beginAtZero: true, ticks: { precision: 0 } }
                }
            }
        });
    }

    // ============================================
    // RENDER FUNIL COMERCIAL
    // ============================================
    function renderFunil(ind) {
        const total = ind.cotacoes || 1;
        
        $('#funil-cotacao').css('width', '100%').find('.funil-valor').text(ind.cotacoes);
        $('#funil-venda').css('width', Math.max(20, (ind.vendas / total * 100)) + '%')
            .find('.funil-valor').text(ind.vendas);
        $('#funil-cancelado').css('width', Math.max(15, (ind.canceladas / total * 100)) + '%')
            .find('.funil-valor').text(ind.canceladas);
        $('#funil-perdida').css('width', Math.max(10, (ind.perdidas / total * 100)) + '%')
            .find('.funil-valor').text(ind.perdidas);
    }


    // ============================================
    // PAINEL DE LOGS
    // ============================================
    function setupLogPanel() {
        document.addEventListener('aeasy-log', (e) => {
            const entry = e.detail;
            const $panel = $('#logs-panel');
            if (!$panel.length) return;

            const html = `<div class="log-entry">
                <span class="log-time">${entry.time.split('T')[1].split('.')[0]}</span>
                <span class="log-type ${entry.type}">[${entry.type.toUpperCase()}]</span>
                <span class="log-msg">${entry.message}</span>
            </div>`;

            $panel.append(html);
            $panel.scrollTop($panel[0].scrollHeight);
        });
    }

    // ============================================
    // UTILITÁRIOS UI
    // ============================================
    function renderLoading(show) {
        $('#loading-overlay').toggle(show);
    }

    function renderUltimaAtualizacao() {
        $('#ultima-atualizacao').text('Atualizado em ' + moment().format('DD/MM/YYYY HH:mm:ss'));
    }

    function showError(message) {
        const html = `<div class="alert alert-danger alert-dismissible fade show" role="alert">
            <i class="bi bi-exclamation-triangle me-2"></i>${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        </div>`;
        $('#alerts-container').append(html);
    }

    function formatNumber(n) {
        return new Intl.NumberFormat('pt-BR').format(n || 0);
    }

    function formatMoney(v) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
    }

    // ============================================
    // API PÚBLICA
    // ============================================
    return {
        init,
        carregarDashboard,
        carregarGestores,
        expandEquipe,
        ocultarGestor,
        mostrarGestor,
        toggleOcultosPanel,
    };

})();

// Inicializar quando DOM pronto
$(document).ready(() => {
    DashboardComercial.init();
});
