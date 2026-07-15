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
    // INICIALIZAÇÃO
    // ============================================
    async function init() {
        renderLoading(true);
        setupEventListeners();
        setupLogPanel();

        try {
            await AeasyService.login();
            await carregarGestores();
            await carregarDashboard();
        } catch (error) {
            showError('Erro ao inicializar dashboard: ' + error.message);
        } finally {
            renderLoading(false);
        }
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

        renderLoading(true);

        try {
            let dados;

            if (vendedorId) {
                // Modo vendedor individual
                dados = await AeasyService.calcularIndicadoresVendedor(vendedorId, dataInicial, dataFinal, _currentFilters);
                renderCardsVendedor(dados);
                $('#ranking-section').hide();
            } else if (gestorId) {
                // Modo gestor + equipe
                dados = await AeasyService.calcularIndicadores(gestorId, dataInicial, dataFinal, _currentFilters);
                renderCards(dados.indicadores);
                renderRanking(dados.ranking);
                renderEvolucaoMensal(dados.evolucaoMensal);
                renderFunil(dados.indicadores);
                $('#ranking-section').show();
            } else {
                // Sem gestor selecionado: pegar visão geral
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
        } finally {
            renderLoading(false);
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
            return sum + parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.'));
        }, 0);

        const valorPerdido = perdidas.reduce((sum, v) => {
            return sum + parseFloat(String(v.VendasCarrosValorMensal || '0').replace(',', '.'));
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
                rankingMap[id].valor += parseFloat(String(r.VendasCarrosValorMensal || '0').replace(',', '.'));
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
    // RENDER RANKING
    // ============================================
    function renderRanking(ranking) {
        const $container = $('#ranking-list');
        $container.empty();

        if (!ranking || ranking.length === 0) {
            $container.html('<p class="text-muted text-center py-3">Sem dados para o período</p>');
            return;
        }

        ranking.slice(0, 10).forEach((item, index) => {
            const posClass = index < 3 ? `pos-${index + 1}` : 'pos-other';
            const html = `
                <div class="ranking-item">
                    <div class="ranking-position ${posClass}">${index + 1}</div>
                    <div class="ranking-info">
                        <div class="ranking-name">${item.nome}</div>
                        <div class="ranking-stats">
                            ${item.vendas} vendas &bull; ${item.conversao}% conversão
                        </div>
                    </div>
                    <div class="ranking-value">${formatMoney(item.valor)}</div>
                </div>
            `;
            $container.append(html);
        });
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
        if (show) {
            $('.dashboard-card .card-value').html('<div class="skeleton skeleton-text" style="width:60%;height:24px"></div>');
        }
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
    };

})();

// Inicializar quando DOM pronto
$(document).ready(() => {
    DashboardComercial.init();
});
