/**
 * backstage.js — Vencendo o Divórcio Podcast
 * Painel de Backstage: Curadoria, Gerador Visual, Configuração
 */

// ============================================================
//  ESTADO GLOBAL & CONSTANTES
// ============================================================
const STORAGE_KEY    = 'vd_questions_v2';
const CONFIG_KEY     = 'vd_config_v1';
const AUTH_KEY       = 'vd_backstage_auth_v1';
const BACKSTAGE_PASS = 'VencendoDIV26';

let allQuestions   = []; // Array de objetos de pergunta
let CONFIG         = {};  // Configuração atual
let currentArtFormat = 'square';
let currentTheme     = 'champagne';
let modalCallback    = null;

// Dimensões dos formatos de arte
const ART_FORMATS = {
  square:     { w: 1080, h: 1080, label: 'Feed 1:1' },
  vertical:   { w: 1080, h: 1920, label: 'Stories 9:16' },
  horizontal: { w: 1920, h: 1080, label: 'Overlay 16:9' },
};

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // Renderizar ícones Lucide
  if (window.lucide) lucide.createIcons();

  // Controle de Acesso por Senha
  setupAuth();

  // Carregar dados
  loadQuestionsFromStorage();
  await loadConfigFile();
  loadConfigToForm();

  // Registrar todos os eventos
  registerNavTabs();
  registerDropZone();
  registerFilters();
  registerBatchActions();
  registerGeneratorControls();
  registerConfigActions();
  registerModal();

  // Renderizar lista inicial
  renderQuestions();

  // Re-renderizar ícones após manipulação de DOM
  if (window.lucide) lucide.createIcons();
});

// ============================================================
//  AUTENTICAÇÃO / SENHA DO BACKSTAGE
// ============================================================
function setupAuth() {
  const modal   = document.getElementById('auth-modal');
  const input   = document.getElementById('auth-password');
  const form    = document.getElementById('auth-form');
  const errorEl = document.getElementById('auth-error');
  const btnExit = document.getElementById('btn-logout');

  // Verifica se já está autenticado nesta sessão/navegador
  if (sessionStorage.getItem(AUTH_KEY) === 'granted' || localStorage.getItem(AUTH_KEY) === 'granted') {
    if (modal) modal.style.display = 'none';
  } else {
    if (modal) modal.style.display = 'flex';
    setTimeout(() => input?.focus(), 150);
  }

  function handleLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const val = input ? input.value.trim() : '';
    if (val === BACKSTAGE_PASS) {
      sessionStorage.setItem(AUTH_KEY, 'granted');
      localStorage.setItem(AUTH_KEY, 'granted');
      if (modal) {
        modal.style.setProperty('display', 'none', 'important');
        modal.classList.add('hidden');
      }
      if (errorEl) errorEl.textContent = '';
      showToast('Acesso liberado ao Backstage!', 'success');
    } else {
      if (errorEl) errorEl.textContent = 'Senha incorreta. Tente novamente.';
      if (input) {
        input.value = '';
        input.classList.add('shake');
        setTimeout(() => input.classList.remove('shake'), 400);
        input.focus();
      }
    }
  }

  window.submitAuth = handleLogin;

  form?.addEventListener('submit', handleLogin);
  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleLogin(e);
  });
  document.getElementById('auth-submit-btn')?.addEventListener('click', handleLogin);

  btnExit?.addEventListener('click', () => {
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    if (modal) {
      modal.style.display = 'flex';
      if (input) { input.value = ''; input.focus(); }
    }
    showToast('Sessão encerrada com sucesso.', 'info');
  });
}

// ============================================================
//  NAVEGAÇÃO POR ABAS
// ============================================================
function registerNavTabs() {
  const tabs   = document.querySelectorAll('.nav-tab');
  const panels = document.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      const target = tab.dataset.tab;

      tabs.forEach(t => { t.classList.remove('active'); t.setAttribute('aria-selected', 'false'); });
      panels.forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      document.getElementById(`tab-${target}`)?.classList.add('active');

      // Ao abrir gerador, popular select de perguntas aprovadas
      if (target === 'gerador') {
        populateApprovedSelect();
        drawArt();
      }

      // Re-renderizar ícones
      if (window.lucide) lucide.createIcons();
    });
  });
}

// ============================================================
//  PERSISTÊNCIA — localStorage
// ============================================================
function loadQuestionsFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    allQuestions = raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('[VD] Erro ao carregar perguntas:', e);
    allQuestions = [];
  }
}

function saveQuestionsToStorage() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(allQuestions));
  } catch (e) {
    console.error('[VD] Erro ao salvar perguntas:', e);
    showToast('Erro ao salvar no armazenamento local.', 'error');
  }
}

function loadConfigFromStorage() {
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveConfigToStorage(cfg) {
  try {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(cfg));
  } catch (e) {
    console.error('[VD] Erro ao salvar config:', e);
  }
}

// ============================================================
//  CARREGAR config.json
// ============================================================
async function loadConfigFile() {
  // Tentar primeiro do arquivo, depois do localStorage
  try {
    const res = await fetch('config.json?' + Date.now());
    if (res.ok) {
      CONFIG = await res.json();
      saveConfigToStorage(CONFIG);
      return;
    }
  } catch (e) {
    console.warn('[VD Backstage] Não carregou config.json. Tentando localStorage...', e);
  }

  // Fallback: localStorage
  const stored = loadConfigFromStorage();
  if (stored) {
    CONFIG = stored;
    return;
  }

  // Default mínimo
  CONFIG = {
    podcast: { titulo: 'Vencendo o Divórcio', subtitulo: 'Podcast', edicao_atual: 'Episódio 1', descricao: '' },
    google_forms: { form_url: '', entry_nome: '', entry_whatsapp: '', entry_duvida: '' },
    configuracoes: { manutencao: false, mensagem_manutencao: '', max_chars_duvida: 500 },
  };
}

// ============================================================
//  CARREGAR CONFIGURAÇÃO NO FORMULÁRIO
// ============================================================
function loadConfigToForm() {
  const gf  = CONFIG.google_forms || {};
  const pod = CONFIG.podcast      || {};
  const cfg = CONFIG.configuracoes || {};

  setVal('cfg-form-url',      gf.form_url         || '');
  setVal('cfg-entry-nome',    gf.entry_nome        || '');
  setVal('cfg-entry-wpp',     gf.entry_whatsapp    || '');
  setVal('cfg-entry-duvida',  gf.entry_duvida      || '');
  setVal('cfg-podcast-titulo',pod.titulo           || 'Vencendo o Divórcio');
  setVal('cfg-edicao',        pod.edicao_atual     || '');
  setVal('cfg-descricao',     pod.descricao        || '');
  setVal('cfg-max-chars',     cfg.max_chars_duvida || 500);
  setVal('cfg-msg-manutencao',cfg.mensagem_manutencao || '');

  const chk = document.getElementById('cfg-manutencao');
  if (chk) chk.checked = !!cfg.manutencao;

  updateConfigPreview();
}

function setVal(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

// ============================================================
//  IMPORTAÇÃO CSV com PapaParse
// ============================================================
function registerDropZone() {
  const dropZone = document.getElementById('drop-zone');
  const fileInput = document.getElementById('csv-file-input');

  if (!dropZone || !fileInput) return;

  // Drag & Drop
  dropZone.addEventListener('dragover',  (e) => { e.preventDefault(); dropZone.classList.add('drag-over'); });
  dropZone.addEventListener('dragleave', ()  => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processCSV(file);
  });

  // Click / input
  fileInput.addEventListener('change', (e) => {
    if (e.target.files[0]) processCSV(e.target.files[0]);
  });
}

function processCSV(file) {
  if (!file.name.endsWith('.csv') && file.type !== 'text/csv') {
    showToast('Por favor, selecione um arquivo .csv', 'error');
    return;
  }

  const statusEl = document.getElementById('import-status');
  if (statusEl) statusEl.textContent = '⏳ Processando CSV...';

  // PapaParse para parsing robusto
  Papa.parse(file, {
    header:            true,
    skipEmptyLines:    true,
    dynamicTyping:     false,
    encoding:          'UTF-8',
    complete: (results) => {
      importCSVData(results.data, statusEl);
    },
    error: (err) => {
      console.error('[VD] PapaParse error:', err);
      showToast('Erro ao parsear o CSV: ' + err.message, 'error');
      if (statusEl) statusEl.textContent = '❌ Erro ao processar o arquivo.';
    },
  });
}

/**
 * Detecta as colunas do CSV automaticamente:
 * O CSV do Google Forms geralmente tem:
 * - Coluna 0: "Carimbo de data/hora" ou "Timestamp"
 * - Coluna 1: (nome do campo que você configurou)
 * - Coluna 2: (WhatsApp)
 * - Coluna 3: (Dúvida)
 */
function importCSVData(rows, statusEl) {
  if (!rows || rows.length === 0) {
    showToast('CSV vazio ou sem dados válidos.', 'error');
    if (statusEl) statusEl.textContent = '❌ Nenhum dado encontrado.';
    return;
  }

  // Detectar colunas automaticamente
  const headers = Object.keys(rows[0]);
  const colTimestamp  = detectColumn(headers, ['carimbo', 'timestamp', 'data/hora', 'horário', 'hora']);
  const colNome       = detectColumn(headers, ['nome', 'name', 'como', 'chamar']);
  const colWhatsApp   = detectColumn(headers, ['whatsapp', 'telefone', 'celular', 'número', 'fone']);
  const colDuvida     = detectColumn(headers, ['dúvida', 'duvida', 'pergunta', 'questão', 'questao', 'amor', 'vida']);

  // Se não detectar bem, usar posições
  const fallbackCols = headers;

  let added = 0;
  let dupes  = 0;

  for (const row of rows) {
    const timestamp = row[colTimestamp] || row[fallbackCols[0]] || '';
    const nome      = row[colNome]      || row[fallbackCols[1]] || 'Sem nome';
    const whatsapp  = row[colWhatsApp]  || row[fallbackCols[2]] || '';
    const duvida    = row[colDuvida]    || row[fallbackCols[3]] || '';

    if (!duvida.trim()) continue; // pular linhas sem dúvida

    // Hash único para deduplicação
    const hash = hashString(`${timestamp}|||${duvida.trim()}`);

    // Verificar duplicata
    if (allQuestions.some(q => q.id === hash)) {
      dupes++;
      continue;
    }

    allQuestions.push({
      id:        hash,
      timestamp: timestamp.trim(),
      nome:      nome.trim() || 'Anônimo',
      whatsapp:  whatsapp.trim(),
      duvida:    duvida.trim(),
      status:    'Pendente',
      archived:  false,
      createdAt: parseGoogleTimestamp(timestamp.trim()) || new Date().toISOString(),
    });

    added++;
  }

  saveQuestionsToStorage();
  renderQuestions();

  const msg = `✅ Importação concluída! ${added} nova(s) pergunta(s) adicionada(s)${dupes > 0 ? `, ${dupes} duplicata(s) ignorada(s)` : ''}.`;
  if (statusEl) statusEl.textContent = msg;
  showToast(`${added} pergunta(s) nova(s) importada(s)!`, added > 0 ? 'success' : 'info');
}

/** Detecta coluna por palavra-chave (case-insensitive) */
function detectColumn(headers, keywords) {
  for (const h of headers) {
    const lower = h.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    for (const kw of keywords) {
      if (lower.includes(kw.toLowerCase())) return h;
    }
  }
  return headers[0] || '';
}

/** Parse do timestamp do Google Forms: "DD/MM/AAAA HH:MM:SS" */
function parseGoogleTimestamp(str) {
  if (!str) return null;
  // Formato: 12/11/2026 15:30:00
  const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return null;
  const [, d, m, y, h, min, s] = match;
  return new Date(`${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}T${h}:${min}:${s||'00'}`).toISOString();
}

/** Hash simples (djb2) para string */
function hashString(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return 'q_' + Math.abs(hash).toString(36);
}

// ============================================================
//  FILTROS & BUSCA
// ============================================================
function registerFilters() {
  ['search-input', 'filter-status', 'filter-view', 'filter-date-start', 'filter-date-end'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', renderQuestions);
    document.getElementById(id)?.addEventListener('change', renderQuestions);
  });

  document.getElementById('btn-clear-filters')?.addEventListener('click', clearFilters);
}

function clearFilters() {
  setVal('search-input', '');
  setVal('filter-status', '');
  setVal('filter-view', 'fila');
  setVal('filter-date-start', '');
  setVal('filter-date-end', '');
  renderQuestions();
}

function getFilteredQuestions() {
  const search   = document.getElementById('search-input')?.value.trim().toLowerCase() || '';
  const status   = document.getElementById('filter-status')?.value  || '';
  const view     = document.getElementById('filter-view')?.value    || 'fila';
  const dateStart= document.getElementById('filter-date-start')?.value;
  const dateEnd  = document.getElementById('filter-date-end')?.value;

  return allQuestions.filter(q => {
    // View filter
    if (view === 'fila'      && q.archived)  return false;
    if (view === 'arquivadas'&& !q.archived) return false;

    // Status filter
    if (status && q.status !== status) return false;

    // Search
    if (search) {
      const inNome   = q.nome.toLowerCase().includes(search);
      const inDuvida = q.duvida.toLowerCase().includes(search);
      if (!inNome && !inDuvida) return false;
    }

    // Date range
    if (dateStart || dateEnd) {
      const qDate = new Date(q.createdAt);
      if (dateStart && qDate < new Date(dateStart)) return false;
      if (dateEnd) {
        const endD = new Date(dateEnd);
        endD.setHours(23, 59, 59, 999);
        if (qDate > endD) return false;
      }
    }

    return true;
  });
}

// ============================================================
//  RENDERIZAÇÃO DA LISTA DE PERGUNTAS
// ============================================================
function renderQuestions() {
  const listEl = document.getElementById('questions-list');
  if (!listEl) return;

  const filtered = getFilteredQuestions();
  updateStats();

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <h3>Nenhuma pergunta encontrada</h3>
        <p>${allQuestions.length === 0 ? 'Importe um arquivo CSV para começar.' : 'Tente ajustar os filtros de busca.'}</p>
      </div>
    `;
    if (window.lucide) lucide.createIcons();
    return;
  }

  // Ordenar: mais recentes primeiro
  const sorted = [...filtered].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  listEl.innerHTML = sorted.map(q => renderQuestionCard(q)).join('');

  // Registrar eventos dos cards
  listEl.querySelectorAll('.status-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const id = e.target.closest('.question-card').dataset.id;
      updateQuestionStatus(id, e.target.value);
    });
  });

  listEl.querySelectorAll('.btn-use-in-art').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.question-card').dataset.id;
      openInGenerator(id);
    });
  });

  listEl.querySelectorAll('.btn-delete-q').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.closest('.question-card').dataset.id;
      confirmDeleteQuestion(id);
    });
  });

  if (window.lucide) lucide.createIcons();
}

function renderQuestionCard(q) {
  const initials = q.nome.substring(0, 2).toUpperCase();
  const timeStr  = q.createdAt ? new Date(q.createdAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : q.timestamp;

  // Formatar WhatsApp para link (remove caracteres não numéricos)
  const wppClean = q.whatsapp.replace(/\D/g, '');
  const wppLink  = wppClean ? `https://wa.me/55${wppClean}` : '#';
  const hasWpp   = wppClean.length >= 10;

  const statusOptions = ['Pendente', 'Aprovada', 'Respondida', 'Descartada', 'Arquivada']
    .map(s => `<option value="${s}" ${q.status === s ? 'selected' : ''}>${s}</option>`)
    .join('');

  return `
    <div class="question-card" data-id="${q.id}" data-status="${q.status}">
      <div class="question-card-header">
        <div class="question-author">
          <div class="author-avatar">${initials}</div>
          <div class="author-info">
            <div class="author-name">${escHtml(q.nome)}</div>
            <div class="author-meta">
              <span class="author-time">
                <i data-lucide="clock-3"></i>
                ${escHtml(timeStr)}
              </span>
              ${hasWpp ? `
                <a href="${wppLink}" target="_blank" rel="noopener" class="whatsapp-btn" title="${escHtml(q.whatsapp)}">
                  <i data-lucide="phone"></i>
                  WhatsApp
                </a>
              ` : ''}
            </div>
          </div>
        </div>
        <span class="status-badge ${q.status}">${q.status}</span>
      </div>

      <p class="question-text ${q.archived ? 'muted' : ''}">${escHtml(q.duvida)}</p>

      <div class="question-actions">
        <select class="status-select" title="Alterar status">
          ${statusOptions}
        </select>
        <button class="btn btn-gold btn-xs btn-use-in-art" title="Gerar Arte com esta pergunta">
          <i data-lucide="image-plus"></i>
          Gerar Arte
        </button>
        <button class="btn btn-danger btn-xs btn-delete-q" title="Excluir permanentemente" style="margin-left:auto;">
          <i data-lucide="trash-2"></i>
        </button>
      </div>
    </div>
  `;
}

function updateQuestionStatus(id, newStatus) {
  const q = allQuestions.find(q => q.id === id);
  if (!q) return;

  q.status   = newStatus;
  q.archived = (newStatus === 'Arquivada');

  saveQuestionsToStorage();
  renderQuestions();
  showToast(`Status atualizado: ${newStatus}`, 'success');
}

function confirmDeleteQuestion(id) {
  openModal(
    'Excluir Pergunta',
    'Tem certeza que deseja excluir esta pergunta permanentemente? Esta ação não pode ser desfeita.',
    () => {
      allQuestions = allQuestions.filter(q => q.id !== id);
      saveQuestionsToStorage();
      renderQuestions();
      showToast('Pergunta excluída.', 'info');
    }
  );
}

// ============================================================
//  ESTATÍSTICAS
// ============================================================
function updateStats() {
  const all = allQuestions;
  document.getElementById('stat-total')?.   setAttribute('textContent', all.length);
  document.getElementById('stat-total').textContent    = all.length;
  document.getElementById('stat-pending').textContent  = all.filter(q => q.status === 'Pendente').length;
  document.getElementById('stat-approved').textContent = all.filter(q => q.status === 'Aprovada').length;
  document.getElementById('stat-answered').textContent = all.filter(q => q.status === 'Respondida').length;
  document.getElementById('stat-rejected').textContent = all.filter(q => q.status === 'Descartada').length;
  document.getElementById('stat-archived').textContent = all.filter(q => q.archived).length;
}

// ============================================================
//  AÇÕES EM LOTE
// ============================================================
function registerBatchActions() {
  document.getElementById('btn-archive-batch')?.addEventListener('click', () => {
    const visible = getFilteredQuestions().filter(q => !q.archived);
    if (visible.length === 0) {
      showToast('Nenhuma pergunta ativa para arquivar.', 'info');
      return;
    }
    openModal(
      'Arquivar Lote (Novo Episódio)',
      `Isso marcará ${visible.length} pergunta(s) visíveis como "Arquivada", limpando a fila para o próximo episódio. O histórico é preservado.`,
      () => {
        visible.forEach(q => {
          const item = allQuestions.find(a => a.id === q.id);
          if (item) { item.status = 'Arquivada'; item.archived = true; }
        });
        saveQuestionsToStorage();
        renderQuestions();
        showToast(`${visible.length} pergunta(s) arquivada(s). Fila limpa para o próximo episódio! 🎙️`, 'success');
      }
    );
  });

  document.getElementById('btn-approve-all-visible')?.addEventListener('click', () => {
    const visible = getFilteredQuestions().filter(q => q.status === 'Pendente' && !q.archived);
    if (visible.length === 0) { showToast('Nenhuma pergunta pendente visível.', 'info'); return; }

    visible.forEach(q => {
      const item = allQuestions.find(a => a.id === q.id);
      if (item) item.status = 'Aprovada';
    });
    saveQuestionsToStorage();
    renderQuestions();
    showToast(`${visible.length} pergunta(s) aprovada(s)!`, 'success');
  });

  document.getElementById('btn-clear-storage')?.addEventListener('click', () => {
    openModal(
      'Limpar Dados Locais',
      'Isso apagará TODAS as perguntas salvas no navegador. Esta ação é irreversível!',
      () => {
        allQuestions = [];
        localStorage.removeItem(STORAGE_KEY);
        renderQuestions();
        showToast('Dados locais apagados.', 'info');
      }
    );
  });
}

// ============================================================
//  GERADOR VISUAL — CANVAS
// ============================================================
function registerGeneratorControls() {
  // Formato
  document.querySelectorAll('.format-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.format-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentArtFormat = btn.dataset.format;
      drawArt();
    });
  });

  // Tema
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTheme = btn.dataset.theme;
      drawArt();
    });
  });

  // Select de pergunta aprovada
  document.getElementById('gen-question-select')?.addEventListener('change', (e) => {
    const id = e.target.value;
    if (!id) return;
    const q = allQuestions.find(q => q.id === id);
    if (!q) return;

    setVal('ctrl-text', q.duvida);
    setVal('ctrl-name', q.nome);
    document.getElementById('ctrl-anon-toggle').checked = (q.nome === 'Anônimo');
    drawArt();
  });

  // Controles em tempo real
  ['ctrl-text', 'ctrl-name', 'ctrl-font-size'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (id === 'ctrl-font-size') {
        document.getElementById('ctrl-font-size-label').textContent =
          document.getElementById('ctrl-font-size').value + 'px';
      }
      if (!document.getElementById('ctrl-auto-font')?.checked || id !== 'ctrl-font-size') {
        drawArt();
      }
    });
  });

  document.getElementById('ctrl-anon-toggle')?.addEventListener('change', (e) => {
    if (e.target.checked) {
      setVal('ctrl-name', 'Anônimo');
    }
    drawArt();
  });

  document.getElementById('ctrl-hide-name')?.addEventListener('change', drawArt);

  document.getElementById('ctrl-auto-font')?.addEventListener('change', drawArt);

  // Download
  document.getElementById('btn-download-art')?.addEventListener('click', downloadArt);

  // Refresh
  document.getElementById('btn-refresh-preview')?.addEventListener('click', drawArt);
}

function populateApprovedSelect() {
  const sel = document.getElementById('gen-question-select');
  if (!sel) return;

  // Lista todas as perguntas cadastradas (priorizando aprovadas e pendentes)
  const items = allQuestions.filter(q => !q.archived);
  sel.innerHTML = '<option value="">— Selecionar uma pergunta da lista —</option>' +
    items.map(q => `<option value="${q.id}">[${q.status}] ${escHtml(q.nome || 'Anônimo')} — ${escHtml(q.duvida.substring(0, 50))}...</option>`).join('');
}

function openInGenerator(id) {
  // Ir para aba gerador
  document.querySelector('[data-tab="gerador"]')?.click();

  setTimeout(() => {
    const sel = document.getElementById('gen-question-select');
    if (sel) {
      sel.value = id;
      sel.dispatchEvent(new Event('change'));
    }
  }, 100);
}

// ============================================================
//  DESENHO NO CANVAS
// ============================================================
function drawArt() {
  const canvas = document.getElementById('art-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const fmt  = ART_FORMATS[currentArtFormat] || ART_FORMATS.square;
  const W    = fmt.w;
  const H    = fmt.h;

  // Atualizar dimensões do canvas (em alta resolução)
  canvas.width  = W;
  canvas.height = H;

  // Escalar preview para caber na tela (max 540px de largura no preview)
  const previewMaxW = 480;
  const scale = Math.min(previewMaxW / W, previewMaxW / H, 1);
  canvas.style.width  = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';

  const hideName = document.getElementById('ctrl-hide-name')?.checked;
  const isAnon = document.getElementById('ctrl-anon-toggle')?.checked;
  const rawName = document.getElementById('ctrl-name')?.value.trim();
  const nome = hideName ? '' : (isAnon ? 'Anônimo' : rawName);
  const texto = document.getElementById('ctrl-text')?.value.trim() || 'Digite ou selecione uma pergunta na Curadoria...';

  // Fundo
  drawBackground(ctx, W, H, currentTheme);

  // Decorações
  drawDecorations(ctx, W, H, currentTheme);

  // Logo / Título do podcast
  drawPodcastHeader(ctx, W, H);

  // Caixa da pergunta
  drawQuestionBox(ctx, W, H, nome, texto);
}

function drawBackground(ctx, W, H, theme) {
  if (theme === 'overlay') {
    // Fundo semi-transparente escuro (ideal para OBS/vMix Lower Third)
    ctx.clearRect(0, 0, W, H);
    const grad = ctx.createLinearGradient(0, H * 0.6, 0, H);
    grad.addColorStop(0, 'rgba(10,5,5,0)');
    grad.addColorStop(0.3, 'rgba(10,5,5,0.85)');
    grad.addColorStop(1, 'rgba(10,5,5,0.97)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else if (theme === 'champagne') {
    // Fundo claro champagne / pêssego luminoso (idêntico ao canal YouTube)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#FFF8F0');
    grad.addColorStop(0.5, '#F6DEC7');
    grad.addColorStop(1, '#EBBFA0');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else {
    // Fundo escuro (dark)
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#120A0A');
    grad.addColorStop(0.5, '#1C0F0F');
    grad.addColorStop(1, '#0A0505');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawDecorations(ctx, W, H, theme) {
  if (theme === 'overlay') return; // sem decorações no overlay

  // Círculos decorativos de brilho
  const drawGlow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  drawGlow(W * 0.1,  H * 0.1,  W * 0.3, 'rgba(139,26,26,0.15)');
  drawGlow(W * 0.9,  H * 0.9,  W * 0.3, 'rgba(201,168,76,0.12)');
  drawGlow(W * 0.85, H * 0.1,  W * 0.2, 'rgba(201,168,76,0.08)');

  // Linha decorativa horizontal (no topo)
  const lineY = H * 0.08;
  const lineGrad = ctx.createLinearGradient(0, 0, W, 0);
  lineGrad.addColorStop(0, 'transparent');
  lineGrad.addColorStop(0.3, 'rgba(201,168,76,0.6)');
  lineGrad.addColorStop(0.7, 'rgba(139,26,26,0.6)');
  lineGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = lineGrad;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(W * 0.1, lineY);
  ctx.lineTo(W * 0.9, lineY);
  ctx.stroke();

  // Partículas douradas simples
  ctx.fillStyle = 'rgba(201,168,76,0.4)';
  const seed = 42;
  for (let i = 0; i < 30; i++) {
    const px = ((seed * (i * 7919 + 1)) % W + W) % W;
    const py = ((seed * (i * 6271 + 3)) % H + H) % H;
    const pr = (i % 3 === 0) ? 2 : 1;
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawPodcastHeader(ctx, W, H) {
  const isHoriz   = currentArtFormat === 'horizontal';
  const isVertical = currentArtFormat === 'vertical';
  const isOverlay  = currentTheme === 'overlay';

  if (isOverlay) {
    // Para overlay, logo menor no canto
    const logoSize = Math.min(W, H) * 0.06;
    ctx.font = `bold ${logoSize}px 'Playfair Display', serif`;
    ctx.fillStyle = '#E8C77A';
    ctx.textAlign = 'left';
    ctx.fillText('VENCENDO O DIVÓRCIO', W * 0.03, H * 0.08);

    ctx.font = `${logoSize * 0.5}px 'Inter', sans-serif`;
    ctx.fillStyle = 'rgba(201,168,76,0.7)';
    ctx.fillText('⫿ PODCAST ⫿', W * 0.03, H * 0.08 + logoSize * 0.9);
    return;
  }

  // Header normal
  const isChampagne = currentTheme === 'champagne';
  const headerY = isHoriz ? H * 0.12 : (isVertical ? H * 0.07 : H * 0.1);
  const titleSize = Math.min(W * 0.055, 72);

  // "VENCENDO o"
  ctx.font = `600 ${titleSize * 0.55}px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? '#3D1A1A' : '#C8A882';
  ctx.textAlign = 'center';
  ctx.fillText('VENCENDO o', W * 0.5, headerY);

  // "DIVÓRCIO"
  ctx.font = `900 ${titleSize}px 'Playfair Display', serif`;

  // Gradient text efeito
  const tGrad = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  if (isChampagne) {
    tGrad.addColorStop(0, '#B31922');
    tGrad.addColorStop(0.5, '#C81D25');
    tGrad.addColorStop(1, '#A8141B');
    ctx.shadowColor = 'rgba(200,29,37,0.18)';
  } else {
    tGrad.addColorStop(0, '#8B1A1A');
    tGrad.addColorStop(0.4, '#C0392B');
    tGrad.addColorStop(0.7, '#8B1A1A');
    tGrad.addColorStop(1, '#6B0F0F');
    ctx.shadowColor = 'rgba(139,26,26,0.5)';
  }
  ctx.fillStyle = tGrad;
  ctx.shadowBlur = 20;
  ctx.fillText('DIVÓRCIO', W * 0.5, headerY + titleSize * 1.05);
  ctx.shadowBlur = 0;

  // "PODCAST"
  ctx.font = `600 ${titleSize * 0.3}px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? '#9A6F28' : 'rgba(201,168,76,0.8)';
  ctx.letterSpacing = '0.3em';
  ctx.fillText('⫿ PODCAST ⫿', W * 0.5, headerY + titleSize * 1.6);
  ctx.letterSpacing = '0';

  // Separador
  const sepY = headerY + titleSize * 1.9;
  const sepGrad = ctx.createLinearGradient(W * 0.2, 0, W * 0.8, 0);
  sepGrad.addColorStop(0, 'transparent');
  sepGrad.addColorStop(0.3, 'rgba(201,168,76,0.8)');
  sepGrad.addColorStop(0.7, 'rgba(139,26,26,0.8)');
  sepGrad.addColorStop(1, 'transparent');
  ctx.strokeStyle = sepGrad;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.2, sepY);
  ctx.lineTo(W * 0.8, sepY);
  ctx.stroke();
}

function drawQuestionBox(ctx, W, H, nome, texto) {
  const isOverlay  = currentTheme === 'overlay';
  const isHoriz    = currentArtFormat === 'horizontal';
  const isVertical = currentArtFormat === 'vertical';

  // Área da caixa de pergunta
  let boxX, boxY, boxW, boxH;
  if (isOverlay) {
    boxX = W * 0.02;
    boxY = H * 0.72;
    boxW = W * 0.96;
    boxH = H * 0.26;
  } else if (isHoriz) {
    boxX = W * 0.08;
    boxY = H * 0.35;
    boxW = W * 0.84;
    boxH = H * 0.52;
  } else if (isVertical) {
    boxX = W * 0.07;
    boxY = H * 0.28;
    boxW = W * 0.86;
    boxH = H * 0.6;
  } else {
    boxX = W * 0.07;
    boxY = H * 0.33;
    boxW = W * 0.86;
    boxH = H * 0.52;
  }

  // Fundo da caixa
  const isChampagne = currentTheme === 'champagne';
  if (!isOverlay) {
    ctx.save();
    ctx.shadowColor = isChampagne ? 'rgba(139,69,39,0.14)' : 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 30;
    const boxGrad = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
    if (isChampagne) {
      boxGrad.addColorStop(0, 'rgba(255,255,255,0.96)');
      boxGrad.addColorStop(1, 'rgba(253,245,236,0.98)');
    } else {
      boxGrad.addColorStop(0, 'rgba(26,14,14,0.95)');
      boxGrad.addColorStop(1, 'rgba(10,5,5,0.98)');
    }
    ctx.fillStyle = boxGrad;
    roundedRect(ctx, boxX, boxY, boxW, boxH, 24);
    ctx.fill();
    ctx.restore();

    // Borda da caixa
    const borderGrad = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
    borderGrad.addColorStop(0, isChampagne ? 'rgba(201,151,70,0.7)' : 'rgba(201,168,76,0.6)');
    borderGrad.addColorStop(0.5, isChampagne ? 'rgba(200,29,37,0.35)' : 'rgba(139,26,26,0.4)');
    borderGrad.addColorStop(1, isChampagne ? 'rgba(201,151,70,0.7)' : 'rgba(201,168,76,0.6)');
    ctx.strokeStyle = borderGrad;
    ctx.lineWidth = 2;
    roundedRect(ctx, boxX, boxY, boxW, boxH, 24);
    ctx.stroke();
  }

  const pad = boxW * 0.07;
  const contentX = boxX + pad;
  const contentW = boxW - pad * 2;

  // Se tiver nome (ou for anônimo), desenha o bloco do autor
  let currentY = boxY + (isOverlay ? boxH * 0.18 : boxH * 0.12);

  if (nome) {
    // Nome da pessoa ou Anônimo
    ctx.font = `700 ${Math.min(W * 0.038, 44)}px 'Playfair Display', serif`;
    ctx.fillStyle = isChampagne ? '#2B1414' : '#F5EDD8';
    ctx.shadowColor = isChampagne ? 'transparent' : 'rgba(201,168,76,0.3)';
    ctx.shadowBlur = isChampagne ? 0 : 10;
    ctx.fillText(nome, contentX, currentY);
    ctx.shadowBlur = 0;

    // Linha divisória sutil
    const sepY2 = currentY + Math.min(W * 0.015, 18);
    ctx.strokeStyle = isChampagne ? 'rgba(201,151,70,0.35)' : 'rgba(201,168,76,0.3)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(contentX, sepY2);
    ctx.lineTo(contentX + contentW, sepY2);
    ctx.stroke();

    currentY = sepY2 + Math.min(W * 0.03, 34);
  } else {
    // Sem nome (oculto): dá mais espaço e centraliza o texto da pergunta
    currentY += Math.min(W * 0.01, 10);
  }

  // Texto da dúvida com quebra automática
  const maxAvailableH = boxH - (currentY - boxY) - pad;

  // Calcular tamanho de fonte automático
  let fontSize;
  if (document.getElementById('ctrl-auto-font')?.checked) {
    fontSize = calcAutoFontSize(ctx, texto, contentW, maxAvailableH * 0.9, 18, 48);
  } else {
    fontSize = parseInt(document.getElementById('ctrl-font-size')?.value || '32');
  }

  ctx.font = `400 ${fontSize}px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? '#3D221E' : '#C8A882';
  wrapText(ctx, texto, contentX, currentY, contentW, fontSize * 1.5, maxAvailableH);
}

/** Calcula automaticamente o tamanho de fonte que cabe na área */
function calcAutoFontSize(ctx, text, maxW, maxH, minSize, maxSize) {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `400 ${size}px 'Inter', sans-serif`;
    const lines = getWrappedLines(ctx, text, maxW);
    const totalH = lines.length * size * 1.5;
    if (totalH <= maxH) return size;
  }
  return minSize;
}

/** Quebra texto em linhas e as desenha */
function wrapText(ctx, text, x, y, maxW, lineH, maxH) {
  const lines = getWrappedLines(ctx, text, maxW);
  let currentY = y;

  for (const line of lines) {
    if (currentY - y + lineH > maxH) {
      // Adicionar "..." na última linha visível
      const prevLine = lines[lines.indexOf(line) - 1] || '';
      ctx.fillText(prevLine + '...', x, currentY - lineH);
      break;
    }
    ctx.fillText(line, x, currentY);
    currentY += lineH;
  }
}

/** Retorna array de linhas quebradas para o canvas */
function getWrappedLines(ctx, text, maxW) {
  const words  = text.split(' ');
  const lines  = [];
  let current  = '';

  for (const word of words) {
    // Lidar com quebras de linha explícitas
    const parts = word.split('\n');
    for (let pi = 0; pi < parts.length; pi++) {
      const test = current ? `${current} ${parts[pi]}` : parts[pi];
      if (ctx.measureText(test).width > maxW && current) {
        lines.push(current);
        current = parts[pi];
      } else {
        current = test;
      }
      if (pi < parts.length - 1) {
        lines.push(current);
        current = '';
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

/** Desenha retângulo com cantos arredondados */
function roundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

// ============================================================
//  DOWNLOAD DE ARTE
// ============================================================
function downloadArt() {
  drawArt(); // garantir atualizado

  const canvas = document.getElementById('art-canvas');
  if (!canvas) return;

  const fmt    = ART_FORMATS[currentArtFormat] || ART_FORMATS.square;
  const nome   = document.getElementById('ctrl-name')?.value.trim() || 'ouvinte';
  const link   = document.createElement('a');
  link.download = `vd-podcast-${currentArtFormat}-${nome.replace(/\s+/g,'-').toLowerCase()}.png`;
  link.href     = canvas.toDataURL('image/png');
  link.click();

  showToast(`Arte ${fmt.label} baixada em alta resolução!`, 'success');
}

// ============================================================
//  CONFIGURAÇÃO — AÇÕES
// ============================================================
function registerConfigActions() {
  // Monitorar mudanças nos campos de config e auto-salvar
  ['cfg-form-url','cfg-entry-nome','cfg-entry-wpp','cfg-entry-duvida',
   'cfg-podcast-titulo','cfg-edicao','cfg-descricao','cfg-max-chars',
   'cfg-manutencao','cfg-msg-manutencao'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      updateConfigPreview();
      const cfg = buildConfigObject();
      saveConfigToStorage(cfg);
    });
    document.getElementById(id)?.addEventListener('change', () => {
      updateConfigPreview();
      const cfg = buildConfigObject();
      saveConfigToStorage(cfg);
    });
  });

  // Botão Salvar Explícito
  document.getElementById('btn-save-config')?.addEventListener('click', () => {
    const cfg = buildConfigObject();
    saveConfigToStorage(cfg);
    CONFIG = cfg;
    showToast('Configurações salvas com sucesso!', 'success');
  });

  // Exportar / Baixar config.json
  document.getElementById('btn-export-config')?.addEventListener('click', exportConfig);

  // Recarregar config.json
  document.getElementById('btn-load-config')?.addEventListener('click', async () => {
    await loadConfigFile();
    loadConfigToForm();
    showToast('Configuração recarregada do arquivo!', 'success');
  });
}

function buildConfigObject() {
  return {
    _comment: "=== CONFIGURAÇÃO DO PODCAST VENCENDO O DIVÓRCIO ===",
    _instrucoes: "Gerado automaticamente pelo Backstage. Não edite manualmente se não souber o que está fazendo.",

    podcast: {
      titulo:        getVal('cfg-podcast-titulo') || 'Vencendo o Divórcio',
      subtitulo:     'Podcast',
      edicao_atual:  getVal('cfg-edicao')         || '',
      descricao:     getVal('cfg-descricao')       || '',
    },

    google_forms: {
      _comment_url: "Substitua /viewform por /formResponse na URL do formulário",
      form_url:     getVal('cfg-form-url')       || '',
      _comment_ids: "Encontre os IDs inspecionando o HTML do formulário publicado (procure por name='entry.XXXXXXX')",
      entry_nome:   getVal('cfg-entry-nome')     || '',
      entry_whatsapp: getVal('cfg-entry-wpp')    || '',
      entry_duvida: getVal('cfg-entry-duvida')   || '',
    },

    configuracoes: {
      _comment_manutencao: "Mude para true para fechar o formulário",
      manutencao:            document.getElementById('cfg-manutencao')?.checked || false,
      mensagem_manutencao:   getVal('cfg-msg-manutencao') || 'As perguntas estão encerradas.',
      max_chars_duvida:      parseInt(getVal('cfg-max-chars')) || 500,
    },
  };
}

function getVal(id) {
  return document.getElementById(id)?.value.trim() || '';
}

function updateConfigPreview() {
  const cfg = buildConfigObject();
  const pre = document.getElementById('config-preview');
  if (pre) pre.textContent = JSON.stringify(cfg, null, 2);
}

function exportConfig() {
  const cfg  = buildConfigObject();
  const json = JSON.stringify(cfg, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href     = url;
  link.download = 'config.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('config.json exportado! Substitua o arquivo na pasta do projeto.', 'success');

  // Salvar no localStorage também
  saveConfigToStorage(cfg);
}

// ============================================================
//  MODAL DE CONFIRMAÇÃO
// ============================================================
function registerModal() {
  document.getElementById('modal-confirm-btn')?.addEventListener('click', () => {
    if (typeof modalCallback === 'function') modalCallback();
    closeModal();
  });

  document.getElementById('modal-cancel-btn')?.addEventListener('click', closeModal);

  document.getElementById('confirm-modal')?.addEventListener('click', (e) => {
    if (e.target === document.getElementById('confirm-modal')) closeModal();
  });
}

function openModal(title, body, onConfirm) {
  modalCallback = onConfirm;
  document.getElementById('modal-title').childNodes[1].textContent = ` ${title}`;
  document.getElementById('modal-body').textContent = body;
  document.getElementById('confirm-modal')?.classList.remove('hidden');
  if (window.lucide) lucide.createIcons();
}

function closeModal() {
  document.getElementById('confirm-modal')?.classList.add('hidden');
  modalCallback = null;
}

// ============================================================
//  TOAST NOTIFICATIONS
// ============================================================
function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const icons = { success: 'check-circle', error: 'x-circle', info: 'info' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<i data-lucide="${icons[type] || 'info'}"></i><span>${escHtml(msg)}</span>`;

  container.appendChild(toast);
  if (window.lucide) lucide.createIcons();

  // Remover após animação
  setTimeout(() => toast.remove(), 3200);
}

// ============================================================
//  UTILITÁRIOS
// ============================================================
function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
