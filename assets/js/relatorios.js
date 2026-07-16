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
  // Carregar tema
  var saved = localStorage.getItem('avp_theme');
  if (saved) document.documentElement.setAttribute('data-theme', saved);

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
  // Desativar todas
  document.querySelectorAll('.tab').forEach(function(t) { t.classList.remove('active'); });
  document.querySelectorAll('.report-panel').forEach(function(p) { p.classList.remove('active'); });
  // Ativar selecionada
  btn.classList.add('active');
  var panel = document.getElementById('panel-' + tabId);
  if (panel) panel.classList.add('active');
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
async function buscarDados(forceRefresh) {
  var btn = document.getElementById('btnBuscar');
  btn.disabled = true;

  var params = {
    tipo_data: document.getElementById('fTipoData').value,
    data_inicial: document.getElementById('fDataInicial').value,
    data_final: document.getElementById('fDataFinal').value,
    ordenar: document.getElementById('fOrdenar').value,
    campo_order: document.getElementById('fCampoOrder').value,
    centro_custo: document.getElementById('fCentroCusto').value,
    retornar_lider: document.getElementById('fRetornarLider').value
  };

  var hash = getFilterHash(params);

  // Verificar cache local apenas (se nao forcar)
  if (!forceRefresh) {
    try {
      var local = JSON.parse(localStorage.getItem('avp_cache_' + hash));
      if (local && (Date.now() - local.ts) < 30 * 60 * 1000) {
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
    console.log('[Aurora] Primeiros 1000 chars:', htmlRetornado.substring(0, 1000));

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

    // Parsear HTML dos gestores
    var gestores = parseGestoresHTML(htmlRetornado);
    console.log('[Aurora] Gestores parseados:', gestores.length);
    if (gestores.length > 0) {
      console.log('[Aurora] Primeiro gestor:', JSON.stringify(gestores[0]));
    }

    var elapsed = ((Date.now() - startTime) / 1000).toFixed(0) + 's';
    updateProgress(90, 'Encontrados ' + gestores.length + ' gestores', '', elapsed);

    // Salvar cache local
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
function parseGestoresHTML(html) {
  var parser = new DOMParser();
  var doc = parser.parseFromString(html, 'text/html');
  var rows = doc.querySelectorAll('tr');
  var gestores = [];

  rows.forEach(function(row) {
    var cells = row.querySelectorAll('td');
    if (cells.length >= 5) {
      var nome = (cells[1] || cells[0]).textContent.trim();
      if (!nome || nome === 'Total') return;

      gestores.push({
        gestor: nome,
        cidade: (cells[2] ? cells[2].textContent.trim() : ''),
        total_qtd: parseInt((cells[3] ? cells[3].textContent.trim() : '0').replace(/\D/g, '')) || 0,
        total_valor: parseFloat((cells[4] ? cells[4].textContent.trim() : '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        ticket: parseFloat((cells[5] ? cells[5].textContent.trim() : '0').replace(/[^\d.,]/g, '').replace(',', '.')) || 0,
        cancelados: parseInt((cells[6] ? cells[6].textContent.trim() : '0').replace(/\D/g, '')) || 0,
        suspensos: parseInt((cells[7] ? cells[7].textContent.trim() : '0').replace(/\D/g, '')) || 0,
        equipe: []
      });
    }
  });

  return gestores;
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
  var totalQtd = 0, totalValor = 0, totalCancel = 0;

  visible.forEach(function(g) {
    totalQtd += g.total_qtd;
    totalValor += g.total_valor;
    totalCancel += g.cancelados;
  });

  var ticketMedio = visible.length > 0 ? (totalValor / totalQtd) : 0;

  document.getElementById('kpiGestores').textContent = visible.length;
  document.getElementById('kpiAdesoes').textContent = formatNum(totalQtd);
  document.getElementById('kpiTicket').textContent = formatMoney(ticketMedio);
  document.getElementById('kpiCancelados').textContent = formatNum(totalCancel);
  document.getElementById('kpiValor').textContent = formatMoney(totalValor);
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
    html += '<tr class="row-gestor" onclick="toggleEquipe(this,' + i + ')">';
    html += '<td class="col-num">' + (i + 1) + '</td>';
    html += '<td><strong>' + esc(g.gestor) + '</strong></td>';
    html += '<td>' + esc(g.cidade) + '</td>';
    html += '<td class="col-num">' + formatNum(g.total_qtd) + '</td>';
    html += '<td class="col-num">' + formatMoney(g.total_valor) + '</td>';
    html += '<td class="col-num">' + formatMoney(g.ticket) + '</td>';
    html += '<td class="col-num">' + formatNum(g.cancelados) + '</td>';
    html += '<td class="col-num">' + formatNum(g.suspensos) + '</td>';
    html += '<td class="col-actions">';
    html += '<button class="btn btn-sm btn-danger" onclick="event.stopPropagation();hideGestor(\'' + esc(g.gestor) + '\')">Ocultar</button>';
    html += '</td>';
    html += '</tr>';

    // Linha expandivel (equipe)
    html += '<tr class="row-equipe" id="equipe-' + i + '">';
    html += '<td colspan="9">';
    html += renderEquipe(g.equipe || []);
    html += '</td></tr>';
  }

  tbody.innerHTML = html;
}


// ─── RENDER EQUIPE (sub-tabela) ─────────────────────────────
function renderEquipe(equipe) {
  if (!equipe || equipe.length === 0) {
    return '<em style="color:var(--text3)">Sem membros de equipe carregados</em>';
  }
  var html = '<table class="equipe-table">';
  html += '<thead><tr><th>Membro</th><th>Qtd</th><th>Valor</th><th>Ticket</th></tr></thead>';
  html += '<tbody>';
  equipe.forEach(function(m) {
    html += '<tr>';
    html += '<td>' + esc(m.nome) + '</td>';
    html += '<td>' + formatNum(m.qtd) + '</td>';
    html += '<td>' + formatMoney(m.valor) + '</td>';
    html += '<td>' + formatMoney(m.ticket) + '</td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// ─── EXPANDIR EQUIPE ────────────────────────────────────────
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
