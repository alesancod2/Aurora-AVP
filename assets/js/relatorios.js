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
var currentSort = { key: 'total_qtd', dir: 'desc' };
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
    tipo_data: document.getElementById('fTipoData').value,
    data_inicial: document.getElementById('fDataInicial').value,
    data_final: document.getElementById('fDataFinal').value,
    ordenar: document.getElementById('fOrdenar').value,
    campo_order: 'Quantidade',
    centro_custo: '',
    retornar_lider: document.getElementById('fRetornarLider').value
  };

  var hash = getFilterHash(params);

  // Verificar cache compartilhado no Supabase DB (se nao forcar)
  if (!forceRefresh) {
    // 1. Tentar Supabase DB (compartilhado entre todos os usuarios)
    try {
      var dbCache = await sbFetch(
        'relatorios_cache?filtro_hash=eq.' + encodeURIComponent(hash) + '&select=dados,updated_at'
      );
      console.log('[Aurora] Cache DB check:', dbCache ? dbCache.length + ' registros' : 'null/erro');
      if (dbCache && dbCache.length > 0) {
        var cached = dbCache[0];
        var age = Date.now() - new Date(cached.updated_at).getTime();
        console.log('[Aurora] Cache age:', Math.round(age / 60000) + ' min');
        if (age < 120 * 60 * 1000) {
          DATA = cached.dados;
          var minAgo = Math.round(age / 60000);
          showData('Cache DB (atualizado ' + minAgo + ' min atras)');
          btn.disabled = false;
          return;
        }
      }
    } catch (e) {
      console.warn('[Aurora] Erro ao verificar cache DB:', e.message);
    }

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
      var saveRes = await fetch(SUPABASE_URL + '/rest/v1/relatorios_cache', {
        method: 'POST',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': 'Bearer ' + SUPABASE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates'
        },
        body: JSON.stringify({
          filtro_hash: hash,
          tipo_relatorio: 'dashboard',
          data_inicial: params.data_inicial,
          data_final: params.data_final,
          dados: gestores,
          total_registros: gestores.length,
          updated_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 120 * 60 * 1000).toISOString()
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
  updateKPIs();
  renderTable(sortData(filterData(DATA)));
  updateCidadeFilter();
  document.getElementById('dataInfo').textContent = msg + ' | ' + DATA.length + ' gestores';
  renderHiddenGestores();
}


// ─── KPIs ───────────────────────────────────────────────────
function updateKPIs() {
  var visible = filterData(DATA);
  var totalCotacoes = 0, totalAtivadas = 0, totalValor = 0;

  visible.forEach(function(g) {
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
    tbody.innerHTML = '<tr><td colspan="8" class="empty-state">Nenhum resultado encontrado</td></tr>';
    return;
  }

  var html = '';
  for (var i = 0; i < ds.length; i++) {
    var g = ds[i];
    html += '<tr class="row-gestor" onclick="toggleEquipe(this,' + i + ')">';
    html += '<td class="col-num">' + (i + 1) + '</td>';
    html += '<td><strong>' + esc(g.gestor) + '</strong></td>';
    html += '<td>' + esc(g.cidade) + '</td>';
    html += '<td class="col-num">' + esc(g.taxa_conversao) + '</td>';
    html += '<td class="col-num"><strong>' + formatNum(g.ati_qtd) + '</strong></td>';
    html += '<td class="col-num">' + formatMoney(g.ati_valor) + '</td>';
    html += '<td class="col-num">' + formatMoney(g.ati_ticket) + '</td>';
    html += '<td class="col-actions">';
    html += '<button class="btn-hide" onclick="event.stopPropagation();hideGestor(\'' + esc(g.gestor) + '\')" title="Ocultar gestor">';
    html += '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';
    html += '</button>';
    html += '</td>';
    html += '</tr>';

    // Equipe (ja carregada)
    if (g.equipe && g.equipe.length > 0) {
      html += '<tr class="row-equipe visible" id="equipe-' + i + '"><td colspan="8">';
      html += renderEquipeTable(g.equipe);
      html += '</td></tr>';
    }
  }

  tbody.innerHTML = html;
}

function renderEquipeTable(membros) {
  var html = '<table class="equipe-table">';
  html += '<thead><tr><th>#</th><th>Membro</th><th>Cidade</th><th>Conv.</th>';
  html += '<th>Qtd</th><th>Valor</th><th>Ticket</th></tr></thead>';
  html += '<tbody>';
  membros.forEach(function(m, i) {
    html += '<tr>';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td>' + esc(m.gestor) + '</td>';
    html += '<td>' + esc(m.cidade) + '</td>';
    html += '<td>' + esc(m.taxa_conversao) + '</td>';
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
async function buscarFluxoCaixa() {
  if (!sessionCookie) { showLoginModal(); return; }

  try {
    var res = await edgeCall({
      action: 'fluxo-caixa',
      session_cookie: sessionCookie,
      page: 1,
      length: 100,
      data_inicial: document.getElementById('fFluxoDataInicial').value,
      data_final: document.getElementById('fFluxoDataFinal').value,
      tipo_data: document.getElementById('fFluxoTipoData').value,
      faturas_tipo: document.getElementById('fFluxoTipoFatura').value || undefined
    });

    if (res.success && res.data) {
      var d = res.data;
      if (d.totais) {
        document.getElementById('kpiFluxoTotal').textContent = formatMoney(d.totais.ValorTotal || 0);
        document.getElementById('kpiFluxoPago').textContent = formatMoney(d.totais.ValorPago || 0);
        document.getElementById('kpiFluxoAberto').textContent = formatMoney(d.totais.ValorAberto || 0);
        document.getElementById('kpiFluxoCancelado').textContent = formatMoney(d.totais.ValorCancelado || 0);
        document.getElementById('kpiFluxoQtd').textContent = formatNum(d.totais.Quantidade || 0);
      }
      renderFluxoTable(d.dados || []);
    }
  } catch (e) {
    alert('Erro ao buscar fluxo: ' + e.message);
  }
}

function renderFluxoTable(data) {
  var tbody = document.getElementById('fluxoBody');
  if (!data.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty-state">Nenhuma fatura encontrada</td></tr>';
    return;
  }

  var html = '';
  data.slice(0, 200).forEach(function(r, i) {
    var sit = r.Situacao || '';
    var badgeClass = sit === 'Pago' ? 'badge-pago' :
                     sit === 'Aberto' ? 'badge-aberto' : 'badge-cancelado';
    html += '<tr>';
    html += '<td>' + (i + 1) + '</td>';
    html += '<td>' + esc(r.IndividuosNome || '') + '</td>';
    html += '<td>' + formatCPF(r.IndividuosDocumento || '') + '</td>';
    html += '<td>' + esc(r.VendasPlaca || '') + '</td>';
    html += '<td>' + esc(r.TipoFatura || '') + '</td>';
    html += '<td>' + esc(r.FaturasDataVencimento || '') + '</td>';
    html += '<td>' + formatMoney(parseFloat(r.FaturasValor) || 0) + '</td>';
    html += '<td>' + formatMoney(parseFloat(r.FaturasValorPago) || 0) + '</td>';
    html += '<td><span class="badge ' + badgeClass + '">' + esc(sit) + '</span></td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
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
