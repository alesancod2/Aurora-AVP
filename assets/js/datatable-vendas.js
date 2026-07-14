/**
 * Auto Vale Prevencoes - Aeasy
 * DataTable Vendas/Associados (Server-side)
 *
 * Correcoes aplicadas:
 * 1. Coluna Chassi duplicada removida
 * 2. Colunas com visibilidade controlada via API (nao display:none)
 * 3. Footer com totais calculados via callback
 * 4. CSRF token incluido nas requisicoes
 * 5. Tratamento de erro nas requisicoes
 * 6. Botao de ocultar colunas com scroll
 */

'use strict';

(function ($) {

    const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content || '';

    // Definicao das colunas
    const colunas = [
        { data: 'Associado', name: 'Associado' },
        { data: 'Situacao', name: 'Situacao' },
        { data: 'Placa', name: 'Placa' },
        { data: 'PlacaImplemento', name: 'PlacaImplemento' },
        { data: 'PlacaImplemento2', name: 'PlacaImplemento2' },
        { data: 'PlacaImplemento3', name: 'PlacaImplemento3' },
        { data: 'Chassi', name: 'Chassi' },
        { data: 'Telefone', name: 'Telefone' },
        { data: 'DataContrato', name: 'DataContrato' },
        { data: 'DataCadastro', name: 'DataCadastro' },
        { data: 'DataCancelamento', name: 'DataCancelamento' },
        { data: 'DataFidelidade', name: 'DataFidelidade' },
        { data: 'DataSuspensao', name: 'DataSuspensao' },
        { data: 'DataAtivacao', name: 'DataAtivacao' },
        { data: 'DataEmissaoCarne', name: 'DataEmissaoCarne' },
        { data: 'DataImpressaoCarne', name: 'DataImpressaoCarne' },
        { data: 'PossuiCarne', name: 'PossuiCarne' },
        { data: 'DiaVencimento', name: 'DiaVencimento' },
        { data: 'DataNascimento', name: 'DataNascimento' },
        { data: 'Sexo', name: 'Sexo' },
        { data: 'TipoSuspensao', name: 'TipoSuspensao' },
        { data: 'MotivoSituacao', name: 'MotivoSituacao' },
        { data: 'PossuiRastreador', name: 'PossuiRastreador' },
        { data: 'NumeroRastreador', name: 'NumeroRastreador' },
        { data: 'EquipObrigatorio', name: 'EquipObrigatorio' },
        { data: 'Plotagem', name: 'Plotagem' },
        { data: 'Consultor', name: 'Consultor' },
        { data: 'Indicador', name: 'Indicador' },
        { data: 'Endereco', name: 'Endereco' },
        { data: 'Bairro', name: 'Bairro' },
        { data: 'Complemento', name: 'Complemento' },
        { data: 'Estado', name: 'Estado' },
        { data: 'Cidade', name: 'Cidade' },
        { data: 'FormaEmissaoAdesao', name: 'FormaEmissaoAdesao' },
        { data: 'Planos', name: 'Planos' },

        { data: 'ValorContribuicao', name: 'ValorContribuicao', className: 'text-end' },
        { data: 'ValorFipe', name: 'ValorFipe', className: 'text-end' },
        { data: 'ValorImplementos', name: 'ValorImplementos', className: 'text-end' },
        { data: 'ValorAdesao', name: 'ValorAdesao', className: 'text-end' },
        { data: 'CategoriasCarros', name: 'CategoriasCarros' },
        { data: 'ValorImplemento1', name: 'ValorImplemento1', className: 'text-end' },
        { data: 'ValorImplemento2', name: 'ValorImplemento2', className: 'text-end' },
        { data: 'ValorImplemento3', name: 'ValorImplemento3', className: 'text-end' },
        { data: 'ValorProtegido', name: 'ValorProtegido', className: 'text-end' },
        { data: 'Desconto', name: 'Desconto' },
        { data: 'Modelo', name: 'Modelo' },
        { data: 'PossuiEventoAberto', name: 'PossuiEventoAberto' },
        { data: 'DiasAtraso', name: 'DiasAtraso' },
        { data: 'QtdeFaturasPagas', name: 'QtdeFaturasPagas' },
        { data: 'FormaPagamento', name: 'FormaPagamento' },
        { data: 'Classificacao', name: 'Classificacao' },
        { data: 'OrigemMigracao', name: 'OrigemMigracao' },
        { data: 'Colaboradores', name: 'Colaboradores' },
        { data: 'AssociacaoOrigem', name: 'AssociacaoOrigem' },
        { data: 'CentroCusto', name: 'CentroCusto' },
        { data: 'AuxProfissional', name: 'AuxProfissional' },
        { data: 'ResponsavelAtivacao', name: 'ResponsavelAtivacao' },
        { data: 'Produto', name: 'Produto' },
        { data: 'ContabilizaParaMeta', name: 'ContabilizaParaMeta' },
        { data: 'ChassiRemarcado', name: 'ChassiRemarcado' },
        { data: 'Leilao', name: 'Leilao' },
        { data: 'MediaMonta', name: 'MediaMonta' },
        { data: 'MotivoDepreciacao', name: 'MotivoDepreciacao' },
        {
            data: 'Acoes',
            name: 'Acoes',
            orderable: false,
            searchable: false,
            className: 'text-center'
        }
    ];


    // Colunas visiveis por padrao (as demais ficam ocultas)
    const colunasVisiveis = [
        'Associado', 'Situacao', 'Placa', 'Telefone',
        'DataContrato', 'DataCadastro', 'DiaVencimento',
        'Consultor', 'Planos', 'ValorContribuicao',
        'ValorFipe', 'FormaPagamento', 'Acoes'
    ];

    // Indices das colunas ocultas por padrao
    const colunasOcultas = colunas
        .map((col, idx) => ({ name: col.data, idx }))
        .filter(c => !colunasVisiveis.includes(c.name))
        .map(c => c.idx);

    // Inicializar DataTable
    function initDataTableVendas() {
        const $table = $('#table-vendas');
        if (!$table.length) return;

        const table = $table.DataTable({
            processing: true,
            serverSide: true,
            ajax: {
                url: '/vendas/datatable',
                type: 'POST',
                headers: {
                    'X-CSRF-TOKEN': csrfToken
                },
                data(d) {
                    // Incluir filtros do formulario avancado
                    const formData = $('#form-more-filter').serializeArray();
                    formData.forEach(item => {
                        d[item.name] = item.value;
                    });

                    // Incluir pesquisa simples
                    const search = $('#search').val();
                    if (search) {
                        d.search_simple = search;
                    }
                },
                error(xhr, error, thrown) {
                    console.error('Erro ao carregar dados:', error, thrown);
                    hideLoading();

                    if (xhr.status === 401) {
                        window.location.href = '/conta/login?expired=1';
                    }
                }
            },
            columns: colunas,
            columnDefs: [
                {
                    targets: colunasOcultas,
                    visible: false
                },
                // Renderizar valores monetarios
                {
                    targets: [35, 36, 37, 38, 40, 41, 42, 43],
                    render(data) {
                        if (data === null || data === undefined) return '-';
                        return formatMoney(parseFloat(data));
                    }
                },
                // Renderizar situacao com badge
                {
                    targets: 1,
                    render(data) {
                        const cores = {
                            'Ativo': 'success',
                            'Cancelado': 'danger',
                            'Suspenso': 'warning',
                            'Novo': 'info',
                            'Migrado': 'secondary'
                        };
                        const cor = cores[data] || 'secondary';
                        return `<span class="badge bg-${cor}">${data || '-'}</span>`;
                    }
                }
            ],


            order: [[0, 'asc']],
            pageLength: 25,
            lengthMenu: [[10, 25, 50, 100], [10, 25, 50, 100]],
            language: {
                url: 'https://cdn.datatables.net/plug-ins/1.13.7/i18n/pt-BR.json'
            },
            dom: '<"d-flex justify-content-between align-items-center mb-2"<"d-flex gap-2"lB>f>rtip',
            buttons: [
                {
                    extend: 'colvis',
                    text: '<i class="bi bi-eye-slash"></i> Colunas',
                    className: 'btn btn-sm btn-outline-secondary',
                    collectionLayout: 'btn-ocultar-columns'
                },
                {
                    extend: 'excel',
                    text: '<i class="bi bi-file-earmark-excel"></i> Excel',
                    className: 'btn btn-sm btn-outline-success',
                    exportOptions: {
                        columns: ':visible'
                    }
                },
                {
                    extend: 'pdf',
                    text: '<i class="bi bi-file-earmark-pdf"></i> PDF',
                    className: 'btn btn-sm btn-outline-danger',
                    exportOptions: {
                        columns: ':visible'
                    }
                }
            ],

            // Footer com totais
            footerCallback(row, data, start, end, display) {
                const api = this.api();

                // Indices das colunas monetarias
                const colsMoney = [35, 36, 37, 38, 40, 41, 42, 43];
                const footerIds = [
                    'total-contribuicao', 'total-fipe',
                    'total-implementos', 'total-adesao',
                    'total-impl1', 'total-impl2',
                    'total-impl3', 'total-protegido'
                ];

                colsMoney.forEach((colIdx, i) => {
                    const total = api
                        .column(colIdx, { page: 'current' })
                        .data()
                        .reduce((a, b) => a + (parseFloat(b) || 0), 0);

                    const el = document.getElementById(footerIds[i]);
                    if (el) {
                        el.textContent = formatMoney(total);
                    }
                });
            },

            // Callbacks
            initComplete() {
                // Restaurar colunas salvas pelo usuario
                const savedCols = localStorage.getItem('dt_vendas_cols');
                if (savedCols) {
                    try {
                        const visibles = JSON.parse(savedCols);
                        table.columns().every(function (idx) {
                            this.visible(visibles.includes(idx));
                        });
                    } catch (e) {
                        // Ignorar erro de parse
                    }
                }
            },

            drawCallback() {
                // Inicializar tooltips nas linhas
                $('[data-bs-toggle="tooltip"]').tooltip();
            }
        });


        // Salvar preferencia de colunas visiveis
        table.on('column-visibility.dt', function () {
            const visibles = [];
            table.columns().every(function (idx) {
                if (this.visible()) visibles.push(idx);
            });
            localStorage.setItem('dt_vendas_cols', JSON.stringify(visibles));
        });

        // Pesquisa simples (form GET)
        $('#form-simple-filter').on('submit', function (e) {
            e.preventDefault();
            table.ajax.reload();
        });

        // Pesquisa avancada (form POST)
        $('#form-more-filter').on('submit', function (e) {
            e.preventDefault();
            table.ajax.reload();
        });

        // Acoes na tabela (delegacao de eventos)
        $table.on('click', '.btn-enviar-contrato', function () {
            const data = table.row($(this).closest('tr')).data();
            if (!data) return;

            $('#modal-VendasId').val(data.VendasId);
            $('#modal-VendasCarrosId').val(data.VendasCarrosId);
            $('#modal-Cliente').val(data.Associado);
            $('#modal-Placa').val(data.Placa);
            $('#modal-Ddd').val(data.Ddd || '');
            $('#modal-Telefone').val(data.Telefone);
            $('#modal-Modelo').val(data.Modelo);

            bootstrap.Modal.getOrCreateInstance(
                document.getElementById('modal-envio-dados-integracao')
            ).show();
        });

        $table.on('click', '.btn-remover', function () {
            const data = table.row($(this).closest('tr')).data();
            if (!data) return;

            $('#modal-remover-cadastro').text(data.Associado);

            const modal = bootstrap.Modal.getOrCreateInstance(
                document.getElementById('modal-remover')
            );
            modal.show();

            // Configurar botao de confirmacao
            $('#confirmar-remover-cadastro').off('click').on('click', function () {
                $.ajax({
                    url: '/vendas/remover',
                    method: 'POST',
                    headers: { 'X-CSRF-TOKEN': csrfToken },
                    data: { VendasId: data.VendasId },
                    success() {
                        modal.hide();
                        table.ajax.reload();
                    },
                    error(xhr) {
                        alert('Erro ao remover: ' + (xhr.responseJSON?.message || 'Erro desconhecido'));
                    }
                });
            });
        });

        return table;
    }

    // Inicializar quando DOM estiver pronto
    $(document).ready(function () {
        initDataTableVendas();
    });

})(jQuery);
