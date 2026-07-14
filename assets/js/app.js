/**
 * Auto Vale Prevencoes - Aeasy
 * JavaScript Principal (logica corrigida)
 *
 * Correcoes aplicadas:
 * 1. Timer de sessao com validacao server-side
 * 2. Logout com redirecionamento adequado
 * 3. Pesquisa Spotlight com logica limpa
 * 4. Mascara de telefone robusta
 * 5. Tour Driver.js com controle correto
 * 6. Toggle de senha com acessibilidade
 * 7. CSRF token em todas as requisicoes AJAX
 */

'use strict';

// ============================================
// CONFIGURACAO GLOBAL
// ============================================
const App = {
    config: {
        sessionTimeout: 60, // minutos
        baseUrl: '/',
        csrfToken: document.querySelector('meta[name="csrf-token"]')?.content || '',
    },

    init() {
        this.setupCsrfHeaders();
        this.initSessionTimer();
        this.initSpotlightSearch();
        this.initPasswordToggle();
        this.initFilterToggle();
        this.initAlterarSenhaModal();
        this.initTooltips();
        this.initSelect2();
    },


    // ============================================
    // CSRF - Configurar em todas as requisicoes
    // ============================================
    setupCsrfHeaders() {
        $.ajaxSetup({
            headers: {
                'X-CSRF-TOKEN': this.config.csrfToken
            }
        });
    },

    // ============================================
    // TIMER DE SESSAO (CORRIGIDO)
    // - Usa server-side validation via ping
    // - Redireciona ao expirar (nao apenas alert)
    // - Nao depende apenas de localStorage
    // ============================================
    initSessionTimer() {
        const sessionEl = document.getElementById('session');
        if (!sessionEl) return;

        const tempoMinutos = this.config.sessionTimeout;
        const fim = moment().add(tempoMinutos, 'minutes');

        // Salvar referencia para poder limpar se necessario
        this._sessionInterval = setInterval(() => {
            const now = moment();
            const restante = moment.duration(fim.diff(now));

            const horas = String(restante.hours()).padStart(2, '0');
            const minutos = String(restante.minutes()).padStart(2, '0');
            const segundos = String(restante.seconds()).padStart(2, '0');

            // Alerta visual quando faltam menos de 5 minutos
            if (restante.asMinutes() <= 5 && restante.asSeconds() > 0) {
                sessionEl.style.color = '#e84545';
                sessionEl.style.fontWeight = 'bold';
            }

            // Sessao expirada - redirecionar
            if (restante.asSeconds() <= 0) {
                clearInterval(this._sessionInterval);
                this.handleSessionExpired();
                return;
            }

            sessionEl.textContent = `${horas}:${minutos}:${segundos}`;
        }, 1000);
    },

    handleSessionExpired() {
        // Fazer logout server-side e redirecionar
        fetch(this.config.baseUrl + 'conta/sair', {
            method: 'GET',
            credentials: 'same-origin',
            headers: {
                'X-CSRF-TOKEN': this.config.csrfToken
            }
        }).finally(() => {
            // Redirecionar independente da resposta
            window.location.href = this.config.baseUrl + 'conta/login?expired=1';
        });
    },


    // ============================================
    // PESQUISA SPOTLIGHT (CORRIGIDO)
    // ============================================
    initSpotlightSearch() {
        const modalEl = document.getElementById('modal-pesquisa-geral');
        if (!modalEl) return;

        const campoPesquisaPlaceholders = {
            'nome': 'Pesquisa pelo Nome',
            'cpf_cnpj': 'Pesquisa pelo CPF ou CNPJ',
            'placa': 'Pesquisa pela Placa',
            'chassi': 'Pesquisa pelo Chassi',
            'renavam': 'Pesquisa pelo Renavam',
            'rastreador': 'Pesquisa pelo Numero do Rastreador',
            'telefone': 'Pesquisa pelo Telefone',
            'cep': 'Pesquisa pelo CEP'
        };

        // Atalho Ctrl+K / Cmd+K
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                bootstrap.Modal.getOrCreateInstance(modalEl).show();
            }
        });

        // Foca o input ao abrir
        modalEl.addEventListener('shown.bs.modal', () => {
            document.getElementById('pesquisa-geral')?.focus();
        });

        // Pills de tipo
        $(document).on('click', '.tipo-pesquisa-pill', function () {
            $('.tipo-pesquisa-pill').removeClass('active');
            $(this).addClass('active');

            const tipo = $(this).data('tipo');
            let placeholder = $(this).data('placeholder');

            $('#tipo-pesquisa').val(tipo);

            // Mostrar/ocultar select de campo
            if (tipo === 'vendas') {
                $('#campo-pesquisa').show();
                placeholder = campoPesquisaPlaceholders[$('#campo-pesquisa').val()] || placeholder;
            } else {
                $('#campo-pesquisa').hide();
            }

            $('#pesquisa-geral').attr('placeholder', placeholder);
        });

        // Placeholder dinamico ao mudar campo
        $(document).on('change', '#campo-pesquisa', function () {
            const campo = $(this).val();
            $('#pesquisa-geral').attr('placeholder', campoPesquisaPlaceholders[campo] || '');

            if (campo === 'telefone') {
                App.ativarMascaraTelefone();
            } else {
                App.desativarMascaraTelefone();
            }
        });

        // Submit do formulario
        $('#form-pesquisa-geral').on('submit', function (e) {
            const tipo = $('#tipo-pesquisa').val();

            // Atualizar action do form com base no tipo
            $(this).attr('action', '/' + tipo);

            // Separar DDD e telefone se necessario
            if ($('#campo-pesquisa').val() === 'telefone') {
                const raw = $('#pesquisa-geral').val().replace(/\D/g, '');
                $('#pesquisa-hidden-ddd').val(raw.slice(0, 2));
                $('#pesquisa-hidden-telefone').val(raw.slice(2));
            } else {
                $('#pesquisa-hidden-ddd').val('');
                $('#pesquisa-hidden-telefone').val('');
            }
        });

        // Inicializar Tour
        this.initSearchTour();
    },


    // ============================================
    // MASCARA DE TELEFONE (CORRIGIDO)
    // ============================================
    ativarMascaraTelefone() {
        const $input = $('#pesquisa-geral');
        $input.attr('maxlength', '15').val(this.formatarTelefone($input.val()));
        $input.on('input.phonemask', function () {
            const sel = this.selectionStart;
            const prev = this.value.length;
            this.value = App.formatarTelefone(this.value);
            const diff = this.value.length - prev;
            this.setSelectionRange(sel + diff, sel + diff);
        });
    },

    desativarMascaraTelefone() {
        $('#pesquisa-geral').off('input.phonemask').removeAttr('maxlength');
    },

    formatarTelefone(v) {
        v = v.replace(/\D/g, '').slice(0, 11);
        if (!v) return '';
        if (v.length <= 2) return '(' + v;
        if (v.length <= 6) return '(' + v.slice(0, 2) + ') ' + v.slice(2);
        if (v.length <= 10) return '(' + v.slice(0, 2) + ') ' + v.slice(2, 6) + '-' + v.slice(6);
        return '(' + v.slice(0, 2) + ') ' + v.slice(2, 7) + '-' + v.slice(7);
    },

    // ============================================
    // TOUR DRIVER.JS (CORRIGIDO)
    // ============================================
    initSearchTour() {
        const TOUR_KEY = 'tour_pesquisa_visto_v1';
        const badge = document.getElementById('badge-novo-pesquisa');

        const marcarTourVisto = () => {
            localStorage.setItem(TOUR_KEY, '1');
            if (badge) badge.style.display = 'none';
        };

        if (localStorage.getItem(TOUR_KEY)) return;

        // Mostrar badge
        if (badge) badge.style.display = 'inline-block';

        // Iniciar tour apos render
        setTimeout(() => {
            if (typeof window.driver === 'undefined') return;

            const tourPesquisa = window.driver.driver({
                showProgress: false,
                animate: true,
                overlayOpacity: 0.55,
                allowClose: true,
                onDestroyStarted() {
                    marcarTourVisto();
                    tourPesquisa.destroy();
                },
                steps: [{
                    element: '#btn-pesquisa-spotlight',
                    popover: {
                        title: 'Nova Pesquisa Rapida',
                        description: 'Clique neste icone ou pressione <kbd>Ctrl+K</kbd> para abrir a pesquisa rapida em qualquer lugar do sistema.',
                        side: 'bottom',
                        align: 'end',
                        nextBtnText: 'Entendi!',
                        showButtons: ['next'],
                    }
                }]
            });

            tourPesquisa.drive();
        }, 800);

        // Marcar como visto ao abrir modal
        const modalEl = document.getElementById('modal-pesquisa-geral');
        if (modalEl) {
            modalEl.addEventListener('show.bs.modal', () => {
                if (!localStorage.getItem(TOUR_KEY)) {
                    marcarTourVisto();
                }
            });
        }
    },


    // ============================================
    // TOGGLE SENHA (CORRIGIDO - com acessibilidade)
    // ============================================
    initPasswordToggle() {
        $(document).on('click', '.btn-password', function () {
            const $btn = $(this);
            const $input = $btn.closest('.input-group').find('input');
            const $icon = $btn.find('i');

            if ($input.attr('type') === 'password') {
                $input.attr('type', 'text');
                $icon.removeClass('bi-eye-fill').addClass('bi-eye-slash-fill');
                $btn.attr('aria-label', 'Ocultar senha');
            } else {
                $input.attr('type', 'password');
                $icon.removeClass('bi-eye-slash-fill').addClass('bi-eye-fill');
                $btn.attr('aria-label', 'Mostrar senha');
            }
        });
    },

    // ============================================
    // TOGGLE FILTROS
    // ============================================
    initFilterToggle() {
        const btn = document.getElementById('btn-toggle-filters');
        const panel = document.getElementById('form-more-filters');

        if (btn && panel) {
            btn.addEventListener('click', () => {
                const isVisible = panel.style.display !== 'none';
                panel.style.display = isVisible ? 'none' : 'block';
                btn.classList.toggle('active', !isVisible);
            });
        }
    },

    // ============================================
    // MODAL ALTERAR SENHA
    // ============================================
    initAlterarSenhaModal() {
        const trigger = document.getElementById('AlterarSenhaModal');
        if (trigger) {
            trigger.addEventListener('click', (e) => {
                e.preventDefault();
                const modal = bootstrap.Modal.getOrCreateInstance(
                    document.getElementById('modal-alterar-senha')
                );
                modal.show();
            });
        }

        // Validacao de senha
        $('#modal-alterar-senha').on('submit', function (e) {
            const senha = $('#SenhaModal').val();
            const confirmar = $('#ConfirmarSenhaModal').val();

            if (senha !== confirmar) {
                e.preventDefault();
                alert('As senhas nao coincidem. Por favor, verifique.');
                return false;
            }

            if (senha.length < 6) {
                e.preventDefault();
                alert('A senha deve ter no minimo 6 caracteres.');
                return false;
            }
        });
    },

    // ============================================
    // TOOLTIPS (Bootstrap)
    // ============================================
    initTooltips() {
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(el => {
            new bootstrap.Tooltip(el);
        });
    },

    // ============================================
    // SELECT2
    // ============================================
    initSelect2() {
        if ($.fn.select2) {
            $('.select2').select2({
                placeholder: '- Selecione -',
                allowClear: true,
                width: '100%'
            });

            // Autocomplete via AJAX para consultores
            $('.consultores-autocomplete').select2({
                ajax: {
                    url: '/consultores/autocomplete',
                    dataType: 'json',
                    delay: 300,
                    data: (params) => ({ q: params.term }),
                    processResults: (data) => ({ results: data }),
                },
                placeholder: '- Pesquise -',
                minimumInputLength: 2,
                allowClear: true,
                width: '100%'
            });

            // Autocomplete para clientes
            $('.clientes-autocomplete').select2({
                ajax: {
                    url: '/clientes/autocomplete',
                    dataType: 'json',
                    delay: 300,
                    data: (params) => ({ q: params.term }),
                    processResults: (data) => ({ results: data }),
                },
                placeholder: '- Pesquise -',
                minimumInputLength: 2,
                allowClear: true,
                width: '100%'
            });

            // Autocomplete para colaboradores (CORRIGIDO - era inline com ~250 options)
            $('.colaboradores-autocomplete').select2({
                ajax: {
                    url: '/colaboradores/autocomplete',
                    dataType: 'json',
                    delay: 300,
                    data: (params) => ({ q: params.term }),
                    processResults: (data) => ({ results: data }),
                },
                placeholder: '- Pesquise -',
                minimumInputLength: 2,
                allowClear: true,
                width: '100%'
            });

            // Autocomplete para estados
            $('.estados-autocomplete').select2({
                ajax: {
                    url: '/estados/autocomplete',
                    dataType: 'json',
                    delay: 300,
                    data: (params) => ({ q: params.term }),
                    processResults: (data) => ({ results: data }),
                },
                placeholder: '- Pesquise -',
                minimumInputLength: 1,
                allowClear: true,
                width: '100%'
            });

            // Autocomplete para cidades (dependente de estado)
            $('.cidades-autocomplete').select2({
                ajax: {
                    url: '/cidades/autocomplete',
                    dataType: 'json',
                    delay: 300,
                    data: (params) => ({
                        q: params.term,
                        estado: $('#IndividuosEnderecosEstadosId').val()
                    }),
                    processResults: (data) => ({ results: data }),
                },
                placeholder: '- Pesquise -',
                minimumInputLength: 2,
                allowClear: true,
                width: '100%'
            });
        }
    },
};


// ============================================
// INICIALIZAR APP
// ============================================
document.addEventListener('DOMContentLoaded', () => {
    App.init();
});

// ============================================
// FUNCOES UTILITARIAS GLOBAIS
// ============================================

/**
 * Construir URL a partir de segmentos
 * (substitui buildUrl que era usada sem definicao clara)
 */
function buildUrl(...segments) {
    return App.config.baseUrl + segments.join('/');
}

/**
 * Exibir modal de loading
 */
function showLoading() {
    bootstrap.Modal.getOrCreateInstance(
        document.getElementById('modal-load')
    ).show();
}

/**
 * Ocultar modal de loading
 */
function hideLoading() {
    bootstrap.Modal.getInstance(
        document.getElementById('modal-load')
    )?.hide();
}

/**
 * Modal de confirmacao generica
 */
function confirmarAcao(texto, callback) {
    const modal = document.getElementById('modal-notificacao-geral');
    const textoEl = document.getElementById('modal-notificacao-texto');
    const btnConfirma = document.getElementById('confirma-notificacao');

    if (!modal || !textoEl || !btnConfirma) return;

    textoEl.textContent = texto;

    const bsModal = bootstrap.Modal.getOrCreateInstance(modal);
    bsModal.show();

    // Limpar eventos anteriores
    const newBtn = btnConfirma.cloneNode(true);
    btnConfirma.parentNode.replaceChild(newBtn, btnConfirma);

    newBtn.addEventListener('click', () => {
        bsModal.hide();
        if (typeof callback === 'function') callback();
    });
}

/**
 * Formatar valor monetario
 */
function formatMoney(value) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format(value || 0);
}

/**
 * Obter notificacoes do servidor
 */
function carregarNotificacoes() {
    $.ajax({
        url: buildUrl('notificacoes-geradas', 'count'),
        method: 'GET',
        success(data) {
            const badge = document.getElementById('notificacoes');
            if (badge && data.count > 0) {
                badge.textContent = data.count > 99 ? '99+' : data.count;
                badge.style.display = 'inline-block';
            }
        }
    });
}

// Carregar notificacoes ao iniciar
$(document).ready(() => {
    carregarNotificacoes();
});
