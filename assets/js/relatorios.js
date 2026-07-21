/* ═══════════════════════════════════════════════════════════
   Aurora AVP - Relatorios JavaScript
   Logica de busca, cache, renderizacao e interacao
   ═══════════════════════════════════════════════════════════ */

// ─── CONFIGURACAO ───────────────────────────────────────────
var SUPABASE_URL = 'https://zjacembodtjrkynfmtxf.supabase.co';
var SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpqYWNlbWJvZHRqcmt5bmZtdHhmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQxMTc3NTEsImV4cCI6MjA5OTY5Mzc1MX0.8q7I5cTcNVyL7uLXgZ1ZWCE3T1KbfYyevnr8uqLFVvY';
var PROXY_URL = SUPABASE_URL + '/functions/v1/aeasy-proxy';
var BATCH_SIZE = 5;

// ─── ESTADO GLOBAL ──────────────────────────────────────────
var DATA = [];
var sessionCookie = '';
var hiddenGestores = JSON.parse(localStorage.getItem('avp_hidden') || '[]');
var currentSort = { key: 'gestor', dir: 'asc' };
var vendasPage = 0;
var vendasTotal = 0;


// ─── INICIALIZACAO ──────────────────────────────────────────
(function init() {
  // Carregar tema (dark por padrao)
  var saved = localStorage.getItem('avp_theme');
  if (saved) {
    document.documentElement.setAttribute('data-theme', saved);
  } else {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('avp_theme', 'dark');
  }

  // Datas padrao (mes atual)
  var hoje = new Date();
  var primeiro = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  setDateValue('fDataInicial', primeiro);
  setDateValue('fDataFinal', hoje);
  setDateValue('fVendasDataInicial', primeiro);
  setDateValue('fVendasDataFinal', hoje);
  setDateValue('fFluxoDataInicial', primeiro);
  setDateValue('fFluxoDataFinal', hoje);

  // Fluxo de Caixa: selecionar mes/ano atual
  var selectFluxoMes = document.getElementById('fFluxoMes');
  var selectFluxoAno = document.getElementById('fFluxoAno');
  if (selectFluxoMes) selectFluxoMes.value = String(hoje.getMonth() + 1).padStart(2, '0');
  if (selectFluxoAno) selectFluxoAno.value = String(hoje.getFullYear());

  // Verificar sessao salva
  var ss = localStorage.getItem('avp_session');
  if (ss) {
    sessionCookie = ss;
    updateSessionBadge(true);
  }

  // Renderizar gestores ocultos
  renderHiddenGestores();

  // Inicializar sidebar
  initSidebar();
})();

function setDateValue(id, date) {
  var el = document.getElementById(id);
  if (el) el.value = date.toISOString().split('T')[0];
}


// ─── PRESETS DE DATA ────────────────────────────────────────
// Calcula datas com base no calendario atual para cada preset
function calcularPresetDatas(preset) {
  var hoje = new Date();
  var dataInicial, dataFinal;

  switch (preset) {
    case 'hoje':
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      break;

    case '7dias':
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6);
      break;

    case 'mes_atual':
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      break;

    case 'mes_anterior':
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), 0); // ultimo dia do mes anterior
      break;

    case 'trimestre':
      // Ultimo trimestre: primeiro dia de 3 meses atras ate ultimo dia do mes anterior
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth() - 3, 1);
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      break;

    case 'semestre':
      // Semestre: primeiro dia de 6 meses atras ate ultimo dia do mes anterior
      dataInicial = new Date(hoje.getFullYear(), hoje.getMonth() - 6, 1);
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), 0);
      break;

    case 'ano':
      dataInicial = new Date(hoje.getFullYear(), 0, 1); // 1 de janeiro
      dataFinal = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
      break;

    default:
      return null;
  }

  return { dataInicial: dataInicial, dataFinal: dataFinal };
}

function aplicarPresetData() {
  var preset = document.getElementById('fPeriodoPreset').value;
  if (!preset) return;

  var datas = calcularPresetDatas(preset);
  if (datas) {
    setDateValue('fDataInicial', datas.dataInicial);
    setDateValue('fDataFinal', datas.dataFinal);
  }
}


// ─── CACHE MULTI-MES ────────────────────────────────────────
// Quando o periodo selecionado abrange multiplos meses, verifica se cada
// mes individual existe no cache do DB e combina os dados (merge dos arrays).
// Retorna null se algum mes nao estiver no cache (fallthrough para API).
function getMonthRanges(dataInicial, dataFinal) {
  var ranges = [];
  var start = new Date(dataInicial + 'T00:00:00');
  var end = new Date(dataFinal + 'T00:00:00');

  var current = new Date(start.getFullYear(), start.getMonth(), 1);

  while (current <= end) {
    var firstDay = new Date(current.getFullYear(), current.getMonth(), 1);
    var lastDay = new Date(current.getFullYear(), current.getMonth() + 1, 0);

    ranges.push({
      data_inicial: firstDay.toISOString().split('T')[0],
      data_final: lastDay.toISOString().split('T')[0]
    });

    current = new Date(current.getFullYear(), current.getMonth() + 1, 1);
  }

  return ranges;
}

async function checkMultiMonthCache(params) {
  var months = getMonthRanges(params.data_inicial, params.data_final);

  // Se e apenas 1 mes (ou menos), nao usar multi-month logic
  if (months.length <= 1) return null;

  console.log('[Aurora] Multi-month cache: verificando ' + months.length + ' meses');

  // Buscar TODOS os registros mensais que caem no periodo com 1 unica query
  var firstMonth = months[0].data_inicial;
  var lastMonth = months[months.length - 1].data_inicial;

  try {
    var dbResults = await sbFetch(
      'relatorios_cache?data_inicial=gte.' + firstMonth + '&data_inicial=lte.' + lastMonth + '&select=dados,data_inicial,data_final,expires_at&order=data_inicial.asc'
    );

    if (!dbResults || dbResults.length === 0) {
      console.log('[Aurora] Multi-month: nenhum registro no periodo');
      return null;
    }

    console.log('[Aurora] Multi-month: encontrados ' + dbResults.length + ' registros no DB');

    // Verificar se temos todos os meses necessarios
    var allDados = [];
    var now = new Date();

    for (var i = 0; i < months.length; i++) {
      var found = false;
      for (var j = 0; j < dbResults.length; j++) {
        // Verificar se este registro cobre o mes i
        if (dbResults[j].data_inicial === months[i].data_inicial ||
            dbResults[j].data_inicial.substring(0, 7) === months[i].data_inicial.substring(0, 7)) {
          // Verificar expiracao
          if (now < new Date(dbResults[j].expires_at) && dbResults[j].dados) {
            console.log('[Aurora] Multi-month cache HIT: ' + months[i].data_inicial + ' a ' + months[i].data_final);
            allDados.push(dbResults[j].dados);
            found = true;
            break;
          }
        }
      }
      if (!found) {
        console.log('[Aurora] Multi-month cache MISS: ' + months[i].data_inicial);
        return null;
      }
    }

    // Todos os meses encontrados, combinar
    return mergeMultiMonthData(allDados);
  } catch (e) {
    console.warn('[Aurora] Multi-month cache erro:', e.message);
    return null;
  }
}

// Combina dados de multiplos meses: agrupa por gestor e soma valores numericos
function mergeMultiMonthData(monthsData) {
  var gestorMap = {};

  monthsData.forEach(function(monthDados) {
    if (!Array.isArray(monthDados)) return;

    monthDados.forEach(function(g) {
      var key = g.gestor.toUpperCase();

      if (!gestorMap[key]) {
        // Primeira ocorrencia: clonar o objeto
        gestorMap[key] = {
          gestor: g.gestor,
          cidade: g.cidade,
          taxa_conversao: '',
          cot_qtd: 0,
          cot_valor: 0,
          cot_ticket: 0,
          cad_qtd: 0,
          cad_valor: 0,
          cad_ticket: 0,
          efe_qtd: 0,
          efe_valor: 0,
          efe_ticket: 0,
          ati_qtd: 0,
          ati_valor: 0,
          ati_ticket: 0,
          sus_qtd: 0,
          sus_valor: 0,
          can_qtd: 0,
          can_valor: 0,
          pbp_qtd: 0,
          pbp_valor: 0,
          total_qtd: 0,
          total_valor: 0,
          ticket: 0,
          equipe: []
        };
      }

      var target = gestorMap[key];

      // Somar valores numericos
      target.cot_qtd += (g.cot_qtd || 0);
      target.cot_valor += (g.cot_valor || 0);
      target.cad_qtd += (g.cad_qtd || 0);
      target.cad_valor += (g.cad_valor || 0);
      target.efe_qtd += (g.efe_qtd || 0);
      target.efe_valor += (g.efe_valor || 0);
      target.ati_qtd += (g.ati_qtd || 0);
      target.ati_valor += (g.ati_valor || 0);
      target.sus_qtd += (g.sus_qtd || 0);
      target.sus_valor += (g.sus_valor || 0);
      target.can_qtd += (g.can_qtd || 0);
      target.can_valor += (g.can_valor || 0);
      target.pbp_qtd += (g.pbp_qtd || 0);
      target.pbp_valor += (g.pbp_valor || 0);

      // Combinar equipe (membros de todos os meses)
      if (g.equipe && g.equipe.length > 0) {
        g.equipe.forEach(function(membro) {
          var membroKey = membro.gestor.toUpperCase();
          var existente = target.equipe.find(function(m) {
            return m.gestor.toUpperCase() === membroKey;
          });

          if (existente) {
            existente.cot_qtd += (membro.cot_qtd || 0);
            existente.cot_valor += (membro.cot_valor || 0);
            existente.cad_qtd += (membro.cad_qtd || 0);
            existente.cad_valor += (membro.cad_valor || 0);
            existente.efe_qtd += (membro.efe_qtd || 0);
            existente.efe_valor += (membro.efe_valor || 0);
            existente.ati_qtd += (membro.ati_qtd || 0);
            existente.ati_valor += (membro.ati_valor || 0);
            existente.sus_qtd += (membro.sus_qtd || 0);
            existente.sus_valor += (membro.sus_valor || 0);
            existente.can_qtd += (membro.can_qtd || 0);
            existente.can_valor += (membro.can_valor || 0);
            existente.pbp_qtd += (membro.pbp_qtd || 0);
            existente.pbp_valor += (membro.pbp_valor || 0);
          } else {
            target.equipe.push({
              gestor: membro.gestor,
              cidade: membro.cidade,
              taxa_conversao: '',
              cot_qtd: membro.cot_qtd || 0,
              cot_valor: membro.cot_valor || 0,
              cot_ticket: membro.cot_ticket || 0,
              cad_qtd: membro.cad_qtd || 0,
              cad_valor: membro.cad_valor || 0,
              cad_ticket: membro.cad_ticket || 0,
              efe_qtd: membro.efe_qtd || 0,
              efe_valor: membro.efe_valor || 0,
              efe_ticket: membro.efe_ticket || 0,
              ati_qtd: membro.ati_qtd || 0,
              ati_valor: membro.ati_valor || 0,
              ati_ticket: membro.ati_ticket || 0,
              sus_qtd: membro.sus_qtd || 0,
              sus_valor: membro.sus_valor || 0,
              can_qtd: membro.can_qtd || 0,
              can_valor: membro.can_valor || 0,
              pbp_qtd: membro.pbp_qtd || 0,
              pbp_valor: membro.pbp_valor || 0,
              total_qtd: membro.ati_qtd || 0,
              total_valor: membro.ati_valor || 0,
              ticket: 0,
              equipe: []
            });
          }
        });
      }
    });
  });

  // Recalcular totais e tickets
  var result = Object.keys(gestorMap).map(function(key) {
    var g = gestorMap[key];
    g.total_qtd = g.ati_qtd;
    g.total_valor = g.ati_valor;
    g.cot_ticket = g.cot_qtd > 0 ? g.cot_valor / g.cot_qtd : 0;
    g.cad_ticket = g.cad_qtd > 0 ? g.cad_valor / g.cad_qtd : 0;
    g.efe_ticket = g.efe_qtd > 0 ? g.efe_valor / g.efe_qtd : 0;
    g.ati_ticket = g.ati_qtd > 0 ? g.ati_valor / g.ati_qtd : 0;
    g.ticket = g.ati_ticket;
    g.taxa_conversao = g.cot_qtd > 0 ? ((g.ati_qtd / g.cot_qtd) * 100).toFixed(2) + '%' : '0,00%';

    // Recalcular tickets dos membros da equipe
    g.equipe.forEach(function(m) {
      m.total_qtd = m.ati_qtd;
      m.total_valor = m.ati_valor;
      m.cot_ticket = m.cot_qtd > 0 ? m.cot_valor / m.cot_qtd : 0;
      m.cad_ticket = m.cad_qtd > 0 ? m.cad_valor / m.cad_qtd : 0;
      m.efe_ticket = m.efe_qtd > 0 ? m.efe_valor / m.efe_qtd : 0;
      m.ati_ticket = m.ati_qtd > 0 ? m.ati_valor / m.ati_qtd : 0;
      m.ticket = m.ati_ticket;
      m.taxa_conversao = m.cot_qtd > 0 ? ((m.ati_qtd / m.cot_qtd) * 100).toFixed(2) + '%' : '0,00%';
    });

    return g;
  });

  console.log('[Aurora] Multi-month cache: combinados ' + result.length + ' gestores de ' + monthsData.length + ' meses');
  return result;
}


// ─── TEMA ───────────────────────────────────────────────────
function toggleTheme() {
  var isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  var newTheme = isDark ? '' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('avp_theme', newTheme);
}

// ─── TABS ───────────────────────────────────────────────────
function switchTab(btn) {
  var tabId = btn.getAttribute('data-tab');
  // Desativar todas (sidebar items e tabs legados)
  document.querySelectorAll('.sidebar-item').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.report-panel').forEach(function(p) { p.classList.remove('active'); });
  // Ativar selecionada
  btn.classList.add('active');
  var panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.add('active');
  // Em mobile, fechar sidebar apos selecionar (se nao estiver fixada)
  if (window.innerWidth <= 768 && !sidebarPinned) {
    collapseSidebar();
  }
}

// ─── SIDEBAR ────────────────────────────────────────────────
var sidebarPinned = JSON.parse(localStorage.getItem('avp_sidebar_pinned') || 'true');
var sidebarOpen = JSON.parse(localStorage.getItem('avp_sidebar_open') || 'true');

function initSidebar() {
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('sidebarToggle');
  var mainContent = document.getElementById('mainContent');
  var pinBtn = document.getElementById('btnPinSidebar');

  if (sidebarPinned) {
    pinBtn.classList.add('pinned');
  }

  if (!sidebarOpen || (!sidebarPinned && window.innerWidth <= 768)) {
    sidebar.classList.add('collapsed');
    toggle.classList.add('visible');
    mainContent.classList.add('expanded');
  }
}

function toggleSidebar() {
  var sidebar = document.getElementById('sidebar');
  var isCollapsed = sidebar.classList.contains('collapsed');

  if (isCollapsed) {
    expandSidebar();
  } else {
    collapseSidebar();
  }
}

function expandSidebar() {
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('sidebarToggle');
  var mainContent = document.getElementById('mainContent');
  var overlay = document.getElementById('sidebarOverlay');

  sidebar.classList.remove('collapsed');
  toggle.classList.remove('visible');
  mainContent.classList.remove('expanded');

  // Show overlay on mobile
  if (window.innerWidth <= 768) {
    overlay.classList.add('visible');
  }

  sidebarOpen = true;
  localStorage.setItem('avp_sidebar_open', 'true');
}

function collapseSidebar() {
  var sidebar = document.getElementById('sidebar');
  var toggle = document.getElementById('sidebarToggle');
  var mainContent = document.getElementById('mainContent');
  var overlay = document.getElementById('sidebarOverlay');

  sidebar.classList.add('collapsed');
  toggle.classList.add('visible');
  mainContent.classList.add('expanded');
  overlay.classList.remove('visible');

  sidebarOpen = false;
  localStorage.setItem('avp_sidebar_open', 'false');
}

function togglePinSidebar() {
  var pinBtn = document.getElementById('btnPinSidebar');
  sidebarPinned = !sidebarPinned;

  if (sidebarPinned) {
    pinBtn.classList.add('pinned');
    expandSidebar();
  } else {
    pinBtn.classList.remove('pinned');
  }

  localStorage.setItem('avp_sidebar_pinned', JSON.stringify(sidebarPinned));
}

// ─── FILTROS (toggle) ───────────────────────────────────────
function toggleFilters(id) {
  var body = document.getElementById('filters-' + id);
  var header = body.previousElementSibling;
  if (body.classList.contains('collapsed')) {
    body.classList.remove('collapsed');
    header.classList.remove('collapsed');
  } else {
    body.classList.add('collapsed');
    header.classList.add('collapsed');
  }
}


// ─── SESSAO / LOGIN ─────────────────────────────────────────
function updateSessionBadge(active) {
  var badge = document.getElementById('sessionBadge');
  if (active) {
    badge.textContent = 'Conectado';
    badge.classList.add('active');
  } else {
    badge.textContent = 'Desconectado';
    badge.classList.remove('active');
  }
}

function showLoginModal() {
  document.getElementById('modalLogin').style.display = 'flex';
  document.getElementById('loginError').style.display = 'none';
}

function closeModal() {
  document.getElementById('modalLogin').style.display = 'none';
}

async function doLogin() {
  var cpf = document.getElementById('loginCpf').value.replace(/\D/g, '');
  var senha = document.getElementById('loginSenha').value;

  if (!cpf || !senha) {
    showLoginError('Preencha CPF e senha');
    return;
  }

  try {
    var res = await edgeCall({ action: 'login', cpf: cpf, senha: senha });
    if (res.success) {
      sessionCookie = res.session_cookie;
      localStorage.setItem('avp_session', sessionCookie);
      updateSessionBadge(true);
      closeModal();
    } else {
      showLoginError(res.error || 'Falha no login');
    }
  } catch (e) {
    showLoginError('Erro de conexao: ' + e.message);
  }
}

function showLoginError(msg) {
  var el = document.getElementById('loginError');
  el.textContent = msg;
  el.style.display = 'block';
}


// ─── SUPABASE HELPERS ───────────────────────────────────────
async function sbFetch(path, opts) {
  var url = SUPABASE_URL + '/rest/v1/' + path;
  var headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation'
  };
  var res = await fetch(url, Object.assign({ headers: headers }, opts || {}));
  if (!res.ok) return null;
  return res.json();
}

function getFilterHash(params) {
  var keys = Object.keys(params).sort();
  var parts = keys.map(function(k) { return k + '=' + params[k]; });
  return parts.join('|');
}

async function checkCache(hash) {
  try {
    var data = await sbFetch(
      'relatorios_cache?filtro_hash=eq.' + encodeURIComponent(hash) + '&select=dados,updated_at'
    );
    if (data && data.length > 0) {
      var cached = data[0];
      var age = Date.now() - new Date(cached.updated_at).getTime();
      // Cache valido por 30 minutos
      if (age < 30 * 60 * 1000) {
        return cached.dados;
      }
    }
  } catch (e) { /* ignore */ }
  return null;
}

async function saveCache(hash, dados, params) {
  try {
    await sbFetch('relatorios_cache', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        filtro_hash: hash,
        tipo_data: params.tipo_data || '',
        data_inicial: params.data_inicial || '',
        data_final: params.data_final || '',
        ordenacao: params.ordenar || '',
        retornar_lider: params.retornar_lider || '',
        dados: dados,
        updated_at: new Date().toISOString()
      })
    });
  } catch (e) { /* ignore */ }
  // Tambem salvar em localStorage como fallback
  try {
    localStorage.setItem('avp_cache_' + hash, JSON.stringify({
      dados: dados,
      ts: Date.now()
    }));
  } catch (e) { /* storage full */ }
}


// ─── EDGE FUNCTION CALL ─────────────────────────────────────
async function edgeCall(body) {
  var res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + SUPABASE_KEY
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    var err = await res.text();
    throw new Error('Edge Function error: ' + res.status + ' - ' + err);
  }
  return res.json();
}

// ─── PROGRESSO ──────────────────────────────────────────────
function showProgress() {
  document.getElementById('progressPanel').style.display = 'block';
}

function hideProgress() {
  document.getElementById('progressPanel').style.display = 'none';
}

function updateProgress(pct, text, detail, time) {
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressPct').textContent = Math.round(pct) + '%';
  if (text) document.getElementById('progressText').textContent = text;
  if (detail) document.getElementById('progressDetail').textContent = detail;
  if (time) document.getElementById('progressTime').textContent = time;
}


// ─── BUSCAR DADOS (Top Adesoes - funcao principal) ──────────
// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║ RetornarLiderComEquipe - Comportamento do filtro "Retornar Lider"       ║
// ║                                                                         ║
// ║ Quando se seleciona um gestor no filtro "Equipe", o sistema retorna     ║
// ║ a lista de membros da equipe dele. Este filtro controla QUEM aparece:   ║
// ║                                                                         ║
// ║ "SIM" = Equipe completa:                                                ║
// ║   Retorna todos da equipe + sub-lideres + membros dos sub-lideres.      ║
// ║   Exemplo: ADHRIAN com SIM = 104 membros.                               ║
// ║                                                                         ║
// ║ "NAO" = Equipe sem lideres (PADRAO):                                    ║
// ║   Apenas membros diretos (remove sub-lideres e suas equipes).           ║
// ║   Mostra so os "soldados" de cada gestor, sem incluir outros            ║
// ║   gestores/sub-gestores que estao abaixo dele na hierarquia.            ║
// ║   Exemplo: ADHRIAN com NAO = 61 membros.                                ║
// ║   A diferenca (104 - 61 = 43) sao sub-lideres e suas equipes.          ║
// ║                                                                         ║
// ║ "ATE_NIVEL_1" = Equipe ate lider 1o nivel:                              ║
// ║   Membros diretos + sub-lideres do primeiro nivel (sem as equipes       ║
// ║   desses sub-lideres).                                                  ║
// ║                                                                         ║
// ║ Usamos "NAO" como padrao porque queremos ver apenas os consultores      ║
// ║ diretos ("soldados") sob cada gestor no relatorio.                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
async function buscarDados(forceRefresh) {
  var btn = document.getElementById('btnBuscar');
  btn.disabled = true;

  var params = {
    tipo_data: '2',
    data_inicial: document.getElementById('fDataInicial').value,
    data_final: document.getElementById('fDataFinal').value,
    ordenar: '3',
    campo_order: 'Quantidade',
    centro_custo: '',
    retornar_lider: 'NAO'
  };

  var hash = getFilterHash(params);

  // Determinar se precisa buscar da API (Personalizado, Hoje, 7 dias)
  // Presets mensais usam cache do DB (atualizado pelo Cron a cada 1h)
  var preset = document.getElementById('fPeriodoPreset') ? document.getElementById('fPeriodoPreset').value : '';
  var needsAPI = (preset === '' || preset === 'hoje' || preset === '7dias');

  // Verificar cache compartilhado no Supabase DB (se nao forcar)
  if (!forceRefresh) {
    // Para sub-mensais: verificar cache de curta duracao (1h)
    if (needsAPI) {
      try {
        var dbCache = await sbFetch(
          'relatorios_cache?filtro_hash=eq.' + encodeURIComponent(hash) + '&select=dados,updated_at,expires_at'
        );
        if (dbCache && dbCache.length > 0) {
          var cached = dbCache[0];
          var age = Date.now() - new Date(cached.updated_at).getTime();
          if (age < 60 * 60 * 1000 && cached.dados) {
            var minAgo = Math.round(age / 60000);
            DATA = cached.dados;
            showData('Cache DB (' + minAgo + ' min atras) | ' + cached.dados.length + ' gestores');
            btn.disabled = false;
            return;
          }
        }
      } catch (e) { /* continuar para API */ }
    }

    // Para periodos mensais+: usar cache normal
    if (!needsAPI) {
    // 1. Tentar Supabase DB (compartilhado entre todos os usuarios)
    try {
      var dbCache = await sbFetch(
        'relatorios_cache?filtro_hash=eq.' + encodeURIComponent(hash) + '&select=dados,updated_at,expires_at'
      );
      console.log('[Aurora] Cache DB check:', dbCache ? dbCache.length + ' registros' : 'null/erro');
      if (dbCache && dbCache.length > 0) {
        var cached = dbCache[0];
        var now = new Date();
        var expiresAt = new Date(cached.expires_at);
        var age = Math.round((now - new Date(cached.updated_at)) / 60000);
        console.log('[Aurora] Cache age:', age + ' min, expires:', cached.expires_at);
        // Usar expires_at como criterio (dados historicos nunca expiram)
        if (now < expiresAt) {
          DATA = cached.dados;
          showData('Cache DB (atualizado ' + age + ' min atras) | ' + (cached.dados ? cached.dados.length : 0) + ' gestores');
          btn.disabled = false;
          return;
        }
      }
    } catch (e) {
      console.warn('[Aurora] Erro ao verificar cache DB:', e.message);
    }

    // 1.5 Tentar buscar pelo mes que contem o periodo (Hoje, 7 dias, etc.)
    try {
      var startMonth = params.data_inicial.substring(0, 7); // "2026-07"
      var endMonth = params.data_final.substring(0, 7);
      // Se periodo cabe em 1 mes OU ambos estao no mesmo mes
      if (startMonth === endMonth) {
        var firstOfMonth = startMonth + '-01';
        var lastOfMonth = startMonth + '-31';
        var monthCache = await sbFetch(
          'relatorios_cache?data_inicial=gte.' + firstOfMonth + '&data_inicial=lte.' + lastOfMonth + '&select=dados,updated_at,expires_at&limit=1'
        );
        if (monthCache && monthCache.length > 0) {
          var mc = monthCache[0];
          var now = new Date();
          if (now < new Date(mc.expires_at) && mc.dados) {
            var age = Math.round((now - new Date(mc.updated_at)) / 60000);
            console.log('[Aurora] Cache mes encontrado: ' + startMonth + ' (age: ' + age + ' min)');
            DATA = mc.dados;
            showData('Cache DB (' + startMonth + ', ' + age + ' min atras) | ' + (mc.dados ? mc.dados.length : 0) + ' gestores');
            btn.disabled = false;
            return;
          }
        }
      }
    } catch (e) { /* continuar */ }

    // 1.6 Tentar combinar cache de meses individuais (multi-month)
    try {
      var multiCache = await checkMultiMonthCache(params);
      if (multiCache) {
        DATA = multiCache;
        showData('Cache combinado (multi-mes) | ' + multiCache.length + ' gestores');
        btn.disabled = false;
        return;
      }
    } catch (e) {
      console.warn('[Aurora] Erro ao verificar cache multi-mes:', e.message);
    }
    } // fim if (!needsAPI)

    // 2. Fallback: localStorage (individual)
    try {
      var local = JSON.parse(localStorage.getItem('avp_cache_' + hash));
      if (local && (Date.now() - local.ts) < 120 * 60 * 1000) {
        DATA = local.dados;
        showData('Cache local (< 30min)');
        btn.disabled = false;
        return;
      }
    } catch (e) {}
  }

  // Buscar da API
  showProgress();
  if (needsAPI) {
    updateProgress(5, 'Buscando dados atualizados (periodo curto, ~30s)...', '', '');
  }
  var startTime = Date.now();

  try {
    // Passo 1: Garantir sessao ativa (login automatico via Edge Function)
    updateProgress(5, 'Verificando sessao...', '', '');
    if (!sessionCookie) {
      var loginRes = await edgeCall({ action: 'login' });
      if (loginRes.success) {
        sessionCookie = loginRes.session_cookie;
        localStorage.setItem('avp_session', sessionCookie);
        updateSessionBadge(true);
      } else {
        throw new Error('Login automatico falhou: ' + (loginRes.error || 'sem credenciais'));
      }
    }

    // Passo 2: Buscar dados do TopVendas
    updateProgress(15, 'Buscando dados da API...', '', '');

    var gestoresRes = await edgeCall({
      action: 'gestores',
      session_cookie: sessionCookie,
      tipo_data: params.tipo_data,
      data_inicial: params.data_inicial,
      data_final: params.data_final,
      ordenar: params.ordenar,
      campo_order: params.campo_order,
      centro_custo: params.centro_custo,
      retornar_lider: params.retornar_lider
    });

    if (!gestoresRes.success) {
      throw new Error(gestoresRes.error || 'Falha ao buscar gestores');
    }

    updateProgress(50, 'Processando resposta...', '', '');

    var htmlRetornado = gestoresRes.html || '';
    console.log('[Aurora] HTML retornado (tamanho):', htmlRetornado.length);
    console.log('[Aurora] Debug da Edge Function:', gestoresRes.debug);

    // Verificar se retornou pagina de login (sessao expirada)
    if (htmlRetornado.indexOf('conta/login') !== -1 || htmlRetornado.indexOf('UsuariosLogin') !== -1) {
      console.warn('[Aurora] Sessao expirada, refazendo login...');
      sessionCookie = '';
      localStorage.removeItem('avp_session');
      // Refazer login
      var reloginRes = await edgeCall({ action: 'login' });
      if (reloginRes.success) {
        sessionCookie = reloginRes.session_cookie;
        localStorage.setItem('avp_session', sessionCookie);
        // Tentar buscar novamente
        gestoresRes = await edgeCall({
          action: 'gestores',
          session_cookie: sessionCookie,
          tipo_data: params.tipo_data,
          data_inicial: params.data_inicial,
          data_final: params.data_final,
          ordenar: params.ordenar,
          campo_order: params.campo_order,
          centro_custo: params.centro_custo,
          retornar_lider: params.retornar_lider
        });
        htmlRetornado = gestoresRes.html || '';
        console.log('[Aurora] Retry HTML (tamanho):', htmlRetornado.length);
      } else {
        throw new Error('Re-login falhou');
      }
    }

    // Parsear HTML dos gestores (tela geral)
    var allGestores = parseGestoresHTML(htmlRetornado);

    // Filtrar apenas lideres reais (62) se a Edge Function retornou a lista
    var lideresNomes = gestoresRes.lideres || [];
    var gestores = allGestores;
    if (lideresNomes.length > 0) {
      gestores = allGestores.filter(function(g) {
        return lideresNomes.indexOf(g.gestor.toUpperCase()) !== -1;
      });
    }

    // Salvar info dos lideres para uso no expandir equipe
    window._lideresInfo = gestoresRes.lideres_info || [];

    // Substituir "cidade" (centro_custo) pela cidade real do cadastro do consultor
    if (window._lideresInfo.length > 0) {
      gestores.forEach(function(g) {
        var liderInfo = window._lideresInfo.find(function(l) {
          return l.nome.toUpperCase() === g.gestor.toUpperCase();
        });
        if (liderInfo && liderInfo.cidade) {
          g.cidade = liderInfo.cidade;
        }
      });
    }

    console.log('[Aurora] Gestores (lideres) parseados:', gestores.length);

    // Passo 3: Para cada lider, buscar equipe completa via EquipeId (PARALELO 5 por vez)
    updateProgress(55, 'Carregando equipes dos gestores...', '0 / ' + gestores.length, '');
    var lideresInfo = gestoresRes.lideres_info || [];
    var PARALLEL = 5;

    for (var i = 0; i < gestores.length; i += PARALLEL) {
      var batch = gestores.slice(i, i + PARALLEL);

      // Buscar em paralelo
      var promises = batch.map(function(g) {
        var liderInfo = lideresInfo.find(function(l) {
          return l.nome.toUpperCase() === g.gestor.toUpperCase();
        });

        if (!liderInfo || !liderInfo.id) return Promise.resolve(null);

        return edgeCall({
          action: 'gestores',
          session_cookie: sessionCookie,
          tipo_data: params.tipo_data,
          data_inicial: params.data_inicial,
          data_final: params.data_final,
          ordenar: params.ordenar,
          campo_order: 'Quantidade',
          equipe_id: liderInfo.id,
          retornar_lider: params.retornar_lider
        }).catch(function(e) {
          console.warn('[Aurora] Erro equipe ' + g.gestor + ':', e.message);
          return null;
        });
      });

      var results = await Promise.all(promises);

      // Processar resultados
      results.forEach(function(eqRes, idx) {
        if (eqRes && eqRes.success && eqRes.html) {
          var g = batch[idx];
          var membros = parseGestoresHTML(eqRes.html);
          membros = membros.filter(function(m) {
            return m.gestor.toUpperCase() !== g.gestor.toUpperCase();
          });
          membros = membros.filter(function(m) {
            return m.cot_qtd >= 1;
          });
          g.equipe = membros;
        }
      });

      // Atualizar progresso
      var done = Math.min(i + PARALLEL, gestores.length);
      var pct = 55 + (done / gestores.length) * 40;
      var elapsed = ((Date.now() - startTime) / 1000).toFixed(0) + 's';
      updateProgress(pct, 'Carregando equipes...', done + ' / ' + gestores.length, elapsed);
    }

    console.log('[Aurora] Equipes carregadas');
    if (gestores.length > 0) {
      console.log('[Aurora] Primeiro gestor:', JSON.stringify(gestores[0]));
    }

    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0) + 's';
    updateProgress(90, 'Encontrados ' + gestores.length + ' gestores', '', elapsed);

    // Salvar cache compartilhado no Supabase DB (para todos os usuarios)
    try {
      console.log('[Aurora] Salvando cache no DB com hash:', hash);
      // Primeiro deletar se existir
      await fetch(SUPABASE_URL + '/rest/v1/relatorios_cache?filtro_hash=eq.' + encodeURIComponent(hash), {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY
        }
      });
      // Depois inserir novo
      var saveRes = await fetch(SUPABASE_URL + '/rest/v1/relatorios_cache', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal'
        },
        body: JSON.stringify({
          filtro_hash: hash,
          tipo_relatorio: 'dashboard',
          data_inicial: params.data_inicial,
          data_final: params.data_final,
          dados: gestores,
          total_registros: gestores.length,
          updated_at: new Date().toISOString(),
          expires_at: '2099-12-31T23:59:59+00:00'
        })
      });
      console.log('[Aurora] Cache save status:', saveRes.status, saveRes.ok ? 'OK' : 'FALHOU');
      if (!saveRes.ok) {
        var errText = await saveRes.text();
        console.warn('[Aurora] Cache save erro:', errText);
      }
    } catch (e) {
      console.warn('[Aurora] Falha ao salvar cache no DB:', e.message);
    }

    // Salvar tambem no localStorage (fallback individual)
    try {
      localStorage.setItem('avp_cache_' + hash, JSON.stringify({
        dados: gestores,
        ts: Date.now()
      }));
    } catch (e) { /* storage full */ }

    DATA = gestores;
    updateProgress(100, 'Concluido!', gestores.length + ' gestores', elapsed);
    showData('Atualizado agora');

  } catch (e) {
    console.error('[Aurora] Erro buscarDados:', e);
    hideProgress();
    alert('Erro: ' + e.message);
    if (e.message.includes('401') || e.message.includes('login')) {
      sessionCookie = '';
      localStorage.removeItem('avp_session');
      updateSessionBadge(false);
      showLoginModal();
    }
  } finally {
    btn.disabled = false;
    setTimeout(hideProgress, 3000);
  }
}


// ─── PARSE HTML DO TOP VENDAS ───────────────────────────────
// Estrutura real da tabela AEasy (25 colunas por row):
// [0] # | [1] Nome | [2] Centro Custo | [3] Taxa Conversao
// [4-6] Cotacoes (Qtd/Valor/Ticket)
// [7-9] Cadastros (Qtd/Valor/Ticket)
// [10-12] Efetivadas (Qtd/Valor/Ticket)
// [13-15] Ativadas (Qtd/Valor/Ticket)
// [16-18] Suspensas (Qtd/Valor/Ticket)
// [19-21] Canceladas (Qtd/Valor/Ticket)
// [22-24] Primeiro Boleto Pago (Qtd/Valor/Ticket)
//
// NOTA: Com o filtro RetornarLider = "NAO" (Equipe sem lideres),
// cada linha de gestor representa apenas seus consultores diretos.
// Sub-lideres e suas equipes nao aparecem nos resultados.
// O proprio gestor ainda aparece na lista (por isso separamos
// individual vs equipe na exibicao).

function parseGestoresHTML(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var rows = doc.querySelectorAll('tbody tr');
  var gestores = [];

  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length < 20) return; // Pular rows incompletas ou headers

    var nome = getText(cells[1]);
    if (!nome || nome === 'Total' || nome === 'Totais') return;

    gestores.push({
      gestor: nome,
      cidade: getText(cells[2]),
      taxa_conversao: getText(cells[3]),
      // Cotacoes
      cot_qtd: parseBrNumber(getText(cells[4])),
      cot_valor: parseBrCurrency(getText(cells[5])),
      cot_ticket: parseBrCurrency(getText(cells[6])),
      // Cadastros
      cad_qtd: parseBrNumber(getText(cells[7])),
      cad_valor: parseBrCurrency(getText(cells[8])),
      cad_ticket: parseBrCurrency(getText(cells[9])),
      // Efetivadas
      efe_qtd: parseBrNumber(getText(cells[10])),
      efe_valor: parseBrCurrency(getText(cells[11])),
      efe_ticket: parseBrCurrency(getText(cells[12])),
      // Ativadas
      ati_qtd: parseBrNumber(getText(cells[13])),
      ati_valor: parseBrCurrency(getText(cells[14])),
      ati_ticket: parseBrCurrency(getText(cells[15])),
      // Suspensas
      sus_qtd: parseBrNumber(getText(cells[16])),
      sus_valor: parseBrCurrency(getText(cells[17])),
      // Canceladas
      can_qtd: parseBrNumber(getText(cells[19])),
      can_valor: parseBrCurrency(getText(cells[20])),
      // Primeiro Boleto Pago
      pbp_qtd: parseBrNumber(getText(cells[22])),
      pbp_valor: parseBrCurrency(getText(cells[23])),
      // Totais calculados (ativadas como principal)
      total_qtd: parseBrNumber(getText(cells[13])),
      total_valor: parseBrCurrency(getText(cells[14])),
      ticket: parseBrCurrency(getText(cells[15])),
      equipe: []
    });
  });

  return gestores;
}

function getText(cell) {
  return cell ? cell.textContent.trim() : '';
}

// Parse numero brasileiro: "11.250" → 11250, "3.618.750" → 3618750
function parseBrNumber(str) {
  if (!str) return 0;
  // Remover tudo que nao e digito
  var clean = str.replace(/[^\d]/g, '');
  return parseInt(clean) || 0;
}

// Parse moeda brasileira: "R$ 8,00" → 8.00, "R$ 1.324,50" → 1324.50
function parseBrCurrency(str) {
  if (!str) return 0;
  // Remover "R$" e espacos
  var clean = str.replace(/R\$\s*/g, '').trim();
  // Formato brasileiro: ponto e separador de milhar, virgula e decimal
  // Remover pontos de milhar, trocar virgula por ponto
  clean = clean.replace(/\./g, '').replace(',', '.');
  return parseFloat(clean) || 0;
}

// ─── EXIBIR DADOS ───────────────────────────────────────────
function showData(msg) {
  // Aplicar cidades reais do cadastro se disponivel
  if (Object.keys(CIDADES_CONSULTORES).length > 0) {
    aplicarCidadesNosGestores(DATA);
  }
  updateKPIs();
  renderTable(sortData(filterData(DATA)));
  updateCidadeFilter();
  document.getElementById('dataInfo').textContent = msg + ' | ' + DATA.length + ' gestores';
  renderHiddenGestores();

  // Se cidades ainda nao foram carregadas, buscar em background e re-renderizar
  if (Object.keys(CIDADES_CONSULTORES).length === 0) {
    carregarCidadesConsultores().then(function() {
      if (Object.keys(CIDADES_CONSULTORES).length > 0) {
        aplicarCidadesNosGestores(DATA);
        renderTable(sortData(filterData(DATA)));
        updateCidadeFilter();
      }
    });
  }
}

// Aplicar cidades reais nos gestores e equipes
function aplicarCidadesNosGestores(gestores) {
  gestores.forEach(function(g) {
    var cidadeReal = CIDADES_CONSULTORES[g.gestor.toUpperCase()];
    if (cidadeReal) g.cidade = cidadeReal;
    if (g.equipe && g.equipe.length > 0) {
      g.equipe.forEach(function(m) {
        var mCidade = CIDADES_CONSULTORES[m.gestor.toUpperCase()];
        if (mCidade) m.cidade = mCidade;
      });
    }
  });
}


// ─── KPIs ───────────────────────────────────────────────────
function updateKPIs() {
  // Aplicar mesmos filtros que a tabela (busca + cidade)
  var search = document.getElementById('searchInput') ? document.getElementById('searchInput').value.toLowerCase() : '';
  var cidade = document.getElementById('filterCidade') ? document.getElementById('filterCidade').value : '';

  var filtered = filterData(DATA).filter(function(g) {
    var matchSearch = !search || g.gestor.toLowerCase().indexOf(search) !== -1;
    var matchCidade = !cidade || g.cidade === cidade;
    return matchSearch && matchCidade;
  });

  updateKPIsFromData(filtered);
}

function updateKPIsFromData(gestores) {
  var totalCotacoes = 0, totalAtivadas = 0, totalValor = 0;

  gestores.forEach(function(g) {
    // Gestor individual
    totalCotacoes += g.cot_qtd;
    totalAtivadas += g.ati_qtd;
    totalValor += g.ati_valor;
    // Equipe
    if (g.equipe && g.equipe.length > 0) {
      g.equipe.forEach(function(m) {
        totalCotacoes += m.cot_qtd;
        totalAtivadas += m.ati_qtd;
        totalValor += m.ati_valor;
      });
    }
  });

  var taxaConversao = totalCotacoes > 0 ? ((totalAtivadas / totalCotacoes) * 100) : 0;
  var ticketMedio = totalAtivadas > 0 ? (totalValor / totalAtivadas) : 0;

  document.getElementById('kpiCotacoes').textContent = formatNum(totalCotacoes);
  document.getElementById('kpiAtivadas').textContent = formatNum(totalAtivadas);
  document.getElementById('kpiConversao').textContent = taxaConversao.toFixed(2) + '%';
  document.getElementById('kpiTicket').textContent = formatMoney(ticketMedio);
}

// ─── RENDER TABLE ───────────────────────────────────────────
function renderTable(ds) {
  var tbody = document.getElementById('tableBody');
  if (!ds || ds.length === 0) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum resultado encontrado</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < ds.length; i++) {
    var g = ds[i];
    // Calcular totais (gestor + equipe)
    var totalCot = g.cot_qtd;
    var totalAti = g.ati_qtd;
    var totalValor = g.ati_valor;
    if (g.equipe && g.equipe.length > 0) {
      g.equipe.forEach(function(m) {
        totalCot += m.cot_qtd;
        totalAti += m.ati_qtd;
        totalValor += m.ati_valor;
      });
    }
    var totalConv = totalCot > 0 ? ((totalAti / totalCot) * 100).toFixed(2) + '%' : '0,00%';
    var totalTicket = totalAti > 0 ? (totalValor / totalAti) : 0;

    html += '<tr class="row-gestor" onclick="toggleEquipe(this,' + i + ')">';
    html += '<td class="col-num">' + (i + 1) + '</td>';
    html += '<td><strong>' + esc(g.gestor) + '</strong></td>';
    html += '<td>' + esc(g.cidade) + '</td>';
    html += '<td class="col-num">' + totalConv + '</td>';
    html += '<td class="col-num">' + formatNum(totalCot) + '</td>';
    html += '<td class="col-num"><strong>' + formatNum(totalAti) + '</strong></td>';
    html += '<td class="col-num">' + formatMoney(totalValor) + '</td>';
    html += '<td class="col-num">' + formatMoney(totalTicket) + '</td>';
    html += '<td class="col-actions">';
    html += '<button class="btn-hide" onclick="event.stopPropagation();hideGestor(\'' + esc(g.gestor) + '\')" title="Ocultar gestor">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    html += '</button>';
    html += '</td>';
    html += '</tr>';

    // Equipe (ja carregada, mas inicia retraida)
    if (g.equipe && g.equipe.length > 0) {
      html += '<tr class="row-equipe" id="equipe-' + i + '"><td colspan="9">';
      html += renderEquipeTable(g.equipe, g);
      html += '</td></tr>';
    }
  }

  tbody.innerHTML = html;
}

function renderEquipeTable(membros, gestor) {
  var html = '<table class="equipe-table">';
  html += '<thead><tr><th>#</th><th>Gestor</th><th>Cidade</th><th>Conv.</th>';
  html += '<th>Cotacoes</th><th>Efetivadas</th><th>Valor</th><th>Ticket</th></tr></thead>';
  html += '<tbody>';
  // Primeira linha: o proprio gestor (individual)
  if (gestor) {
    var gConv = gestor.cot_qtd > 0 ? ((gestor.ati_qtd / gestor.cot_qtd) * 100).toFixed(2) + '%' : '0,00%';
    html += '<tr style="font-weight:600;color:var(--accent);background:var(--accent-light);border-left:3px solid var(--accent)">';
    html += '<td></td>';
    html += '<td>' + esc(gestor.gestor) + '</td>';
    html += '<td>' + esc(gestor.cidade) + '</td>';
    html += '<td>' + gConv + '</td>';
    html += '<td>' + formatNum(gestor.cot_qtd) + '</td>';
    html += '<td>' + formatNum(gestor.ati_qtd) + '</td>';
    html += '<td>' + formatMoney(gestor.ati_valor) + '</td>';
    html += '<td>' + formatMoney(gestor.ati_ticket) + '</td>';
    html += '</tr>';
  }
  // Membros da equipe
  membros.forEach(function(m, i) {
    var mConv = m.cot_qtd > 0 ? ((m.ati_qtd / m.cot_qtd) * 100).toFixed(2) + '%' : '0,00%';
    html += '<tr>';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td>' + esc(m.gestor) + '</td>';
    html += '<td>' + esc(m.cidade) + '</td>';
    html += '<td>' + mConv + '</td>';
    html += '<td>' + formatNum(m.cot_qtd) + '</td>';
    html += '<td>' + formatNum(m.ati_qtd) + '</td>';
    html += '<td>' + formatMoney(m.ati_valor) + '</td>';
    html += '<td>' + formatMoney(m.ati_ticket) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  html += '<div style="margin-top:6px;font-size:.72rem;color:var(--text3)">' + membros.length + ' membros na equipe</div>';
  return html;
}


// ─── EXPANDIR/COLAPSAR EQUIPE ────────────────────────────────
function toggleEquipe(row, index) {
  var equipeRow = document.getElementById('equipe-' + index);
  if (equipeRow) {
    equipeRow.classList.toggle('visible');
  }
}

// ─── FILTRAR TABELA ─────────────────────────────────────────
function filterData(data) {
  var visible = data.filter(function(g) {
    return hiddenGestores.indexOf(g.gestor) === -1;
  });
  return visible;
}

function filtrarTabela() {
  var search = document.getElementById('searchInput').value.toLowerCase();
  var cidade = document.getElementById('filterCidade').value;

  var filtered = filterData(DATA).filter(function(g) {
    var matchSearch = !search || g.gestor.toLowerCase().indexOf(search) !== -1;
    var matchCidade = !cidade || g.cidade === cidade;
    return matchSearch && matchCidade;
  });

  renderTable(sortData(filtered));
  // Recalcular KPIs com base nos dados filtrados (mesma base da tabela)
  updateKPIsFromData(filtered);
}


// ─── ORDENACAO ──────────────────────────────────────────────
function sortBy(key) {
  if (currentSort.key === key) {
    currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
  } else {
    currentSort.key = key;
    currentSort.dir = 'desc';
  }

  // Atualizar visual dos headers
  document.querySelectorAll('.sortable').forEach(function(th) {
    th.classList.remove('asc', 'desc');
    if (th.getAttribute('data-key') === key) {
      th.classList.add(currentSort.dir);
    }
  });

  filtrarTabela();
}

function sortData(arr) {
  var key = currentSort.key;
  var dir = currentSort.dir === 'asc' ? 1 : -1;

  return arr.slice().sort(function(a, b) {
    var va = a[key];
    var vb = b[key];
    if (typeof va === 'string') {
      return va.localeCompare(vb) * dir;
    }
    return ((va || 0) - (vb || 0)) * dir;
  });
}

// ─── GESTORES OCULTOS ───────────────────────────────────────
function hideGestor(nome) {
  if (hiddenGestores.indexOf(nome) === -1) {
    hiddenGestores.push(nome);
    localStorage.setItem('avp_hidden', JSON.stringify(hiddenGestores));
  }
  showData('Gestor oculto: ' + nome);
}

function showGestor(nome) {
  hiddenGestores = hiddenGestores.filter(function(g) { return g !== nome; });
  localStorage.setItem('avp_hidden', JSON.stringify(hiddenGestores));
  showData('Gestor reativado: ' + nome);
}

function renderHiddenGestores() {
  var panel = document.getElementById('hiddenPanel');
  var list = document.getElementById('hiddenList');
  var count = document.getElementById('hiddenCount');

  if (hiddenGestores.length === 0) {
    panel.style.display = 'none';
    return;
  }

  panel.style.display = 'block';
  count.textContent = hiddenGestores.length;

  var html = '';
  hiddenGestores.forEach(function(nome) {
    html += '<span class="hidden-tag">';
    html += esc(nome);
    html += ' <button onclick="showGestor(\'' + esc(nome) + '\')" title="Reativar">+</button>';
    html += '</span>';
  });
  list.innerHTML = html;
}


// ─── FILTRO DE CIDADE ───────────────────────────────────────
function updateCidadeFilter() {
  var select = document.getElementById('filterCidade');
  var cidades = [];
  DATA.forEach(function(g) {
    if (g.cidade && cidades.indexOf(g.cidade) === -1) {
      cidades.push(g.cidade);
    }
  });
  cidades.sort();

  var html = '<option value="">Todas as cidades</option>';
  cidades.forEach(function(c) {
    html += '<option value="' + esc(c) + '">' + esc(c) + '</option>';
  });
  select.innerHTML = html;
}

// ─── BUSCAR VENDAS (ASSOCIADOS) ─────────────────────────────
async function buscarVendas(page) {
  if (!sessionCookie) { showLoginModal(); return; }

  vendasPage = page || 0;
  var start = vendasPage * 50;

  try {
    var res = await edgeCall({
      action: 'vendas',
      session_cookie: sessionCookie,
      start: start,
      length: 50,
      situacao: document.getElementById('fVendasSituacao').value || undefined,
      tipo_data: document.getElementById('fVendasTipoData').value,
      data_inicial: document.getElementById('fVendasDataInicial').value,
      data_final: document.getElementById('fVendasDataFinal').value,
      campo_pesquisa: document.getElementById('fVendasCampoPesquisa').value || undefined,
      search: document.getElementById('fVendasSearch').value || undefined
    });

    if (res.success && res.data) {
      vendasTotal = parseInt(res.data.recordsFiltered) || 0;
      document.getElementById('kpiVendasTotal').textContent = formatNum(parseInt(res.data.recordsTotal) || 0);
      document.getElementById('kpiVendasFiltrados').textContent = formatNum(vendasTotal);
      renderVendasTable(res.data.data || []);
      renderVendasPagination();
    }
  } catch (e) {
    alert('Erro ao buscar vendas: ' + e.message);
  }
}

function renderVendasTable(data) {
  var tbody = document.getElementById('vendasBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhum resultado</td></tr>';
    return;
  }

  var html = '';
  data.forEach(function(r, i) {
    var sit = r.VendasSituacao || '';
    var badgeClass = sit === 'Ativo' ? 'badge-ativo' :
                     sit === 'Cancelado' ? 'badge-cancelado' :
                     sit === 'Suspenso' ? 'badge-suspenso' : 'badge-novo';
    html += '<tr>';
    html += '<td>' + (vendasPage * 50 + i + 1) + '</td>';
    html += '<td>' + esc(r.ClientesIndividuosNome || '') + '</td>';
    html += '<td>' + formatCPF(r.ClientesIndividuosDocumento || '') + '</td>';
    html += '<td>' + esc(r.VendasCarrosPlaca || '') + '</td>';
    html += '<td>' + esc(r.VendasCarrosModelosNome || '') + '</td>';
    html += '<td>' + esc(r.VendasCarrosCategoriasPlanosNome || '') + '</td>';
    html += '<td><span class="badge ' + badgeClass + '">' + esc(sit) + '</span></td>';
    html += '<td>' + esc(r.ConsultoresNome || '') + '</td>';
    html += '<td>' + esc(r.ConsultoresCentroCustoNome || '') + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}


function renderVendasPagination() {
  var totalPages = Math.ceil(vendasTotal / 50);
  var div = document.getElementById('vendasPagination');
  if (totalPages <= 1) { div.innerHTML = ''; return; }

  var html = '';
  html += '<button ' + (vendasPage === 0 ? 'disabled' : '') + ' onclick="buscarVendas(' + (vendasPage - 1) + ')">Anterior</button>';

  var start = Math.max(0, vendasPage - 3);
  var end = Math.min(totalPages, vendasPage + 4);

  for (var p = start; p < end; p++) {
    html += '<button class="' + (p === vendasPage ? 'active' : '') + '" onclick="buscarVendas(' + p + ')">' + (p + 1) + '</button>';
  }

  html += '<button ' + (vendasPage >= totalPages - 1 ? 'disabled' : '') + ' onclick="buscarVendas(' + (vendasPage + 1) + ')">Proximo</button>';
  div.innerHTML = html;
}

// ─── BUSCAR FLUXO DE CAIXA ──────────────────────────────────
// Busca dados agrupados por dia de vencimento (05, 10, 15, 20, 25, 30)
async function buscarFluxoCaixa() {
  var mes = document.getElementById('fFluxoMes').value;
  var ano = document.getElementById('fFluxoAno').value;

  if (!mes || !ano) {
    alert('Selecione mes e ano');
    return;
  }

  var dataInicial = ano + '-' + mes + '-01';
  // Ultimo dia do mes
  var lastDay = new Date(parseInt(ano), parseInt(mes), 0).getDate();
  var dataFinal = ano + '-' + mes + '-' + String(lastDay).padStart(2, '0');
  var fluxoHash = 'fluxo|' + dataInicial + '|' + dataFinal + '|FaturasDataVencimento|';

  // Mostrar loading
  document.getElementById('kpiFluxoTotal').textContent = '...';
  document.getElementById('kpiFluxoPago').textContent = '...';
  document.getElementById('kpiFluxoAberto').textContent = '...';
  document.getElementById('kpiFluxoCancelado').textContent = '...';
  document.getElementById('kpiFluxoQtd').textContent = '...';
  document.getElementById('fluxoVencimentos').innerHTML = '<div class="empty-state" style="padding:40px;text-align:center">Carregando...</div>';

  // 1. Verificar cache no Supabase DB
  try {
    // Hash exato
    var dbCache = await sbFetch(
      'relatorios_cache?filtro_hash=eq.' + encodeURIComponent(fluxoHash) + '&select=dados,updated_at'
    );
    // Se nao encontrou, buscar por tipo fluxo-caixa do mesmo mes
    if (!dbCache || dbCache.length === 0) {
      dbCache = await sbFetch(
        'relatorios_cache?tipo_relatorio=eq.fluxo-caixa&data_inicial=gte.' + dataInicial + '&data_inicial=lte.' + dataFinal + '&select=dados,updated_at&order=updated_at.desc&limit=1'
      );
    }
    if (dbCache && dbCache.length > 0) {
      var cached = dbCache[0];
      var age = Date.now() - new Date(cached.updated_at).getTime();
      if (age < 24 * 60 * 60 * 1000 && cached.dados) {
        console.log('[Aurora] Fluxo de caixa: cache encontrado');
        renderFluxoVencimentos(cached.dados, mes, ano);
        return;
      }
    }
  } catch (e) {
    console.warn('[Aurora] Fluxo cache check erro:', e.message);
  }

  // 2. Sem cache disponivel
  document.getElementById('kpiFluxoTotal').textContent = '-';
  document.getElementById('kpiFluxoPago').textContent = '-';
  document.getElementById('kpiFluxoAberto').textContent = '-';
  document.getElementById('kpiFluxoCancelado').textContent = '-';
  document.getElementById('kpiFluxoQtd').textContent = '-';
  document.getElementById('fluxoVencimentos').innerHTML = '<div class="empty-state" style="padding:40px;text-align:center">Dados sendo atualizados automaticamente (cron a cada hora).<br>Tente novamente em alguns minutos.</div>';
}

// ─── RENDERIZAR FLUXO POR VENCIMENTOS ───────────────────────
function renderFluxoVencimentos(cacheData, mes, ano) {
  var totais = cacheData.totais || {};
  var dados = cacheData.dados || [];

  // KPIs gerais
  document.getElementById('kpiFluxoTotal').textContent = formatMoney(totais.ValorTotal || 0);
  document.getElementById('kpiFluxoPago').textContent = formatMoney(totais.ValorPago || 0);
  document.getElementById('kpiFluxoAberto').textContent = formatMoney(totais.ValorAberto || 0);
  document.getElementById('kpiFluxoCancelado').textContent = formatMoney(totais.ValorCancelado || 0);
  document.getElementById('kpiFluxoQtd').textContent = formatNum(totais.Quantidade || 0);

  // Titulo
  var mesesNomes = ['Janeiro','Fevereiro','Marco','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  var mesIdx = parseInt(mes) - 1;
  document.getElementById('fluxoTitulo').textContent = 'Contribuicao Mensal - ' + mesesNomes[mesIdx] + '/' + ano;

  // Agrupar faturas por dia de vencimento
  var vencimentos = {}; // { "05": { total, pago, aberto, cancelado, qtd }, ... }
  var diasPadrao = ['05', '10', '15', '20', '25', '30'];

  // Inicializar dias padrao
  diasPadrao.forEach(function(dia) {
    vencimentos[dia] = { total: 0, pago: 0, aberto: 0, cancelado: 0, qtd: 0 };
  });

  // Agrupar dados das faturas
  dados.forEach(function(fatura) {
    var dataVenc = fatura.FaturasDataVencimento || '';
    var dia = '';

    // Extrair dia do vencimento (pode ser "DD/MM/YYYY" ou "YYYY-MM-DD")
    if (dataVenc.indexOf('/') !== -1) {
      dia = dataVenc.substring(0, 2);
    } else if (dataVenc.indexOf('-') !== -1) {
      dia = dataVenc.substring(8, 10);
    }

    // Arredondar para o dia padrao mais proximo
    var diaNum = parseInt(dia) || 0;
    var diaPadrao = '05';
    if (diaNum <= 7) diaPadrao = '05';
    else if (diaNum <= 12) diaPadrao = '10';
    else if (diaNum <= 17) diaPadrao = '15';
    else if (diaNum <= 22) diaPadrao = '20';
    else if (diaNum <= 27) diaPadrao = '25';
    else diaPadrao = '30';

    if (!vencimentos[diaPadrao]) {
      vencimentos[diaPadrao] = { total: 0, pago: 0, aberto: 0, cancelado: 0, qtd: 0 };
    }

    var valor = parseFloat(fatura.FaturasValor) || 0;
    var valorPago = parseFloat(fatura.FaturasValorPago) || 0;
    var situacao = (fatura.Situacao || '').toLowerCase();

    vencimentos[diaPadrao].total += valor;
    vencimentos[diaPadrao].qtd += 1;

    if (situacao === 'pago' || situacao === 'paid') {
      vencimentos[diaPadrao].pago += valorPago || valor;
    } else if (situacao === 'cancelado' || situacao === 'cancelled') {
      vencimentos[diaPadrao].cancelado += valor;
    } else {
      vencimentos[diaPadrao].aberto += valor;
    }
  });

  // Se nao tem dados detalhados mas tem totais, distribuir proporcionalmente
  var temDadosDetalhados = dados.length > 0;
  if (!temDadosDetalhados && totais.Quantidade > 0) {
    // Distribuir igualmente entre os 6 vencimentos (aproximacao)
    var perVenc = totais.Quantidade / 6;
    diasPadrao.forEach(function(dia) {
      vencimentos[dia] = {
        total: (totais.ValorTotal || 0) / 6,
        pago: (totais.ValorPago || 0) / 6,
        aberto: (totais.ValorAberto || 0) / 6,
        cancelado: (totais.ValorCancelado || 0) / 6,
        qtd: Math.round(perVenc)
      };
    });
  }

  // Renderizar cards de vencimento
  var html = '';
  diasPadrao.forEach(function(dia) {
    var v = vencimentos[dia];
    if (!v || v.qtd === 0) return; // Pular vencimentos vazios

    html += '<div class="fluxo-venc-card">';
    html += '<div class="fluxo-venc-header">Vencimento ' + dia + '/' + mes + '</div>';
    html += '<table class="fluxo-venc-table">';
    html += '<thead><tr>';
    html += '<th>Total</th><th>Pagos</th><th>Aberto</th><th>Cancelado</th><th>Qnt Faturas</th>';
    html += '</tr></thead>';
    html += '<tbody><tr>';
    html += '<td>' + formatMoney(v.total) + '</td>';
    html += '<td class="fluxo-val-pago">' + formatMoney(v.pago) + '</td>';
    html += '<td class="fluxo-val-aberto">' + formatMoney(v.aberto) + '</td>';
    html += '<td class="fluxo-val-cancelado">' + formatMoney(v.cancelado) + '</td>';
    html += '<td>' + formatNum(v.qtd) + '</td>';
    html += '</tr></tbody>';
    html += '</table>';
    html += '</div>';
  });

  if (!html) {
    html = '<div class="empty-state" style="padding:40px;text-align:center">Nenhum dado de vencimento disponivel para este periodo</div>';
  }

  document.getElementById('fluxoVencimentos').innerHTML = html;
}

// Renderizar fluxo a partir de dados do cache (compatibilidade)
function renderFluxoFromCache(cacheData) {
  var hoje = new Date();
  var mes = String(hoje.getMonth() + 1).padStart(2, '0');
  var ano = String(hoje.getFullYear());
  renderFluxoVencimentos(cacheData, mes, ano);
}

// ─── BUSCAR CONSULTORES ─────────────────────────────────────
async function buscarConsultores() {
  if (!sessionCookie) { showLoginModal(); return; }

  try {
    var res = await edgeCall({
      action: 'consultores',
      session_cookie: sessionCookie,
      start: 0,
      length: 100,
      situacao: document.getElementById('fConsultoresSituacao').value || undefined,
      tipo_consultor: document.getElementById('fConsultoresTipo').value || undefined,
      centro_custo: document.getElementById('fConsultoresCentro').value || undefined
    });

    if (res.success && res.data) {
      renderConsultoresTable(res.data.data || []);
    }
  } catch (e) {
    alert('Erro ao buscar consultores: ' + e.message);
  }
}

function renderConsultoresTable(data) {
  var tbody = document.getElementById('consultoresBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum consultor encontrado</td></tr>';
    return;
  }

  var html = '';
  data.forEach(function(r, i) {
    var sit = r.ConsultoresSituacaoCadastro || '';
    var badgeClass = sit === 'Ativo' ? 'badge-ativo' :
                     sit === 'Cancelado' ? 'badge-cancelado' :
                     sit === 'Suspenso' ? 'badge-suspenso' : 'badge-novo';
    html += '<tr>';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td>' + esc(r.IndividuosNome || '') + '</td>';
    html += '<td>' + formatCPF(r.IndividuosDocumento || '') + '</td>';
    html += '<td>' + esc(r.ConsultoresTipoConsultor || '') + '</td>';
    html += '<td><span class="badge ' + badgeClass + '">' + esc(sit) + '</span></td>';
    html += '<td>' + esc(r.IndividuosEnderecosCidadesNome || '') + '</td>';
    html += '<td>' + esc((r.IndividuosContatosDdd || '') + ' ' + (r.IndividuosContatosTelefone || '')) + '</td>';
    html += '<td>' + esc(r.IndividuosEmail || '') + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}


// ─── UTILITARIOS ────────────────────────────────────────────
function formatNum(n) {
  if (n === null || n === undefined) return '-';
  return n.toLocaleString('pt-BR');
}

function formatMoney(n) {
  if (n === null || n === undefined || isNaN(n)) return '-';
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCPF(cpf) {
  if (!cpf || cpf.length < 11) return cpf || '';
  cpf = cpf.replace(/\D/g, '');
  if (cpf.length === 11) {
    return cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  if (cpf.length === 14) {
    return cpf.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  }
  return cpf;
}

function esc(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}

// ─── FIM ────────────────────────────────────────────────────



// ═══════════════════════════════════════════════════════════════════════════
// DETALHAMENTO ANUAL - Tabela com evolucao mensal
// Cada linha = gestor ou consultor
// Colunas = meses do ano (Cotacoes, Concretizadas, Taxa Conversao, Ticket Medio)
// Setas verdes (maior que mes anterior) / vermelhas (menor)
// ═══════════════════════════════════════════════════════════════════════════

var DETALHE_DATA = {}; // { '2026-01': [...], '2026-02': [...], ... }
var DETALHE_GESTORES = []; // lista de nomes unicos de gestores/consultores
var DETALHE_ANO_ATUAL = '';

var MESES_NOMES = ['Janeiro', 'Fevereiro', 'Marco', 'Abril', 'Maio', 'Junho',
                   'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
var MESES_ABREV = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
                   'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

// ─── INICIALIZAR ABA DETALHAMENTO ───────────────────────────
// Chamado quando a aba e ativada pela primeira vez ou apos switchTab
(function initDetalhamento() {
  // Popular select de anos ao carregar
  popularAnosDisponiveis();
})();

// ─── POPULAR ANOS DISPONIVEIS NO DB ─────────────────────────
async function popularAnosDisponiveis() {
  try {
    var res = await sbFetch(
      'relatorios_cache?select=data_inicial&order=data_inicial.asc'
    );
    if (!res || res.length === 0) return;

    var anos = [];
    res.forEach(function(r) {
      if (r.data_inicial) {
        var ano = r.data_inicial.substring(0, 4);
        if (anos.indexOf(ano) === -1) anos.push(ano);
      }
    });

    var select = document.getElementById('fDetalheAno');
    if (!select) return;

    var anoAtual = new Date().getFullYear().toString();
    var html = '';
    // Ordem decrescente (ano mais recente primeiro)
    anos.sort().reverse().forEach(function(ano) {
      var selected = (ano === anoAtual) ? ' selected' : '';
      html += '<option value="' + ano + '"' + selected + '>' + ano + '</option>';
    });
    select.innerHTML = html;

    DETALHE_ANO_ATUAL = select.value;
  } catch (e) {
    console.warn('[Aurora] Erro ao popular anos:', e.message);
  }
}

// ─── CARREGAR DETALHAMENTO ──────────────────────────────────
async function carregarDetalhamento() {
  var selectAno = document.getElementById('fDetalheAno');
  var selectGestor = document.getElementById('fDetalheGestor');
  var info = document.getElementById('detalheInfo');

  if (!selectAno || !selectAno.value) {
    info.textContent = 'Selecione um ano';
    return;
  }

  var ano = selectAno.value;
  DETALHE_ANO_ATUAL = ano;
  info.textContent = 'Carregando dados de ' + ano + '...';

  try {
    // Buscar todos os registros do ano no DB (1 query)
    var firstDay = ano + '-01-01';
    var lastDay = ano + '-12-31';

    var dbResults = await sbFetch(
      'relatorios_cache?data_inicial=gte.' + firstDay + '&data_inicial=lte.' + lastDay + '&select=dados,data_inicial,data_final&order=data_inicial.asc'
    );

    if (!dbResults || dbResults.length === 0) {
      info.textContent = 'Nenhum dado encontrado para ' + ano;
      document.getElementById('detalheBody').innerHTML = '<tr><td colspan="1" class="empty-state">Nenhum dado no banco para o ano ' + ano + '</td></tr>';
      return;
    }

    // Organizar por mes
    DETALHE_DATA = {};
    dbResults.forEach(function(r) {
      if (r.dados && r.data_inicial) {
        var mesKey = r.data_inicial.substring(0, 7); // "2026-01"
        DETALHE_DATA[mesKey] = r.dados;
      }
    });

    // Extrair lista de gestores/consultores unicos (incluindo membros de equipe)
    extrairGestoresDetalhamento();

    // Buscar cidades reais do cadastro dos consultores
    await carregarCidadesConsultores();

    // Popular filtro de gestor
    popularFiltroGestorDetalhe();

    // Renderizar tabela
    renderDetalhamento();

    var mesesCarregados = Object.keys(DETALHE_DATA).length;
    info.textContent = ano + ' | ' + mesesCarregados + ' meses carregados | ' + DETALHE_GESTORES.length + ' gestores/consultores';

  } catch (e) {
    console.error('[Aurora] Erro carregarDetalhamento:', e);
    info.textContent = 'Erro ao carregar: ' + e.message;
  }
}

// ─── CARREGAR CIDADES REAIS DOS CONSULTORES ─────────────────
// Busca cidade do cadastro (IndividuosEnderecosCidadesNome) via Edge Function
// e atualiza DETALHE_GESTORES e dados no cache com a cidade correta
var CIDADES_CONSULTORES = {}; // cache local: nome_upper -> cidade

async function carregarCidadesConsultores() {
  // Se ja temos o cache de cidades, apenas aplicar
  if (Object.keys(CIDADES_CONSULTORES).length > 0) {
    aplicarCidadesConsultores();
    return;
  }

  try {
    // Buscar todos os consultores ativos (tipo gestor = lideres) via Edge Function
    var res = await edgeCall({
      action: 'consultores',
      start: 0,
      length: 5000,
      situacao: '2',
      tipo_consultor: '5'
    });

    if (res.success && res.data && res.data.data) {
      res.data.data.forEach(function(c) {
        var nome = (c.IndividuosNome || '').trim().toUpperCase();
        var cidade = c.IndividuosEnderecosCidadesNome || '';
        if (nome && cidade) {
          CIDADES_CONSULTORES[nome] = cidade;
        }
      });
    }

    // Tambem buscar consultores normais (tipo 1) para membros de equipe
    var res2 = await edgeCall({
      action: 'consultores',
      start: 0,
      length: 5000,
      situacao: '2',
      tipo_consultor: '1'
    });

    if (res2.success && res2.data && res2.data.data) {
      res2.data.data.forEach(function(c) {
        var nome = (c.IndividuosNome || '').trim().toUpperCase();
        var cidade = c.IndividuosEnderecosCidadesNome || '';
        if (nome && cidade && !CIDADES_CONSULTORES[nome]) {
          CIDADES_CONSULTORES[nome] = cidade;
        }
      });
    }

    console.log('[Aurora] Cidades carregadas para ' + Object.keys(CIDADES_CONSULTORES).length + ' consultores');
    aplicarCidadesConsultores();
  } catch (e) {
    console.warn('[Aurora] Erro ao carregar cidades:', e.message);
    // Continuar sem cidades reais
  }
}

function aplicarCidadesConsultores() {
  // Atualizar DETALHE_GESTORES com cidade real
  DETALHE_GESTORES.forEach(function(g) {
    var cidadeReal = CIDADES_CONSULTORES[g.nome.toUpperCase()];
    if (cidadeReal) {
      g.cidade = cidadeReal;
    }
  });
  // Tambem atualizar dados do DATA (aba Acompanhamento) se disponivel
  if (DATA && DATA.length > 0) {
    aplicarCidadesNosGestores(DATA);
  }
}

// ─── EXTRAIR GESTORES UNICOS ────────────────────────────────
function extrairGestoresDetalhamento() {
  var nomes = {};

  Object.keys(DETALHE_DATA).forEach(function(mes) {
    var dados = DETALHE_DATA[mes];
    if (!Array.isArray(dados)) return;

    dados.forEach(function(g) {
      var key = g.gestor.toUpperCase();
      if (!nomes[key]) {
        nomes[key] = { nome: g.gestor, cidade: g.cidade, tipo: 'gestor' };
      }
      // Tambem incluir membros da equipe
      if (g.equipe && g.equipe.length > 0) {
        g.equipe.forEach(function(m) {
          var mKey = m.gestor.toUpperCase();
          if (!nomes[mKey]) {
            nomes[mKey] = { nome: m.gestor, cidade: m.cidade, tipo: 'consultor' };
          }
        });
      }
    });
  });

  DETALHE_GESTORES = Object.keys(nomes).sort().map(function(k) {
    return nomes[k];
  });
}

// ─── POPULAR FILTRO DE GESTOR ───────────────────────────────
function popularFiltroGestorDetalhe() {
  var select = document.getElementById('fDetalheGestor');
  if (!select) return;

  var valorAtual = select.value;
  var html = '<option value="">Todos</option>';

  DETALHE_GESTORES.forEach(function(g) {
    var label = g.nome + (g.cidade ? ' (' + g.cidade + ')' : '');
    var sel = (g.nome === valorAtual) ? ' selected' : '';
    html += '<option value="' + esc(g.nome) + '"' + sel + '>' + esc(label) + '</option>';
  });

  select.innerHTML = html;
}

// ─── OBTER DADOS DE UM GESTOR/CONSULTOR EM UM MES ───────────
// Retorna { cotacoes, concretizadas, taxa_conversao, ticket_medio } ou null
// soGestor=true retorna apenas dados individuais do gestor (sem somar equipe)
function getDadosMesIndividuo(mesKey, nome, soGestor) {
  var dados = DETALHE_DATA[mesKey];
  if (!dados || !Array.isArray(dados)) return null;

  var nomeUpper = nome.toUpperCase();

  // Procurar como gestor principal
  for (var i = 0; i < dados.length; i++) {
    var g = dados[i];
    if (g.gestor.toUpperCase() === nomeUpper) {
      if (soGestor) {
        // Apenas dados individuais do gestor
        var gCot = g.cot_qtd || 0;
        var gAti = g.ati_qtd || 0;
        var gValor = g.ati_valor || 0;
        var gTaxa = gCot > 0 ? ((gAti / gCot) * 100) : 0;
        var gTicket = gAti > 0 ? (gValor / gAti) : 0;
        return {
          cotacoes: gCot,
          concretizadas: gAti,
          taxa_conversao: gTaxa,
          ticket_medio: gTicket
        };
      }
      // Totais (gestor + equipe)
      var totalCot = g.cot_qtd || 0;
      var totalAti = g.ati_qtd || 0;
      var totalValor = g.ati_valor || 0;
      if (g.equipe && g.equipe.length > 0) {
        g.equipe.forEach(function(m) {
          totalCot += m.cot_qtd || 0;
          totalAti += m.ati_qtd || 0;
          totalValor += m.ati_valor || 0;
        });
      }
      var taxa = totalCot > 0 ? ((totalAti / totalCot) * 100) : 0;
      var ticket = totalAti > 0 ? (totalValor / totalAti) : 0;
      return {
        cotacoes: totalCot,
        concretizadas: totalAti,
        taxa_conversao: taxa,
        ticket_medio: ticket
      };
    }
  }

  // Procurar como membro de equipe
  for (var i = 0; i < dados.length; i++) {
    var g = dados[i];
    if (g.equipe && g.equipe.length > 0) {
      for (var j = 0; j < g.equipe.length; j++) {
        var m = g.equipe[j];
        if (m.gestor.toUpperCase() === nomeUpper) {
          var mCot = m.cot_qtd || 0;
          var mAti = m.ati_qtd || 0;
          var mValor = m.ati_valor || 0;
          var mTaxa = mCot > 0 ? ((mAti / mCot) * 100) : 0;
          var mTicket = mAti > 0 ? (mValor / mAti) : 0;
          return {
            cotacoes: mCot,
            concretizadas: mAti,
            taxa_conversao: mTaxa,
            ticket_medio: mTicket
          };
        }
      }
    }
  }

  return null;
}

// ─── OBTER MEMBROS DA EQUIPE DE UM GESTOR ───────────────────
// Retorna lista unica de nomes de membros (de todos os meses)
function getEquipeMembros(nomeGestor) {
  var membros = {};
  var nomeUpper = nomeGestor.toUpperCase();

  Object.keys(DETALHE_DATA).forEach(function(mesKey) {
    var dados = DETALHE_DATA[mesKey];
    if (!Array.isArray(dados)) return;

    for (var i = 0; i < dados.length; i++) {
      var g = dados[i];
      if (g.gestor.toUpperCase() === nomeUpper && g.equipe && g.equipe.length > 0) {
        g.equipe.forEach(function(m) {
          var mKey = m.gestor.toUpperCase();
          if (!membros[mKey]) {
            membros[mKey] = { nome: m.gestor, cidade: m.cidade || '' };
          }
        });
      }
    }
  });

  return Object.keys(membros).sort().map(function(k) { return membros[k]; });
}

// ─── RENDERIZAR TABELA DETALHAMENTO ─────────────────────────
function renderDetalhamento() {
  var meses = Object.keys(DETALHE_DATA).sort(); // ["2026-01", "2026-02", ...]
  if (meses.length === 0) return;

  var filtroGestor = document.getElementById('fDetalheGestor') ? document.getElementById('fDetalheGestor').value : '';

  // Determinar quais gestores mostrar
  var gestoresExibir;
  if (filtroGestor) {
    gestoresExibir = DETALHE_GESTORES.filter(function(g) {
      return g.nome === filtroGestor;
    });
  } else {
    // Mostrar apenas gestores (lideres), nao consultores individuais (para nao poluir)
    gestoresExibir = DETALHE_GESTORES.filter(function(g) {
      return g.tipo === 'gestor';
    });
  }

  // Ordenar por nome alfabeticamente (A-Z)
  gestoresExibir.sort(function(a, b) {
    return a.nome.localeCompare(b.nome);
  });
  var theadHtml = '<tr class="detalhe-header-row">';
  theadHtml += '<th class="detalhe-col-fixa" rowspan="2">Equipe<br><small>Gestor/Consultor</small></th>';
  meses.forEach(function(mesKey) {
    var mesIdx = parseInt(mesKey.substring(5, 7)) - 1;
    theadHtml += '<th colspan="4" class="detalhe-mes-header">' + MESES_NOMES[mesIdx] + '</th>';
  });
  theadHtml += '</tr>';

  // Sub-header com campos
  theadHtml += '<tr class="detalhe-subheader-row">';
  meses.forEach(function() {
    theadHtml += '<th class="detalhe-sub-col">Cotacoes</th>';
    theadHtml += '<th class="detalhe-sub-col">Concretizadas</th>';
    theadHtml += '<th class="detalhe-sub-col">Taxa Conversao</th>';
    theadHtml += '<th class="detalhe-sub-col">Ticket Medio</th>';
  });
  theadHtml += '</tr>';

  document.getElementById('detalheThead').innerHTML = theadHtml;

  // ─── BODY ───
  var tbodyHtml = '';
  var totalCols = 1 + meses.length * 4;

  gestoresExibir.forEach(function(gestorInfo, idx) {
    // Row principal do gestor (totais gestor+equipe) - clicavel
    tbodyHtml += '<tr class="detalhe-row detalhe-row-gestor" onclick="toggleDetalheEquipe(' + idx + ')">';
    tbodyHtml += '<td class="detalhe-col-fixa detalhe-nome">';
    tbodyHtml += '<strong>' + esc(gestorInfo.nome) + '</strong>';
    if (gestorInfo.cidade) {
      tbodyHtml += '<br><small class="detalhe-cidade">' + esc(gestorInfo.cidade) + '</small>';
    }
    tbodyHtml += '</td>';

    var prevDados = null;

    meses.forEach(function(mesKey) {
      var dados = getDadosMesIndividuo(mesKey, gestorInfo.nome, false);

      if (dados) {
        tbodyHtml += '<td class="detalhe-cell">';
        tbodyHtml += '<span class="detalhe-valor">' + formatNum(dados.cotacoes) + '</span>';
        tbodyHtml += getArrow(prevDados ? prevDados.cotacoes : null, dados.cotacoes);
        tbodyHtml += '</td>';

        tbodyHtml += '<td class="detalhe-cell">';
        tbodyHtml += '<span class="detalhe-valor">' + formatNum(dados.concretizadas) + '</span>';
        tbodyHtml += getArrow(prevDados ? prevDados.concretizadas : null, dados.concretizadas);
        tbodyHtml += '</td>';

        tbodyHtml += '<td class="detalhe-cell">';
        tbodyHtml += '<span class="detalhe-valor">' + dados.taxa_conversao.toFixed(2) + '%</span>';
        tbodyHtml += getArrow(prevDados ? prevDados.taxa_conversao : null, dados.taxa_conversao);
        tbodyHtml += '</td>';

        tbodyHtml += '<td class="detalhe-cell">';
        tbodyHtml += '<span class="detalhe-valor">' + formatMoney(dados.ticket_medio) + '</span>';
        tbodyHtml += getArrow(prevDados ? prevDados.ticket_medio : null, dados.ticket_medio);
        tbodyHtml += '</td>';

        prevDados = dados;
      } else {
        tbodyHtml += '<td class="detalhe-cell detalhe-empty">-</td>';
        tbodyHtml += '<td class="detalhe-cell detalhe-empty">-</td>';
        tbodyHtml += '<td class="detalhe-cell detalhe-empty">-</td>';
        tbodyHtml += '<td class="detalhe-cell detalhe-empty">-</td>';
      }
    });
    tbodyHtml += '</tr>';

    // Row expansivel com equipe (oculta por padrao)
    tbodyHtml += '<tr class="detalhe-equipe-row" id="detalhe-equipe-' + idx + '">';
    tbodyHtml += '<td colspan="' + totalCols + '" class="detalhe-equipe-cell">';
    tbodyHtml += '<div class="detalhe-equipe-content" id="detalhe-equipe-content-' + idx + '">';
    tbodyHtml += '</div>';
    tbodyHtml += '</td>';
    tbodyHtml += '</tr>';
  });

  if (!tbodyHtml) {
    tbodyHtml = '<tr><td colspan="' + totalCols + '" class="empty-state">Nenhum gestor encontrado</td></tr>';
  }

  document.getElementById('detalheBody').innerHTML = tbodyHtml;
}

// ─── TOGGLE EQUIPE NO DETALHAMENTO ──────────────────────────
function toggleDetalheEquipe(idx) {
  var row = document.getElementById('detalhe-equipe-' + idx);
  if (!row) return;

  var isVisible = row.classList.contains('visible');
  if (isVisible) {
    row.classList.remove('visible');
    return;
  }

  // Popular conteudo se ainda nao foi preenchido
  var content = document.getElementById('detalhe-equipe-content-' + idx);
  if (!content.innerHTML) {
    var gestorInfo = getGestorExibidoByIdx(idx);
    if (gestorInfo) {
      content.innerHTML = renderDetalheEquipeTabela(gestorInfo);
    }
  }

  row.classList.add('visible');
}

// ─── OBTER GESTOR PELO INDICE ───────────────────────────────
function getGestorExibidoByIdx(idx) {
  var filtroGestor = document.getElementById('fDetalheGestor') ? document.getElementById('fDetalheGestor').value : '';
  var gestoresExibir;
  if (filtroGestor) {
    gestoresExibir = DETALHE_GESTORES.filter(function(g) { return g.nome === filtroGestor; });
  } else {
    gestoresExibir = DETALHE_GESTORES.filter(function(g) { return g.tipo === 'gestor'; });
  }
  return gestoresExibir[idx] || null;
}

// ─── RENDERIZAR SUB-TABELA DA EQUIPE ────────────────────────
function renderDetalheEquipeTabela(gestorInfo) {
  var meses = Object.keys(DETALHE_DATA).sort();
  var membros = getEquipeMembros(gestorInfo.nome);

  // Ordenar membros por nome alfabeticamente (A-Z)
  membros.sort(function(a, b) {
    return a.nome.localeCompare(b.nome);
  });

  var html = '<div class="detalhe-equipe-scroll">';
  html += '<table class="detalhe-equipe-table">';

  // Header da sub-tabela
  html += '<thead><tr>';
  html += '<th class="detalhe-eq-col-nome">#</th>';
  html += '<th class="detalhe-eq-col-nome">Membro</th>';
  meses.forEach(function(mesKey) {
    var mesIdx = parseInt(mesKey.substring(5, 7)) - 1;
    html += '<th colspan="4" class="detalhe-eq-mes">' + MESES_ABREV[mesIdx] + '</th>';
  });
  html += '</tr>';

  // Sub-header
  html += '<tr>';
  html += '<th></th><th></th>';
  meses.forEach(function() {
    html += '<th class="detalhe-eq-sub">Cot</th>';
    html += '<th class="detalhe-eq-sub">Conc</th>';
    html += '<th class="detalhe-eq-sub">Taxa</th>';
    html += '<th class="detalhe-eq-sub">Ticket</th>';
  });
  html += '</tr></thead>';

  html += '<tbody>';

  // Primeira linha: o proprio gestor (valores individuais, destacado em verde)
  html += '<tr class="detalhe-eq-gestor-row">';
  html += '<td></td>';
  html += '<td class="detalhe-eq-nome-cell"><strong>' + esc(gestorInfo.nome) + '</strong></td>';
  meses.forEach(function(mesKey) {
    var d = getDadosMesIndividuo(mesKey, gestorInfo.nome, true);
    if (d) {
      html += '<td class="detalhe-eq-val">' + formatNum(d.cotacoes) + '</td>';
      html += '<td class="detalhe-eq-val">' + formatNum(d.concretizadas) + '</td>';
      html += '<td class="detalhe-eq-val">' + d.taxa_conversao.toFixed(2) + '%</td>';
      html += '<td class="detalhe-eq-val">' + formatMoney(d.ticket_medio) + '</td>';
    } else {
      html += '<td class="detalhe-eq-val">-</td><td class="detalhe-eq-val">-</td>';
      html += '<td class="detalhe-eq-val">-</td><td class="detalhe-eq-val">-</td>';
    }
  });
  html += '</tr>';

  // Membros da equipe
  membros.forEach(function(membro, i) {
    html += '<tr class="detalhe-eq-membro-row">';
    html += '<td class="detalhe-eq-num">' + (i + 1) + '</td>';
    html += '<td class="detalhe-eq-nome-cell">' + esc(membro.nome) + '</td>';
    meses.forEach(function(mesKey) {
      var d = getDadosMesIndividuo(mesKey, membro.nome, false);
      if (d) {
        html += '<td class="detalhe-eq-val">' + formatNum(d.cotacoes) + '</td>';
        html += '<td class="detalhe-eq-val">' + formatNum(d.concretizadas) + '</td>';
        html += '<td class="detalhe-eq-val">' + d.taxa_conversao.toFixed(2) + '%</td>';
        html += '<td class="detalhe-eq-val">' + formatMoney(d.ticket_medio) + '</td>';
      } else {
        html += '<td class="detalhe-eq-val">-</td><td class="detalhe-eq-val">-</td>';
        html += '<td class="detalhe-eq-val">-</td><td class="detalhe-eq-val">-</td>';
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  html += '<div class="detalhe-eq-info">' + membros.length + ' membros na equipe</div>';
  html += '</div>';

  return html;
}

// ─── SETA DE EVOLUCAO ───────────────────────────────────────
// Compara valor atual com mes anterior
// Verde (seta pra cima) = maior | Vermelho (seta pra baixo) = menor | Nada = igual ou sem anterior
function getArrow(valorAnterior, valorAtual) {
  if (valorAnterior === null || valorAnterior === undefined) return '';
  if (valorAtual === valorAnterior) return '';

  if (valorAtual > valorAnterior) {
    return ' <span class="arrow-up" title="Maior que mes anterior">&#9650;</span>';
  } else {
    return ' <span class="arrow-down" title="Menor que mes anterior">&#9660;</span>';
  }
}

// ─── FIM DETALHAMENTO ───────────────────────────────────────
