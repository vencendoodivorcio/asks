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
let logoImgObj = null;
let unsubscribeQuestions = null;
let unsubscribeSettings  = null;

function getLogoImage() {
  if (!logoImgObj) {
    logoImgObj = new Image();
    logoImgObj.src = 'assets/logo.jpg';
    logoImgObj.onload = () => {
      drawArt();
    };
  }
  return (logoImgObj && logoImgObj.complete && logoImgObj.naturalWidth > 0) ? logoImgObj : null;
}

let templateImgObj = null;
function getTemplateImage() {
  if (!templateImgObj) {
    templateImgObj = new Image();
    templateImgObj.src = 'assets/template-bg.jpg';
    templateImgObj.onload = () => {
      drawArt();
    };
  }
  return (templateImgObj && templateImgObj.complete && templateImgObj.naturalWidth > 0) ? templateImgObj : null;
}

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

  // Inicializa carregamento da logo oficial, template de fundo e fontes para o canvas
  getLogoImage();
  getTemplateImage();
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(() => drawArt());
  }

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
//  AUTENTICAÇÃO / LOGIN DO BACKSTAGE (FIREBASE AUTH)
// ============================================================
function setupAuth() {
  const modal   = document.getElementById('auth-modal');
  const emailIn = document.getElementById('auth-email');
  const passIn  = document.getElementById('auth-password');
  const form    = document.getElementById('auth-form');
  const errorEl = document.getElementById('auth-error');
  const btnSub  = document.getElementById('auth-submit-btn');
  const btnTxt  = document.getElementById('auth-btn-text');
  const btnExit = document.getElementById('btn-logout');

  if (window.auth) {
    window.auth.onAuthStateChanged(user => {
      if (user) {
        if (modal) {
          modal.style.display = 'none';
          modal.classList.add('hidden');
        }
        if (errorEl) errorEl.textContent = '';
        startFirestoreSync();
      } else {
        if (modal) {
          modal.style.display = 'flex';
          modal.classList.remove('hidden');
        }
        stopFirestoreSync();
        setTimeout(() => emailIn?.focus(), 150);
      }
    });
  } else {
    // Fallback local se Firebase estiver indisponível
    if (sessionStorage.getItem(AUTH_KEY) === 'granted' || localStorage.getItem(AUTH_KEY) === 'granted') {
      if (modal) modal.style.display = 'none';
    } else {
      if (modal) modal.style.display = 'flex';
    }
  }

  let isLoggingIn = false;

  async function handleLogin(e) {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (isLoggingIn) return;

    const email = emailIn ? emailIn.value.trim() : '';
    const pass  = passIn ? passIn.value.trim() : '';

    if (!email || !pass) {
      if (errorEl) errorEl.textContent = 'Informe o e-mail e a senha cadastrados no Firebase.';
      return;
    }

    isLoggingIn = true;
    if (btnSub) btnSub.disabled = true;
    if (btnTxt) btnTxt.textContent = 'Autenticando...';
    if (errorEl) errorEl.textContent = '';

    try {
      if (window.auth) {
        await window.auth.signInWithEmailAndPassword(email, pass);
        showToast('Login realizado com sucesso! Sincronizando...', 'success');
      } else {
        sessionStorage.setItem(AUTH_KEY, 'granted');
        localStorage.setItem(AUTH_KEY, 'granted');
        if (modal) modal.style.display = 'none';
        showToast('Acesso liberado.', 'success');
      }
    } catch (err) {
      console.error('[VD Auth Error]', err);
      let msg = 'Erro ao entrar. Verifique seu e-mail e senha.';
      if (err.code === 'auth/invalid-credential' || err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password') {
        msg = 'E-mail ou senha incorretos.';
      } else if (err.code === 'auth/invalid-email') {
        msg = 'Formato de e-mail inválido.';
      } else if (err.code === 'auth/too-many-requests') {
        msg = 'Muitas tentativas sem sucesso. Aguarde alguns minutos.';
      } else if (err.message) {
        msg = err.message;
      }
      if (errorEl) errorEl.textContent = msg;
      if (passIn) {
        passIn.value = '';
        passIn.classList.add('shake');
        setTimeout(() => passIn.classList.remove('shake'), 400);
        passIn.focus();
      }
    } finally {
      isLoggingIn = false;
      if (btnSub) btnSub.disabled = false;
      if (btnTxt) btnTxt.textContent = 'Entrar no Backstage';
    }
  }

  window.submitAuth = handleLogin;

  form?.addEventListener('submit', handleLogin);
  [emailIn, passIn].forEach(inp => {
    inp?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleLogin(e);
    });
  });
  btnSub?.addEventListener('click', handleLogin);

  btnExit?.addEventListener('click', async () => {
    if (window.auth) {
      await window.auth.signOut();
    }
    sessionStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(AUTH_KEY);
    showToast('Sessão encerrada com sucesso.', 'info');
  });
}

/** Inicia escuta em tempo real do Firestore */
function startFirestoreSync() {
  if (!window.db) {
    loadQuestionsFromStorage();
    renderQuestions();
    return;
  }

  if (unsubscribeQuestions) unsubscribeQuestions();

  unsubscribeQuestions = window.db.collection('questions')
    .onSnapshot(snapshot => {
      const list = [];
      snapshot.forEach(doc => {
        const d = doc.data();
        let cAt = d.createdAt;
        if (cAt && cAt.toDate) {
          cAt = cAt.toDate().toISOString();
        } else if (!cAt) {
          cAt = new Date().toISOString();
        }

        list.push({
          id:        doc.id,
          nome:      d.nome || 'Anônimo',
          whatsapp:  d.whatsapp || '',
          duvida:    d.duvida || '',
          status:    d.status || 'Pendente',
          archived:  Boolean(d.archived),
          createdAt: cAt,
          timestamp: d.timestamp || (new Date(cAt)).toLocaleString('pt-BR'),
          origem:    d.origem || 'firestore'
        });
      });

      // Ordenar: mais recentes primeiro
      list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      allQuestions = list;
      saveQuestionsToStorage(); // manter cache local
      renderQuestions();
      populateApprovedSelect();
    }, err => {
      console.error('[VD Firestore Snapshot Error]', err);
      showToast('Erro ao sincronizar com Firestore: ' + err.message, 'error');
    });

  // Ouvir configurações em tempo real (Modo Manutenção / Formulário Fechado sincronizado entre PCs)
  if (unsubscribeSettings) unsubscribeSettings();
  unsubscribeSettings = window.db.collection('settings').doc('general')
    .onSnapshot(doc => {
      if (doc.exists) {
        const remote = doc.data();
        CONFIG = {
          ...(CONFIG || {}),
          ...remote,
          podcast:       { ...(CONFIG?.podcast || {}), ...(remote.podcast || {}) },
          configuracoes: { ...(CONFIG?.configuracoes || {}), ...(remote.configuracoes || {}) },
          google_forms:  { ...(CONFIG?.google_forms || {}), ...(remote.google_forms || {}) }
        };
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(CONFIG)); } catch (e) {}
        loadConfigToForm();
        updateConfigPreview();
      }
    }, err => {
      console.warn('[VD] Erro ao sincronizar settings no Backstage:', err);
    });
}

/** Interrompe escuta em tempo real ao deslogar */
function stopFirestoreSync() {
  if (unsubscribeQuestions) {
    unsubscribeQuestions();
    unsubscribeQuestions = null;
  }
  if (unsubscribeSettings) {
    unsubscribeSettings();
    unsubscribeSettings = null;
  }
  allQuestions = [];
  renderQuestions();
  populateApprovedSelect();
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
    console.error('[VD] Erro ao salvar config local:', e);
  }

  // Gravar no Firestore se estiver logado para sincronizar com todos os aparelhos
  if (window.db && window.auth && window.auth.currentUser) {
    window.db.collection('settings').doc('general').set(cfg, { merge: true })
      .then(() => console.log('[VD] Configurações salvas no Firestore!'))
      .catch(err => console.warn('[VD] Erro ao salvar settings no Firestore:', err));
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
    const file = e.target.files && e.target.files[0];
    if (file) {
      processCSV(file);
      fileInput.value = ''; // Permite selecionar o mesmo arquivo novamente
    }
  });
}

function processCSV(file) {
  if (!file.name.toLowerCase().endsWith('.csv') && file.type !== 'text/csv' && !file.type.includes('spreadsheet')) {
    showToast('Por favor, selecione um arquivo .csv', 'error');
    return;
  }

  const statusEl = document.getElementById('import-status');
  if (statusEl) statusEl.textContent = '⏳ Processando CSV...';

  // Leitura com detecção inteligente de encoding (UTF-8 vs Windows-1252 de Excel em português)
  const reader = new FileReader();
  reader.onload = function(evt) {
    const buffer = evt.target.result;
    let text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
    // Se houver caractere de substituição (), redecodifica com Windows-1252 (padrão de exportação do Excel BR)
    if (text.includes('\uFFFD')) {
      try {
        text = new TextDecoder('windows-1252').decode(buffer);
      } catch (e) {}
    }

    Papa.parse(text, {
      header:         true,
      skipEmptyLines: true,
      dynamicTyping:  false,
      complete: (results) => {
        importCSVData(results.data, statusEl);
      },
      error: (err) => {
        console.error('[VD] PapaParse error:', err);
        showToast('Erro ao processar o CSV: ' + err.message, 'error');
        if (statusEl) statusEl.textContent = '❌ Erro ao processar o arquivo.';
      },
    });
  };
  reader.onerror = function() {
    showToast('Erro ao ler o arquivo CSV.', 'error');
    if (statusEl) statusEl.textContent = '❌ Erro ao ler arquivo.';
  };
  reader.readAsArrayBuffer(file);
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
  const newQuestions = [];

  for (const row of rows) {
    const timestamp = row[colTimestamp] || row[fallbackCols[0]] || '';
    const nome      = row[colNome]      || row[fallbackCols[1]] || 'Sem nome';
    const whatsapp  = row[colWhatsApp]  || row[fallbackCols[2]] || '';
    const duvida    = row[colDuvida]    || row[fallbackCols[3]] || '';

    if (!duvida.trim()) continue; // pular linhas sem dúvida

    // Hash único para deduplicação
    const hash = hashString(`${timestamp}|||${duvida.trim()}`);

    // Verificar duplicata inteligente (evita duplicar perguntas que já vieram do site via Firebase)
    const isDuplicate = allQuestions.some(q => {
      if (q.id === hash) return true;
      const sameDuvida = (q.duvida || '').trim().toLowerCase() === duvida.trim().toLowerCase();
      if (!sameDuvida) return false;
      const cleanQWpp   = (q.whatsapp || '').replace(/\D/g, '');
      const cleanRowWpp = whatsapp.replace(/\D/g, '');
      if (cleanQWpp && cleanRowWpp) return cleanQWpp === cleanRowWpp;
      return true;
    });

    if (isDuplicate) {
      dupes++;
      continue;
    }

    const item = {
      id:        hash,
      timestamp: timestamp.trim(),
      nome:      nome.trim() || 'Anônimo',
      whatsapp:  whatsapp.trim(),
      duvida:    duvida.trim(),
      status:    'Pendente',
      archived:  false,
      createdAt: parseGoogleTimestamp(timestamp.trim()) || new Date().toISOString(),
    };

    allQuestions.push(item);
    newQuestions.push(item);
    added++;
  }

  // Sincronizar importação com o Firestore se conectado
  if (window.db && window.auth && window.auth.currentUser && newQuestions.length > 0) {
    try {
      const batch = window.db.batch();
      // Envia até 450 por lote
      newQuestions.slice(0, 450).forEach(q => {
        const ref = window.db.collection('questions').doc(q.id);
        batch.set(ref, {
          nome:      q.nome,
          whatsapp:  q.whatsapp,
          duvida:    q.duvida,
          status:    q.status,
          archived:  q.archived,
          timestamp: q.timestamp,
          createdAt: firebase.firestore.Timestamp.fromDate(new Date(q.createdAt)),
          origem:    'csv_import'
        }, { merge: true });
      });
      batch.commit().then(() => {
        console.log('[VD] Perguntas importadas sincronizadas com a nuvem!');
      }).catch(err => {
        console.warn('[VD] Erro ao sincronizar batch CSV com Firestore:', err);
      });
    } catch (e) {
      console.warn('[VD] Erro geral ao preparar batch CSV:', e);
    }
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

/** Parse do timestamp do Google Forms com proteção contra Invalid Date */
function parseGoogleTimestamp(str) {
  if (!str) return null;
  try {
    const s = String(str).trim();
    // Formato pt-BR: 12/11/2026 15:30:00 ou 12/11/2026 15:30
    const match = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, d, m, y, h, min, sec] = match;
      const dObj = new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10), parseInt(h, 10), parseInt(min, 10), parseInt(sec || '0', 10));
      if (!isNaN(dObj.getTime())) return dObj.toISOString();
    }
    // Fallback: Date.parse padrão
    const directDate = new Date(s);
    if (!isNaN(directDate.getTime())) return directDate.toISOString();
  } catch (e) {}
  return null;
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
      const inNome   = (q.nome || '').toLowerCase().includes(search);
      const inDuvida = (q.duvida || '').toLowerCase().includes(search);
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
  const safeNome = (q.nome || 'Anônimo').trim();
  const initials = (safeNome.substring(0, 2) || 'AN').toUpperCase();
  const timeStr  = q.createdAt ? new Date(q.createdAt).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  }) : (q.timestamp || '');

  // Formatar WhatsApp para link sem duplicar o 55
  let wppClean = String(q.whatsapp || '').replace(/\D/g, '');
  if (wppClean.startsWith('0') && wppClean.length > 10) wppClean = wppClean.slice(1);
  const fullPhone = (wppClean.startsWith('55') && wppClean.length >= 12) ? wppClean : ('55' + wppClean);
  const wppLink  = wppClean ? `https://wa.me/${fullPhone}` : '#';
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
            <div class="author-name">${escHtml(safeNome)}</div>
            <div class="author-meta">
              <span class="author-time">
                <i data-lucide="clock-3"></i>
                ${escHtml(timeStr)}
              </span>
              ${hasWpp ? `
                <a href="${wppLink}" target="_blank" rel="noopener" class="whatsapp-btn" title="${escHtml(q.whatsapp || '')}">
                  <i data-lucide="phone"></i>
                  WhatsApp
                </a>
              ` : ''}
            </div>
          </div>
        </div>
        <span class="status-badge ${q.status}">${q.status}</span>
      </div>

      <p class="question-text ${q.archived ? 'muted' : ''}">${escHtml(q.duvida || '')}</p>

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

async function updateQuestionStatus(id, newStatus) {
  const isArch = (newStatus === 'Arquivada');
  const q = allQuestions.find(q => q.id === id);
  if (q) {
    q.status   = newStatus;
    q.archived = isArch;
    renderQuestions();
    populateApprovedSelect();
  }

  if (window.db && window.auth && window.auth.currentUser) {
    try {
      await window.db.collection('questions').doc(id).update({
        status:   newStatus,
        archived: isArch
      });
      showToast(`Status atualizado: ${newStatus}`, 'success');
    } catch (err) {
      console.error('[VD Error update]', err);
      showToast('Erro ao sincronizar status: ' + err.message, 'error');
    }
  } else {
    saveQuestionsToStorage();
    showToast(`Status atualizado: ${newStatus}`, 'success');
  }
}

function confirmDeleteQuestion(id) {
  openModal(
    'Excluir Pergunta',
    'Tem certeza que deseja excluir esta pergunta permanentemente? A exclusão será sincronizada em tempo real com todos os computadores.',
    async () => {
      allQuestions = allQuestions.filter(q => q.id !== id);
      renderQuestions();
      populateApprovedSelect();

      if (window.db && window.auth && window.auth.currentUser) {
        try {
          await window.db.collection('questions').doc(id).delete();
          showToast('Pergunta excluída do banco de dados.', 'info');
        } catch (err) {
          console.error('[VD Delete Error]', err);
          showToast('Erro ao excluir no banco: ' + err.message, 'error');
        }
      } else {
        saveQuestionsToStorage();
        showToast('Pergunta excluída localmente.', 'info');
      }
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
      `Isso marcará ${visible.length} pergunta(s) visíveis como "Arquivada", limpando a fila para o próximo episódio. O histórico é preservado e sincronizado com toda a equipe.`,
      async () => {
        visible.forEach(q => {
          const item = allQuestions.find(a => a.id === q.id);
          if (item) { item.status = 'Arquivada'; item.archived = true; }
        });
        renderQuestions();

        if (window.db && window.auth && window.auth.currentUser) {
          try {
            const batch = window.db.batch();
            visible.forEach(q => {
              const ref = window.db.collection('questions').doc(q.id);
              batch.update(ref, { status: 'Arquivada', archived: true });
            });
            await batch.commit();
            showToast(`${visible.length} pergunta(s) arquivada(s) na nuvem! 🎙️`, 'success');
          } catch (err) {
            console.error('[VD Batch Error]', err);
            showToast('Erro ao arquivar lote: ' + err.message, 'error');
          }
        } else {
          saveQuestionsToStorage();
          showToast(`${visible.length} pergunta(s) arquivada(s). Fila limpa! 🎙️`, 'success');
        }
      }
    );
  });

  document.getElementById('btn-approve-all-visible')?.addEventListener('click', async () => {
    const visible = getFilteredQuestions().filter(q => q.status === 'Pendente' && !q.archived);
    if (visible.length === 0) { showToast('Nenhuma pergunta pendente visível.', 'info'); return; }

    visible.forEach(q => {
      const item = allQuestions.find(a => a.id === q.id);
      if (item) item.status = 'Aprovada';
    });
    renderQuestions();

    if (window.db && window.auth && window.auth.currentUser) {
      try {
        const batch = window.db.batch();
        visible.forEach(q => {
          const ref = window.db.collection('questions').doc(q.id);
          batch.update(ref, { status: 'Aprovada' });
        });
        await batch.commit();
        showToast(`${visible.length} pergunta(s) aprovada(s) na nuvem!`, 'success');
      } catch (err) {
        console.error('[VD Batch Approve Error]', err);
        showToast('Erro ao aprovar lote: ' + err.message, 'error');
      }
    } else {
      saveQuestionsToStorage();
      showToast(`${visible.length} pergunta(s) aprovada(s)!`, 'success');
    }
  });

  // Exportar todas as perguntas para CSV compatível com Excel
  document.getElementById('btn-export-questions-csv')?.addEventListener('click', exportQuestionsCSV);

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

/** Exporta o banco de perguntas completo para arquivo CSV com UTF-8 BOM para Excel */
function exportQuestionsCSV() {
  if (!allQuestions || allQuestions.length === 0) {
    showToast('Nenhuma pergunta cadastrada para exportar.', 'info');
    return;
  }

  const headers = ['ID', 'Data/Hora', 'Nome', 'WhatsApp', 'Duvida', 'Status', 'Arquivada', 'Origem'];
  const rows = allQuestions.map(q => [
    q.id,
    q.timestamp || q.createdAt,
    q.nome || 'Anônimo',
    q.whatsapp || '',
    q.duvida || '',
    q.status || 'Pendente',
    q.archived ? 'Sim' : 'Não',
    q.origem || 'firestore'
  ]);

  const csvBody = Papa.unparse({
    fields: headers,
    data: rows
  }, {
    delimiter: ';'
  });

  const blob = new Blob(['\uFEFF' + csvBody], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const dStr = new Date().toISOString().slice(0, 10);
  link.download = `perguntas-podcast-${dStr}.csv`;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);

  showToast(`${allQuestions.length} pergunta(s) exportada(s) para CSV com sucesso!`, 'success');
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
        const autoEl = document.getElementById('ctrl-auto-font');
        if (autoEl && autoEl.checked) autoEl.checked = false;
      }
      drawArt();
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

function populateApprovedSelect(includeId = null) {
  const sel = document.getElementById('gen-question-select');
  if (!sel) return;

  const currentVal = sel.value;

  // Lista todas as perguntas ativas ou a pergunta alvo específica
  const items = allQuestions.filter(q => !q.archived || q.id === includeId);
  sel.innerHTML = '<option value="">— Selecionar uma pergunta da lista —</option>' +
    items.map(q => `<option value="${q.id}">[${q.status}] ${escHtml(q.nome || 'Anônimo')} — ${escHtml((q.duvida || '').substring(0, 50))}...</option>`).join('');

  if (includeId) {
    sel.value = includeId;
  } else if (currentVal && items.some(q => q.id === currentVal)) {
    sel.value = currentVal;
  }
}

function openInGenerator(id) {
  // Ir para aba gerador
  document.querySelector('[data-tab="gerador"]')?.click();

  populateApprovedSelect(id);

  const q = allQuestions.find(item => item.id === id);
  if (q) {
    setVal('ctrl-text', q.duvida || '');
    setVal('ctrl-name', q.nome || 'Anônimo');
    const anonToggle = document.getElementById('ctrl-anon-toggle');
    if (anonToggle) anonToggle.checked = (q.nome === 'Anônimo');
  }

  const sel = document.getElementById('gen-question-select');
  if (sel) sel.value = id;

  drawArt();
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

  // Escalar preview para caber na tela mantendo proporção nítida
  const previewMaxW = currentArtFormat === 'horizontal' ? 540 : 460;
  const previewMaxH = 520;
  const scale = Math.min(previewMaxW / W, previewMaxH / H, 1);
  canvas.style.width  = Math.round(W * scale) + 'px';
  canvas.style.height = Math.round(H * scale) + 'px';

  const hideName = document.getElementById('ctrl-hide-name')?.checked;
  const isAnon   = document.getElementById('ctrl-anon-toggle')?.checked;
  const rawName  = document.getElementById('ctrl-name')?.value.trim();
  const nome     = hideName ? '' : (isAnon ? 'Anônimo' : rawName);
  const texto    = document.getElementById('ctrl-text')?.value.trim() || 'Digite ou selecione uma pergunta na Curadoria...';

  ctx.textBaseline = 'alphabetic';

  if (currentTheme === 'overlay') {
    drawOverlayBroadcast(ctx, W, H, nome, texto);
    return;
  }

  // ── Modelo Oficial: Cetim Dourado ────────────────────────────────────────
  if (currentTheme === 'champagne') {
    if (currentArtFormat === 'horizontal') {
      drawSatinTemplateWidescreen(ctx, W, H, nome, texto);
    } else if (currentArtFormat === 'vertical') {
      drawSatinTemplateStories(ctx, W, H, nome, texto);
    } else {
      drawSatinTemplateSquare(ctx, W, H, nome, texto);
    }
    return;
  }

  // Fundo + iluminação + moldura editorial (tema dark)
  drawBackground(ctx, W, H, currentTheme);
  drawDecorations(ctx, W, H, currentTheme);

  // Layout específico por proporção (16:9 split vs 1:1 / 9:16 vertical stack)
  if (currentArtFormat === 'horizontal') {
    drawWidescreenLayout(ctx, W, H, nome, texto);
  } else {
    drawVerticalStackLayout(ctx, W, H, nome, texto);
  }
}

// ════════════════════════════════════════════════════════════════════════════
//  MODELO OFICIAL — CETIM DOURADO  (champagne theme)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Renderiza o fundo de cetim dourado com ondas e bokeh brilhante.
 * Palheta: champagne quente (#C8933E → #E8BE6A → #F5DCA0 → #A0702A)
 */
function drawSatinFabricBackground(ctx, W, H) {
  // Gradiente base de cetim — ângulo diagonal
  const bg = ctx.createLinearGradient(0, 0, W * 0.9, H);
  bg.addColorStop(0.00, '#7B4E1C');
  bg.addColorStop(0.18, '#B87A30');
  bg.addColorStop(0.38, '#E0AA56');
  bg.addColorStop(0.55, '#F5D990');
  bg.addColorStop(0.72, '#D49A42');
  bg.addColorStop(0.88, '#A06A20');
  bg.addColorStop(1.00, '#6B3E10');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Destaque central de luz (realçando o plissado)
  const spotlight = ctx.createRadialGradient(W * 0.65, H * 0.4, 0, W * 0.65, H * 0.4, W * 0.7);
  spotlight.addColorStop(0,   'rgba(255, 245, 210, 0.55)');
  spotlight.addColorStop(0.4, 'rgba(240, 200, 120, 0.22)');
  spotlight.addColorStop(1,   'rgba(0, 0, 0, 0.0)');
  ctx.fillStyle = spotlight;
  ctx.fillRect(0, 0, W, H);

  // Destaque secundário canto esquerdo superior
  const spot2 = ctx.createRadialGradient(W * 0.08, H * 0.12, 0, W * 0.08, H * 0.12, W * 0.45);
  spot2.addColorStop(0,   'rgba(255, 240, 185, 0.38)');
  spot2.addColorStop(1,   'rgba(0, 0, 0, 0)');
  ctx.fillStyle = spot2;
  ctx.fillRect(0, 0, W, H);

  // Ondas de drapejamento — faixas diagonais sutis
  ctx.save();
  ctx.globalAlpha = 0.07;
  for (let i = 0; i < 7; i++) {
    const wx = (W / 6) * i - W * 0.1;
    const dg = ctx.createLinearGradient(wx, 0, wx + W * 0.18, H);
    dg.addColorStop(0,   'rgba(255,240,180,0)');
    dg.addColorStop(0.4, 'rgba(255,245,195,1)');
    dg.addColorStop(1,   'rgba(255,240,180,0)');
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(wx - W * 0.04, 0);
    ctx.quadraticCurveTo(wx + W * 0.07, H * 0.5, wx + W * 0.12, H);
    ctx.lineTo(wx + W * 0.18, H);
    ctx.quadraticCurveTo(wx + W * 0.11, H * 0.5, wx + W * 0.04, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // Partículas de bokeh dourado
  ctx.save();
  const bokehData = [
    [0.08, 0.15, 3.5, 0.65], [0.15, 0.72, 2.2, 0.50], [0.22, 0.38, 4.0, 0.72],
    [0.31, 0.88, 2.8, 0.45], [0.42, 0.22, 3.0, 0.60], [0.50, 0.65, 4.5, 0.75],
    [0.58, 0.10, 2.0, 0.55], [0.65, 0.80, 3.2, 0.48], [0.72, 0.42, 2.6, 0.62],
    [0.80, 0.18, 4.8, 0.70], [0.87, 0.60, 2.4, 0.42], [0.93, 0.33, 3.6, 0.58],
    [0.12, 0.52, 2.0, 0.40], [0.38, 0.05, 2.5, 0.52], [0.75, 0.92, 3.0, 0.44],
    [0.95, 0.75, 2.2, 0.38], [0.03, 0.85, 1.8, 0.48], [0.55, 0.45, 5.0, 0.80],
    [0.28, 0.60, 1.5, 0.35], [0.68, 0.28, 2.0, 0.42],
  ];
  for (const [rx, ry, r, alpha] of bokehData) {
    const bx = W * rx, by = H * ry;
    const bg2 = ctx.createRadialGradient(bx, by, 0, bx, by, r * (W / 400));
    bg2.addColorStop(0,   `rgba(255,248,210,${alpha})`);
    bg2.addColorStop(0.5, `rgba(230,185,80,${alpha * 0.5})`);
    bg2.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = bg2;
    ctx.beginPath();
    ctx.arc(bx, by, r * (W / 400) * 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Título 3D "PERGUNTA ENVIADA" com bevel dourado metálico e extrusão vinho.
 * Escala automaticamente ao canvas (baseado em W).
 */
function draw3DGoldTitle(ctx, W, H, cx, topY) {
  const fontSize = Math.round(W * 0.085);
  const text     = 'PERGUNTA ENVIADA';
  const depth    = Math.round(fontSize * 0.055);

  ctx.save();
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.font         = `900 ${fontSize}px 'Playfair Display', serif`;

  // Extrusão 3D — camadas vinho escuro deslocadas
  for (let d = depth; d >= 1; d--) {
    const t = d / depth;
    const r = Math.round(80 * t + 24 * (1 - t));
    const g = Math.round(10 * t + 5 * (1 - t));
    const b = Math.round(16 * t + 8 * (1 - t));
    ctx.fillStyle = `rgba(${r},${g},${b},0.90)`;
    ctx.fillText(text, cx + d * 0.6, topY + d * 0.9);
  }

  // Sombra projetada suave
  ctx.shadowColor   = 'rgba(50,10,10,0.55)';
  ctx.shadowBlur    = fontSize * 0.22;
  ctx.shadowOffsetX = depth * 0.8;
  ctx.shadowOffsetY = depth * 1.2;

  // Face dourada com gradiente metálico
  const grd = ctx.createLinearGradient(cx, topY - fontSize, cx, topY + 8);
  grd.addColorStop(0.00, '#FFF8E6');
  grd.addColorStop(0.12, '#F7E9B8');
  grd.addColorStop(0.28, '#DDA34E');
  grd.addColorStop(0.48, '#F5D47A');
  grd.addColorStop(0.65, '#C88B30');
  grd.addColorStop(0.82, '#E8C068');
  grd.addColorStop(1.00, '#A6691A');
  ctx.fillStyle = grd;
  ctx.fillText(text, cx, topY);
  ctx.restore();

  // Borda de bevel — linha fina clara no topo das letras
  ctx.save();
  ctx.font         = `900 ${fontSize}px 'Playfair Display', serif`;
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.strokeStyle  = 'rgba(255,248,220,0.60)';
  ctx.lineWidth    = 1.2;
  ctx.strokeText(text, cx, topY);
  ctx.restore();
}

/**
 * Divisor de filigrana dourado com nó central — estilo clássico editorial.
 */
function drawFiligreeDivider(ctx, cx, y, lineW) {
  const halfLine = lineW * 0.42;
  const knobR    = lineW * 0.025;

  ctx.save();
  // Linha esquerda
  const lgL = ctx.createLinearGradient(cx - halfLine, y, cx - knobR * 3, y);
  lgL.addColorStop(0,   'rgba(166, 120, 40, 0)');
  lgL.addColorStop(0.3, 'rgba(201, 151, 70, 0.8)');
  lgL.addColorStop(1,   'rgba(230, 185, 100, 0.95)');
  ctx.strokeStyle = lgL;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - halfLine, y);
  ctx.lineTo(cx - knobR * 3.5, y);
  ctx.stroke();

  // Linha direita
  const lgR = ctx.createLinearGradient(cx + knobR * 3, y, cx + halfLine, y);
  lgR.addColorStop(0,   'rgba(230, 185, 100, 0.95)');
  lgR.addColorStop(0.7, 'rgba(201, 151, 70, 0.8)');
  lgR.addColorStop(1,   'rgba(166, 120, 40, 0)');
  ctx.strokeStyle = lgR;
  ctx.beginPath();
  ctx.moveTo(cx + knobR * 3.5, y);
  ctx.lineTo(cx + halfLine, y);
  ctx.stroke();

  // Nó central — anel vazio dourado
  const knobG = ctx.createRadialGradient(cx, y, 0, cx, y, knobR);
  knobG.addColorStop(0,   '#FFF5D0');
  knobG.addColorStop(0.4, '#E8BE6A');
  knobG.addColorStop(1,   '#A6701A');
  ctx.strokeStyle = knobG;
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.arc(cx, y, knobR, 0, Math.PI * 2);
  ctx.stroke();

  // Losango decorativo
  ctx.fillStyle = 'rgba(230,185,100,0.85)';
  ctx.beginPath();
  ctx.moveTo(cx,          y - knobR * 1.5);
  ctx.lineTo(cx + knobR * 1.5, y);
  ctx.lineTo(cx,          y + knobR * 1.5);
  ctx.lineTo(cx - knobR * 1.5, y);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Balão de fala fosco (glassmorphism) com cauda inferior central.
 */
function drawFrostedSpeechBubble(ctx, bx, by, bw, bh, radius) {
  const tailW = Math.round(bw * 0.07);
  const tailH = Math.round(bh * 0.11);
  const cx    = bx + bw / 2;
  const bot   = by + bh;
  const r     = radius || Math.round(bw * 0.045);

  ctx.save();

  // Sombra suave sob o balão
  ctx.shadowColor   = 'rgba(100, 55, 10, 0.28)';
  ctx.shadowBlur    = Math.round(bw * 0.065);
  ctx.shadowOffsetY = Math.round(bh * 0.04);

  // Forma do balão (retângulo + cauda)
  function bubblePath() {
    ctx.beginPath();
    ctx.moveTo(bx + r, by);
    ctx.lineTo(bx + bw - r, by);
    ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
    ctx.lineTo(bx + bw, bot - r);
    ctx.quadraticCurveTo(bx + bw, bot, bx + bw - r, bot);
    ctx.lineTo(cx + tailW, bot);
    // Cauda central apontando para baixo
    ctx.quadraticCurveTo(cx + tailW * 0.3, bot + tailH * 0.4, cx, bot + tailH);
    ctx.quadraticCurveTo(cx - tailW * 0.3, bot + tailH * 0.4, cx - tailW, bot);
    ctx.lineTo(bx + r, bot);
    ctx.quadraticCurveTo(bx, bot, bx, bot - r);
    ctx.lineTo(bx, by + r);
    ctx.quadraticCurveTo(bx, by, bx + r, by);
    ctx.closePath();
  }

  // Fill: branco translúcido levemente aquecido (glassmorphism)
  bubblePath();
  const glassG = ctx.createLinearGradient(bx, by, bx + bw * 0.3, by + bh);
  glassG.addColorStop(0,   'rgba(255, 252, 245, 0.88)');
  glassG.addColorStop(0.4, 'rgba(252, 244, 228, 0.78)');
  glassG.addColorStop(1,   'rgba(248, 236, 210, 0.72)');
  ctx.fillStyle = glassG;
  ctx.fill();
  ctx.restore();

  // Borda dourada translúcida
  ctx.save();
  bubblePath();
  const borderG = ctx.createLinearGradient(bx, by, bx + bw, by + bh);
  borderG.addColorStop(0,   'rgba(230,185,100,0.65)');
  borderG.addColorStop(0.5, 'rgba(255,235,170,0.90)');
  borderG.addColorStop(1,   'rgba(200,150,60,0.55)');
  ctx.strokeStyle = borderG;
  ctx.lineWidth   = 2;
  ctx.stroke();
  ctx.restore();

  // Reflexo de luz no topo (realce glassmorphic)
  ctx.save();
  const refH   = Math.round(bh * 0.22);
  const refGrd = ctx.createLinearGradient(bx, by, bx, by + refH);
  refGrd.addColorStop(0,   'rgba(255,255,255,0.45)');
  refGrd.addColorStop(1,   'rgba(255,255,255,0.00)');
  ctx.fillStyle = refGrd;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + bw - r, by);
  ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + r);
  ctx.lineTo(bx + bw, by + refH);
  ctx.lineTo(bx, by + refH);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/**
 * Renderiza o conteúdo textual (nome + pergunta) dentro do balão fosco.
 */
function drawBubbleContent(ctx, bx, by, bw, bh, nome, texto, opts = {}) {
  const scaleFactor = opts.scaleFactor || 1;
  const padX = Math.round(bw * 0.07);
  const padT = Math.round(bh * 0.10);
  const padB = Math.round(bh * 0.10);
  const cx   = bx + bw / 2;

  let curY = by + padT;
  const contX = bx + padX;
  const contW = bw - padX * 2;

  ctx.textBaseline = 'alphabetic';

  if (nome) {
    // Nome do ouvinte em destaque editorial (sem rótulo redundante)
    let nameSize = Math.round(44 * scaleFactor);
    ctx.font = `700 ${nameSize}px 'Playfair Display', serif`;
    while (ctx.measureText(nome).width > contW && nameSize > 22) {
      nameSize -= 2;
      ctx.font = `700 ${nameSize}px 'Playfair Display', serif`;
    }
    ctx.fillStyle = '#230B0E';
    ctx.textAlign = 'center';
    ctx.fillText(nome, cx, curY + nameSize);
    curY += nameSize + Math.round(14 * scaleFactor);

    // Divisória sutil dourada abaixo do nome
    const divW = Math.min(contW * 0.55, Math.max(160, ctx.measureText(nome).width + 60));
    const divX = cx - divW / 2;
    const divG = ctx.createLinearGradient(divX, curY, divX + divW, curY);
    divG.addColorStop(0,   'rgba(166,105,26,0)');
    divG.addColorStop(0.2, 'rgba(201,151,70,0.65)');
    divG.addColorStop(0.5, 'rgba(240,210,140,0.90)');
    divG.addColorStop(0.8, 'rgba(201,151,70,0.65)');
    divG.addColorStop(1,   'rgba(166,105,26,0)');
    ctx.strokeStyle = divG;
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(divX, curY);
    ctx.lineTo(divX + divW, curY);
    ctx.stroke();
    curY += Math.round(20 * scaleFactor);
  }

  // Área útil para o texto da pergunta
  const bodyMaxH = (by + bh - padB) - curY;
  const autoFont = document.getElementById('ctrl-auto-font')?.checked;
  const maxFS    = Math.round((opts.maxFont || 46) * scaleFactor);
  const minFS    = Math.round(20 * scaleFactor);

  let fontSize;
  if (autoFont) {
    fontSize = calcAutoFontSize(ctx, texto, contW, bodyMaxH * 0.92, minFS, maxFS, '450');
  } else {
    const manual = parseInt(document.getElementById('ctrl-font-size')?.value || '32', 10);
    fontSize = Math.round(manual * scaleFactor);
  }

  const lineH = fontSize * 1.52;
  ctx.font     = `450 ${fontSize}px 'Inter', sans-serif`;
  const lines  = getWrappedLines(ctx, texto, contW);
  const textH  = lines.length * lineH;

  // Centralização ótica vertical
  const optOffset = Math.max(0, (bodyMaxH - textH) * 0.38);
  const startY    = curY + fontSize * 0.88 + optOffset;

  ctx.fillStyle = '#1F0A0D';
  ctx.textAlign = 'center';

  // Redraw em centro
  for (let i = 0; i < lines.length; i++) {
    const lineY = startY + i * lineH;
    if (lineY > by + bh - padB + lineH * 0.3) break;
    ctx.fillText(lines[i], cx, lineY);
  }
}

// ── Widescreen 16:9 (1920×1080) — Template de fundo direto ──────────────────
function drawSatinTemplateWidescreen(ctx, W, H, nome, texto) {
  const tpl = getTemplateImage();
  if (tpl) {
    // Desenha a imagem de template em tela cheia
    ctx.drawImage(tpl, 0, 0, W, H);
  } else {
    // Fallback: fundo de cetim gerado
    drawSatinFabricBackground(ctx, W, H);
    draw3DGoldTitle(ctx, W, H, W / 2, Math.round(H * 0.19));
    drawFiligreeDivider(ctx, W / 2, Math.round(H * 0.26), W * 0.5);
  }

  // Texto dentro do balão pré-renderizado no template
  // Coordenadas calibradas para o template-bg.jpg (1024x571 → 1920x1080)
  const scaleX = W / 1024;
  const scaleY = H / 571;
  const bx = Math.round(213 * scaleX) + Math.round(8 * scaleX);
  const by = Math.round(169 * scaleY) + Math.round(6 * scaleY);
  const bw = Math.round(608 * scaleX) - Math.round(16 * scaleX);
  const bh = Math.round(316 * scaleY) - Math.round(10 * scaleY);

  drawBubbleContent(ctx, bx, by, bw, bh, nome, texto, {
    scaleFactor: W / 1080,
    maxFont: 46
  });
}

// ── Feed 1:1 (1080×1080) — Totalmente gerado ────────────────────────────────
function drawSatinTemplateSquare(ctx, W, H, nome, texto) {
  drawSatinFabricBackground(ctx, W, H);

  // Título 3D (y base da baseline da fonte)
  const titleY = Math.round(H * 0.165);
  draw3DGoldTitle(ctx, W, H, W / 2, titleY);

  // Divisor de filigrana
  const divY = Math.round(H * 0.215);
  drawFiligreeDivider(ctx, W / 2, divY, W * 0.55);

  // Balão fosco com espaço para cauda inferior
  const margin = Math.round(W * 0.07);
  const bx     = margin;
  const by     = Math.round(H * 0.248);
  const bw     = W - margin * 2;
  const tailH  = Math.round(H * 0.065);
  const bh     = H - by - tailH - Math.round(H * 0.055);

  drawFrostedSpeechBubble(ctx, bx, by, bw, bh, Math.round(bw * 0.045));
  drawBubbleContent(ctx, bx, by, bw, bh, nome, texto, {
    scaleFactor: 1.0,
    maxFont: 50
  });

  // Pílula de rodapé abaixo da cauda
  _drawSatinFooterPill(ctx, W, H, by + bh + tailH + Math.round(H * 0.014));
}

// ── Stories 9:16 (1080×1920) — Totalmente gerado ────────────────────────────
function drawSatinTemplateStories(ctx, W, H, nome, texto) {
  drawSatinFabricBackground(ctx, W, H);

  // Safe zone: 135px topo / 260px rodapé (Instagram, TikTok, Shorts)
  const safeTop = 150;

  // Título 3D
  const titleY = Math.round(safeTop + H * 0.085);
  draw3DGoldTitle(ctx, W, H * 0.5, W / 2, titleY);

  // Divisor de filigrana
  const divY = Math.round(titleY + H * 0.038);
  drawFiligreeDivider(ctx, W / 2, divY, W * 0.70);

  // Balão fosco — amplo, respeitando safe zones
  const margin = Math.round(W * 0.055);
  const bx     = margin;
  const by     = Math.round(divY + H * 0.025);
  const bw     = W - margin * 2;
  const tailH  = Math.round(H * 0.045);
  const footerY = H - 260; // safe zone inferior
  const bh     = footerY - by - tailH - Math.round(H * 0.02);

  drawFrostedSpeechBubble(ctx, bx, by, bw, bh, Math.round(bw * 0.05));
  drawBubbleContent(ctx, bx, by, bw, bh, nome, texto, {
    scaleFactor: 1.08,
    maxFont: 60
  });

  // Pílula de rodapé dentro da safe zone inferior
  _drawSatinFooterPill(ctx, W, H, footerY + Math.round(H * 0.028));
}

/** Pílula de rodapé reutilizável para os layouts de cetim */
function _drawSatinFooterPill(ctx, W, H, pillY) {
  const pillW = Math.round(W * 0.68);
  const pillH = Math.round(H * 0.034);
  const pillX = (W - pillW) / 2;
  const radius = pillH / 2;

  ctx.save();
  ctx.shadowColor   = 'rgba(0,0,0,0.30)';
  ctx.shadowBlur    = 16;
  ctx.shadowOffsetY = 4;

  const pg = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
  pg.addColorStop(0,   '#7A1018');
  pg.addColorStop(0.5, '#B81A22');
  pg.addColorStop(1,   '#7A1018');
  ctx.fillStyle = pg;
  roundedRect(ctx, pillX, pillY, pillW, pillH, radius);
  ctx.fill();
  ctx.restore();

  ctx.strokeStyle = 'rgba(232,185,100,0.65)';
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, pillX, pillY, pillW, pillH, radius);
  ctx.stroke();

  const fontSize = Math.max(13, Math.round(pillH * 0.44));
  ctx.font      = `600 ${fontSize}px 'Inter', sans-serif`;
  ctx.fillStyle = '#FAF0DC';
  ctx.textAlign = 'center';
  drawTrackedText(ctx, 'PODCAST VENCENDO O DIVÓRCIO  •  CANAL OFICIAL',
    W / 2, pillY + pillH * 0.66, 1.8, 'center');
}

function drawBackground(ctx, W, H, theme) {
  if (theme === 'champagne') {
    const grad = ctx.createLinearGradient(0, 0, W * 0.85, H);
    grad.addColorStop(0,    '#FDF7F0');
    grad.addColorStop(0.45, '#F5DEC8');
    grad.addColorStop(1,    '#E5BA96');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  } else {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0,   '#16090B');
    grad.addColorStop(0.5, '#220E12');
    grad.addColorStop(1,   '#0B0406');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

function drawDecorations(ctx, W, H, theme) {
  const isChampagne = theme === 'champagne';

  // Luz suave de estúdio
  const glow = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'transparent');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  };

  if (isChampagne) {
    glow(W * 0.14, H * 0.10, W * 0.42, 'rgba(255, 255, 255, 0.72)');
    glow(W * 0.88, H * 0.18, W * 0.36, 'rgba(201, 151, 70, 0.20)');
    glow(W * 0.50, H * 0.96, W * 0.48, 'rgba(180, 24, 32, 0.08)');
  } else {
    glow(W * 0.12, H * 0.12, W * 0.34, 'rgba(168, 20, 27, 0.20)');
    glow(W * 0.88, H * 0.85, W * 0.34, 'rgba(201, 151, 70, 0.14)');
    glow(W * 0.50, H * 0.15, W * 0.30, 'rgba(201, 151, 70, 0.08)');
  }

  // Bokeh / partículas sutis de estúdio
  for (let i = 0; i < 34; i++) {
    const px = ((53 * (i * 7919 + 7)) % W + W) % W;
    const py = ((53 * (i * 6271 + 11)) % H + H) % H;
    const pr = (i % 6 === 0) ? 3.2 : (i % 3 === 0 ? 1.8 : 1.0);
    ctx.fillStyle = isChampagne
      ? (i % 2 === 0 ? 'rgba(255,255,255,0.55)' : 'rgba(201,151,70,0.32)')
      : 'rgba(232,199,122,0.28)';
    ctx.beginPath();
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.fill();
  }

  // Moldura editorial fina perimetral
  const m = 24;
  ctx.save();
  const frameG = ctx.createLinearGradient(m, m, W - m, H - m);
  frameG.addColorStop(0,   isChampagne ? 'rgba(201,151,70,0.45)' : 'rgba(201,151,70,0.40)');
  frameG.addColorStop(0.5, isChampagne ? 'rgba(200,29,37,0.25)'  : 'rgba(200,29,37,0.30)');
  frameG.addColorStop(1,   isChampagne ? 'rgba(201,151,70,0.45)' : 'rgba(201,151,70,0.40)');
  ctx.strokeStyle = frameG;
  ctx.lineWidth   = 1.5;
  roundedRect(ctx, m, m, W - m * 2, H - m * 2, 18);
  ctx.stroke();
  ctx.restore();
}

/**
 * Desenha o emblema oficial do podcast recortado de assets/logo.jpg
 * (focado nas alianças + VENCENDO O DIVÓRCIO + PODCAST) em placa arredondada com borda dourada
 */
function drawLogoBadge(ctx, x, y, w, h, radius, isDark) {
  const logoImg = getLogoImage();

  ctx.save();
  ctx.shadowColor   = isDark ? 'rgba(0,0,0,0.75)' : 'rgba(105, 55, 22, 0.25)';
  ctx.shadowBlur    = 28;
  ctx.shadowOffsetY = 8;

  // Base da placa (usada também durante carregamento/fallback)
  const baseG = ctx.createLinearGradient(x, y, x + w, y + h);
  baseG.addColorStop(0, '#FAF0E4');
  baseG.addColorStop(1, '#E9CAA8');
  ctx.fillStyle = baseG;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.fill();
  ctx.restore();

  ctx.save();
  roundedRect(ctx, x, y, w, h, radius);
  ctx.clip();

  if (logoImg) {
    const iw = logoImg.naturalWidth;
    const ih = logoImg.naturalHeight;
    // Recorte limpo focado nos anéis + título + ondas sonoras (exclui "CANAL OFICIAL" redundante)
    const sx = iw * 0.02;
    const sy = ih * 0.19;
    const sw = iw * 0.96;
    const sh = ih * 0.54;
    ctx.drawImage(logoImg, sx, sy, sw, sh, x, y, w, h);

    // Vinheta sutil nas bordas para acabamento integrado
    const vig = ctx.createRadialGradient(
      x + w * 0.5, y + h * 0.5, w * 0.25,
      x + w * 0.5, y + h * 0.5, w * 0.72
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(107, 58, 28, 0.14)');
    ctx.fillStyle = vig;
    ctx.fillRect(x, y, w, h);
  } else {
    // Fallback tipográfico elegante enquanto imagem carrega
    ctx.textAlign = 'center';
    ctx.fillStyle = '#3B1816';
    ctx.font      = `600 ${Math.round(h * 0.13)}px 'Inter', sans-serif`;
    drawTrackedText(ctx, 'VENCENDO O', x + w / 2, y + h * 0.34, 4, 'center');

    ctx.fillStyle = '#A8141B';
    ctx.font      = `900 ${Math.round(h * 0.32)}px 'Playfair Display', serif`;
    ctx.fillText('DIVÓRCIO', x + w / 2, y + h * 0.67);

    ctx.fillStyle = '#5E3824';
    ctx.font      = `600 ${Math.round(h * 0.09)}px 'Inter', sans-serif`;
    drawTrackedText(ctx, 'PODCAST', x + w / 2, y + h * 0.84, 5, 'center');
  }
  ctx.restore();

  // Moldura metálica dourada
  ctx.save();
  const rimG = ctx.createLinearGradient(x, y, x + w, y + h);
  rimG.addColorStop(0,    '#B88635');
  rimG.addColorStop(0.35, '#F3DA99');
  rimG.addColorStop(0.7,  '#C99746');
  rimG.addColorStop(1,    '#8E601B');
  ctx.strokeStyle = rimG;
  ctx.lineWidth   = 2.5;
  roundedRect(ctx, x, y, w, h, radius);
  ctx.stroke();
  ctx.restore();
}

/** Desenha barras de onda sonora vetoriais decorativas */
function drawSoundwave(ctx, cx, cy, totalW, maxH, color) {
  const heights = [0.35, 0.65, 1.0, 0.55, 0.85, 0.45, 0.90, 0.50, 0.30];
  const barW    = Math.max(2.5, totalW / (heights.length * 2.1));
  const gap     = barW * 1.1;
  const startX  = cx - ((heights.length * barW + (heights.length - 1) * gap) / 2);

  ctx.save();
  ctx.fillStyle = color;
  heights.forEach((hRatio, idx) => {
    const bh = Math.max(4, maxH * hRatio);
    const bx = startX + idx * (barW + gap);
    const by = cy - bh / 2;
    roundedRect(ctx, bx, by, barW, bh, barW / 2);
    ctx.fill();
  });
  ctx.restore();
}

/** Desenha texto com espaçamento manual consistente entre letras (sem bugs de canvas letterSpacing) */
function drawTrackedText(ctx, text, x, y, spacing, align = 'left') {
  const chars = Array.from(text);
  let totalW = 0;
  chars.forEach((ch, idx) => {
    totalW += ctx.measureText(ch).width + (idx < chars.length - 1 ? spacing : 0);
  });

  let curX = x;
  if (align === 'center') curX = x - totalW / 2;
  else if (align === 'right') curX = x - totalW;

  const prevAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  chars.forEach((ch, idx) => {
    ctx.fillText(ch, curX, y);
    curX += ctx.measureText(ch).width + (idx < chars.length - 1 ? spacing : 0);
  });
  ctx.textAlign = prevAlign;
}

/**
 * Desenha o card principal da pergunta (usado tanto no layout vertical quanto no 16:9)
 */
function drawLuxuryQuestionCard(ctx, boxX, boxY, boxW, boxH, radius, nome, texto, opts = {}) {
  const isChampagne = currentTheme === 'champagne';
  const scaleFactor = opts.scaleFactor || 1;

  // Sombra em camadas
  ctx.save();
  ctx.shadowColor   = isChampagne ? 'rgba(95, 45, 18, 0.18)' : 'rgba(0, 0, 0, 0.78)';
  ctx.shadowBlur    = 44;
  ctx.shadowOffsetY = 14;

  const cardG = ctx.createLinearGradient(boxX, boxY, boxX, boxY + boxH);
  if (isChampagne) {
    cardG.addColorStop(0, '#FFFFFF');
    cardG.addColorStop(1, '#FCF5EC');
  } else {
    cardG.addColorStop(0, '#221114');
    cardG.addColorStop(1, '#13080A');
  }
  ctx.fillStyle = cardG;
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.fill();
  ctx.restore();

  // Faixa superior colorida recortada dentro do card
  ctx.save();
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.clip();

  const barH = Math.max(7, Math.round(8 * scaleFactor));
  const topBarG = ctx.createLinearGradient(boxX, 0, boxX + boxW, 0);
  topBarG.addColorStop(0,    '#9F1219');
  topBarG.addColorStop(0.5,  '#D4A24E');
  topBarG.addColorStop(1,    '#9F1219');
  ctx.fillStyle = topBarG;
  ctx.fillRect(boxX, boxY, boxW, barH);

  // Aspa decorativa discreta no canto superior direito (sem colidir com texto)
  const quoteSz = Math.round(170 * scaleFactor);
  ctx.font      = `italic 900 ${quoteSz}px 'Playfair Display', serif`;
  ctx.fillStyle = isChampagne ? 'rgba(201, 151, 70, 0.14)' : 'rgba(201, 151, 70, 0.10)';
  ctx.textAlign = 'right';
  ctx.fillText('”', boxX + boxW - Math.round(44 * scaleFactor), boxY + Math.round(145 * scaleFactor));
  ctx.restore();

  // Borda metálica sutil
  ctx.save();
  const borderG = ctx.createLinearGradient(boxX, boxY, boxX + boxW, boxY + boxH);
  borderG.addColorStop(0,   isChampagne ? 'rgba(201,151,70,0.65)' : 'rgba(201,151,70,0.55)');
  borderG.addColorStop(0.5, isChampagne ? 'rgba(255,255,255,0.9)' : 'rgba(168,20,27,0.45)');
  borderG.addColorStop(1,   isChampagne ? 'rgba(201,151,70,0.55)' : 'rgba(201,151,70,0.55)');
  ctx.strokeStyle = borderG;
  ctx.lineWidth   = 2;
  roundedRect(ctx, boxX, boxY, boxW, boxH, radius);
  ctx.stroke();
  ctx.restore();

  // Conteúdo interno
  const padX    = Math.round(boxW * 0.085);
  const padTop  = Math.round(62 * scaleFactor);
  const padBot  = Math.round(58 * scaleFactor);
  const contX   = boxX + padX;
  const contW   = boxW - padX * 2;
  let   curY    = boxY + padTop;

  // Bloco do Nome (se houver)
  if (nome) {
    // Barrinha de destaque + Label
    const lblSize = Math.round(17 * scaleFactor);
    ctx.fillStyle = isChampagne ? '#B8161E' : '#E3B764';
    roundedRect(ctx, contX, curY - Math.round(11 * scaleFactor), Math.round(28 * scaleFactor), Math.round(4 * scaleFactor), 2);
    ctx.fill();

    ctx.font = `700 ${lblSize}px 'Inter', sans-serif`;
    drawTrackedText(
      ctx,
      'PERGUNTA ENVIADA POR',
      contX + Math.round(38 * scaleFactor),
      curY - Math.round(4 * scaleFactor),
      Math.max(1.5, 2.2 * scaleFactor),
      'left'
    );

    curY += Math.round(46 * scaleFactor);

    // Nome em Playfair Display ajustado para não estourar largura
    let nameSize = Math.round(46 * scaleFactor);
    ctx.font = `700 ${nameSize}px 'Playfair Display', serif`;
    while (ctx.measureText(nome).width > contW && nameSize > 24) {
      nameSize -= 2;
      ctx.font = `700 ${nameSize}px 'Playfair Display', serif`;
    }
    ctx.fillStyle = isChampagne ? '#2A1212' : '#F8EFE0';
    ctx.textAlign = 'left';
    ctx.fillText(nome, contX, curY);

    curY += Math.round(22 * scaleFactor);

    // Linha divisória sutil
    const divG = ctx.createLinearGradient(contX, 0, contX + contW * 0.65, 0);
    divG.addColorStop(0, isChampagne ? 'rgba(184, 22, 30, 0.55)' : 'rgba(227, 183, 100, 0.55)');
    divG.addColorStop(1, 'transparent');
    ctx.strokeStyle = divG;
    ctx.lineWidth   = 2;
    ctx.beginPath();
    ctx.moveTo(contX, curY);
    ctx.lineTo(contX + contW * 0.65, curY);
    ctx.stroke();

    curY += Math.round(42 * scaleFactor);
  } else {
    // Sem nome: tag discreta no topo do card
    const lblSize = Math.round(16 * scaleFactor);
    ctx.fillStyle = isChampagne ? '#B8161E' : '#E3B764';
    roundedRect(ctx, contX, curY - Math.round(10 * scaleFactor), Math.round(24 * scaleFactor), Math.round(4 * scaleFactor), 2);
    ctx.fill();

    ctx.font = `700 ${lblSize}px 'Inter', sans-serif`;
    drawTrackedText(
      ctx,
      'PERGUNTA DO PÚBLICO',
      contX + Math.round(34 * scaleFactor),
      curY - Math.round(3 * scaleFactor),
      Math.max(1.5, 2.2 * scaleFactor),
      'left'
    );
    curY += Math.round(46 * scaleFactor);
  }

  // Área útil da dúvida (descontando assinatura discreta na base do card)
  const watermarkZone = Math.round(44 * scaleFactor);
  const bodyMaxH      = (boxY + boxH - padBot - watermarkZone) - curY;

  const autoFont = document.getElementById('ctrl-auto-font')?.checked;
  const maxFS    = Math.round((opts.maxFont || 54) * scaleFactor);
  const minFS    = Math.round(24 * scaleFactor);

  let fontSize;
  if (autoFont) {
    fontSize = calcAutoFontSize(ctx, texto, contW, bodyMaxH * 0.94, minFS, maxFS, '400');
  } else {
    const manual = parseInt(document.getElementById('ctrl-font-size')?.value || '32', 10);
    fontSize = Math.round(manual * scaleFactor);
  }

  const lineH = fontSize * 1.48;
  ctx.font    = `400 ${fontSize}px 'Inter', sans-serif`;
  const lines = getWrappedLines(ctx, texto, contW);
  const textH = lines.length * lineH;

  // Centralização ótica suave quando texto é curto
  const optOffset = Math.max(0, (bodyMaxH - textH) * 0.36);
  const startY    = curY + fontSize * 0.85 + optOffset;

  ctx.fillStyle = isChampagne ? '#2E1615' : '#EFE7DA';
  ctx.textAlign = 'left';
  drawWrappedLines(ctx, lines, contX, startY, lineH, bodyMaxH + fontSize * 0.3);

  // Marca d'água editorial sutil no rodapé interno do card
  const wmY = boxY + boxH - Math.round(28 * scaleFactor);
  drawSoundwave(
    ctx,
    contX + Math.round(22 * scaleFactor),
    wmY - Math.round(5 * scaleFactor),
    Math.round(42 * scaleFactor),
    Math.round(16 * scaleFactor),
    isChampagne ? 'rgba(184, 22, 30, 0.40)' : 'rgba(227, 183, 100, 0.45)'
  );
  ctx.font      = `600 ${Math.round(14 * scaleFactor)}px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? 'rgba(92, 56, 44, 0.55)' : 'rgba(227, 183, 100, 0.55)';
  drawTrackedText(
    ctx,
    'PODCAST VENCENDO O DIVÓRCIO',
    contX + Math.round(54 * scaleFactor),
    wmY,
    1.5,
    'left'
  );
}

/**
 * Layout Vertical Stack: Feed 1:1 (1080x1080) e Stories 9:16 (1080x1920)
 */
function drawVerticalStackLayout(ctx, W, H, nome, texto) {
  const isVertical  = currentArtFormat === 'vertical';
  const isChampagne = currentTheme === 'champagne';

  // Zona do Logo no topo (Stories respeita safe zone de 135px no topo)
  const badgeW = isVertical ? 560 : 510;
  const badgeH = Math.round(badgeW / 1.79);
  const badgeX = (W - badgeW) / 2;
  const badgeY = isVertical ? 140 : 54;

  // Linhas douradas laterais ao emblema para acabamento de estúdio
  const lineY = badgeY + badgeH / 2;
  ctx.save();
  ctx.strokeStyle = isChampagne ? 'rgba(201,151,70,0.42)' : 'rgba(201,151,70,0.35)';
  ctx.lineWidth   = 1.5;
  ctx.beginPath();
  ctx.moveTo(64, lineY);
  ctx.lineTo(badgeX - 24, lineY);
  ctx.moveTo(badgeX + badgeW + 24, lineY);
  ctx.lineTo(W - 64, lineY);
  ctx.stroke();
  ctx.restore();

  drawLogoBadge(ctx, badgeX, badgeY, badgeW, badgeH, 22, !isChampagne);

  // Card principal com folga entre logo e rodapé
  const boxX = 72;
  const boxW = W - 144;
  const boxY = badgeY + badgeH + (isVertical ? 46 : 30);
  const footerReserve = isVertical ? 265 : 108;
  const boxH = H - boxY - footerReserve;

  drawLuxuryQuestionCard(ctx, boxX, boxY, boxW, boxH, 30, nome, texto, {
    scaleFactor: isVertical ? 1.06 : 1.0,
    maxFont:     isVertical ? 56 : 50
  });

  // Rodapé oficial
  if (isVertical) {
    // Em Stories/Reels/Shorts, pílula elegante dentro da zona segura (y ~ 1700)
    const pillW = 680;
    const pillH = 66;
    const pillX = (W - pillW) / 2;
    const pillY = boxY + boxH + 40;

    ctx.save();
    ctx.shadowColor   = 'rgba(0,0,0,0.22)';
    ctx.shadowBlur    = 18;
    ctx.shadowOffsetY = 4;
    const pillG = ctx.createLinearGradient(pillX, pillY, pillX + pillW, pillY);
    if (isChampagne) {
      pillG.addColorStop(0, '#9E1118');
      pillG.addColorStop(1, '#C41C24');
    } else {
      pillG.addColorStop(0, '#261114');
      pillG.addColorStop(1, '#1A0A0D');
    }
    ctx.fillStyle = pillG;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = 'rgba(232, 199, 122, 0.55)';
    ctx.lineWidth   = 1.5;
    roundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.stroke();

    ctx.font      = `600 18px 'Inter', sans-serif`;
    ctx.fillStyle = '#F7EAD2';
    drawTrackedText(ctx, 'PODCAST VENCENDO O DIVÓRCIO  •  CANAL OFICIAL', W / 2, pillY + 40, 1.8, 'center');
  } else {
    // No Feed 1:1, barra inferior limpa de ponta a ponta
    const footH = 82;
    const footY = H - footH;
    const footG = ctx.createLinearGradient(0, footY, W, H);
    if (isChampagne) {
      footG.addColorStop(0,   '#8F1016');
      footG.addColorStop(0.5, '#BA1A22');
      footG.addColorStop(1,   '#8F1016');
    } else {
      footG.addColorStop(0, '#14080A');
      footG.addColorStop(1, '#090305');
    }
    ctx.fillStyle = footG;
    ctx.fillRect(0, footY, W, footH);

    // Filete dourado superior do rodapé
    const lineG = ctx.createLinearGradient(0, 0, W, 0);
    lineG.addColorStop(0,   'transparent');
    lineG.addColorStop(0.2, '#C99746');
    lineG.addColorStop(0.5, '#F2D58F');
    lineG.addColorStop(0.8, '#C99746');
    lineG.addColorStop(1,   'transparent');
    ctx.fillStyle = lineG;
    ctx.fillRect(0, footY, W, 2.5);

    ctx.font      = `600 18px 'Inter', sans-serif`;
    ctx.fillStyle = '#FAF0DE';
    drawTrackedText(ctx, 'PODCAST VENCENDO O DIVÓRCIO   •   CANAL OFICIAL', W / 2, footY + 48, 2.2, 'center');
  }
}

/**
 * Layout Widescreen 16:9 (1920x1080) para Champagne / Dark — Split Editorial de Estúdio
 */
function drawWidescreenLayout(ctx, W, H, nome, texto) {
  const isChampagne = currentTheme === 'champagne';

  // Coluna esquerda de marca (x: 72..630)
  const colCenterX = 352;
  const badgeW     = 500;
  const badgeH     = Math.round(badgeW / 1.79);
  const badgeX     = colCenterX - badgeW / 2;
  const badgeY     = 265;

  drawLogoBadge(ctx, badgeX, badgeY, badgeW, badgeH, 24, !isChampagne);

  // Bloco tipográfico abaixo da logo na coluna esquerda
  const divY = badgeY + badgeH + 46;
  const divG = ctx.createLinearGradient(colCenterX - 130, 0, colCenterX + 130, 0);
  divG.addColorStop(0,   'transparent');
  divG.addColorStop(0.5, '#C99746');
  divG.addColorStop(1,   'transparent');
  ctx.fillStyle = divG;
  ctx.fillRect(colCenterX - 130, divY, 260, 2);

  ctx.font      = `700 18px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? '#A8141B' : '#E3B764';
  drawTrackedText(ctx, 'PODCAST', colCenterX, divY + 52, 5, 'center');

  ctx.font      = `700 38px 'Playfair Display', serif`;
  ctx.fillStyle = isChampagne ? '#2B1414' : '#F6ECE0';
  ctx.textAlign = 'center';
  ctx.fillText('Vencendo o Divórcio', colCenterX, divY + 104);

  drawSoundwave(
    ctx,
    colCenterX,
    divY + 146,
    120,
    24,
    isChampagne ? 'rgba(184, 22, 30, 0.65)' : 'rgba(227, 183, 100, 0.7)'
  );

  ctx.font      = `600 15px 'Inter', sans-serif`;
  ctx.fillStyle = isChampagne ? 'rgba(92, 56, 44, 0.75)' : 'rgba(232, 199, 122, 0.7)';
  drawTrackedText(ctx, 'CANAL OFICIAL', colCenterX, divY + 196, 3.5, 'center');

  // Coluna direita: Card Principal da Pergunta (amplo e ultra legível em 1080p)
  const cardX = 676;
  const cardY = 86;
  const cardW = W - cardX - 80;
  const cardH = H - 172;

  drawLuxuryQuestionCard(ctx, cardX, cardY, cardW, cardH, 34, nome, texto, {
    scaleFactor: 1.24,
    maxFont:     56
  });
}

/**
 * Tema Overlay Transparente (OBS / vMix / Edição) — Lower-Third Profissional
 */
function drawOverlayBroadcast(ctx, W, H, nome, texto) {
  ctx.clearRect(0, 0, W, H);
  const isHoriz    = currentArtFormat === 'horizontal';
  const isVertical = currentArtFormat === 'vertical';

  const sf     = isHoriz ? 1.15 : 0.96;
  const margin = isHoriz ? 84 : 56;
  const dockW  = W - margin * 2;
  const dockH  = isHoriz ? 286 : (isVertical ? 450 : 350);
  const dockX  = margin;
  const dockY  = H - dockH - (isVertical ? 140 : (isHoriz ? 58 : 52));
  const radius = 24;

  // Sombra da barra lower-third
  ctx.save();
  ctx.shadowColor   = 'rgba(0, 0, 0, 0.75)';
  ctx.shadowBlur    = 36;
  ctx.shadowOffsetY = 10;

  const bg = ctx.createLinearGradient(dockX, dockY, dockX + dockW, dockY + dockH);
  bg.addColorStop(0, 'rgba(26, 10, 13, 0.95)');
  bg.addColorStop(1, 'rgba(12, 5, 7, 0.97)');
  ctx.fillStyle = bg;
  roundedRect(ctx, dockX, dockY, dockW, dockH, radius);
  ctx.fill();
  ctx.restore();

  // Faixa lateral esquerda carmesim -> dourado recortada dentro do dock
  ctx.save();
  roundedRect(ctx, dockX, dockY, dockW, dockH, radius);
  ctx.clip();
  const stripG = ctx.createLinearGradient(0, dockY, 0, dockY + dockH);
  stripG.addColorStop(0,   '#C81D25');
  stripG.addColorStop(0.5, '#DFB26B');
  stripG.addColorStop(1,   '#9E1118');
  ctx.fillStyle = stripG;
  ctx.fillRect(dockX, dockY, 10, dockH);
  ctx.restore();

  // Borda fina dourada
  ctx.save();
  const rim = ctx.createLinearGradient(dockX, dockY, dockX + dockW, dockY);
  rim.addColorStop(0,   'rgba(223, 178, 107, 0.85)');
  rim.addColorStop(0.5, 'rgba(245, 218, 152, 0.50)');
  rim.addColorStop(1,   'rgba(200, 29, 37, 0.65)');
  ctx.strokeStyle = rim;
  ctx.lineWidth   = 2;
  roundedRect(ctx, dockX, dockY, dockW, dockH, radius);
  ctx.stroke();
  ctx.restore();

  if (isHoriz) {
    // 16:9 Broadcast: Emblema à esquerda + Conteúdo largo à direita
    const badgeW = 300;
    const badgeH = Math.round(badgeW / 1.79);
    const badgeX = dockX + 36;
    const badgeY = dockY + (dockH - badgeH) / 2;
    drawLogoBadge(ctx, badgeX, badgeY, badgeW, badgeH, 16, true);

    // Divisória vertical sutil
    const divX = badgeX + badgeW + 34;
    ctx.strokeStyle = 'rgba(223, 178, 107, 0.30)';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(divX, dockY + 34);
    ctx.lineTo(divX, dockY + dockH - 34);
    ctx.stroke();

    const contX = divX + 36;
    const contW = (dockX + dockW - 44) - contX;
    let   curY  = dockY + 60;

    // Pílula de identificação + Nome na mesma linha
    const tagTxt = nome ? 'PERGUNTA DE' : 'PERGUNTA DO PÚBLICO';
    ctx.font     = `700 15px 'Inter', sans-serif`;
    const tagW   = ctx.measureText(tagTxt).width + 44;
    ctx.fillStyle = '#B8161E';
    roundedRect(ctx, contX, curY - 24, tagW, 32, 8);
    ctx.fill();
    ctx.fillStyle = '#FFF5E4';
    drawTrackedText(ctx, tagTxt, contX + 16, curY - 3, 1.4, 'left');

    if (nome) {
      ctx.font      = `700 34px 'Playfair Display', serif`;
      ctx.fillStyle = '#F5DFB0';
      ctx.textAlign = 'left';
      ctx.fillText(nome, contX + tagW + 20, curY + 2);
    }

    curY += 46;
    const bodyMaxH = (dockY + dockH - 28) - curY;
    const autoFont = document.getElementById('ctrl-auto-font')?.checked;
    let fontSize   = autoFont
      ? calcAutoFontSize(ctx, texto, contW, bodyMaxH * 0.94, 24, 42, '500')
      : Math.round(parseInt(document.getElementById('ctrl-font-size')?.value || '34', 10) * 1.1);

    ctx.font      = `500 ${fontSize}px 'Inter', sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'left';
    const lines   = getWrappedLines(ctx, texto, contW);
    drawWrappedLines(ctx, lines, contX, curY + fontSize * 0.72, fontSize * 1.38, bodyMaxH);
  } else {
    // 1:1 ou 9:16 Overlay: Cabeçalho compacto + Pergunta abaixo
    const padX   = 44;
    const contX  = dockX + padX;
    const contW  = dockW - padX * 2;
    const badgeW = 190;
    const badgeH = Math.round(badgeW / 1.79);
    drawLogoBadge(ctx, contX, dockY + 28, badgeW, badgeH, 12, true);

    const infoX = contX + badgeW + 24;
    const tagTxt = nome ? 'PERGUNTA ENVIADA POR' : 'PERGUNTA DO PÚBLICO';
    ctx.font      = `700 14px 'Inter', sans-serif`;
    ctx.fillStyle = '#DFB26B';
    drawTrackedText(ctx, tagTxt, infoX, dockY + 60, 1.8, 'left');

    if (nome) {
      let nSz = 32;
      ctx.font = `700 ${nSz}px 'Playfair Display', serif`;
      while (ctx.measureText(nome).width > (dockX + dockW - padX - infoX) && nSz > 20) {
        nSz -= 2;
        ctx.font = `700 ${nSz}px 'Playfair Display', serif`;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.textAlign = 'left';
      ctx.fillText(nome, infoX, dockY + 102);
    }

    const bodyTop  = dockY + 28 + badgeH + 28;
    const bodyMaxH = (dockY + dockH - 28) - bodyTop;
    const autoFont = document.getElementById('ctrl-auto-font')?.checked;
    let fontSize   = autoFont
      ? calcAutoFontSize(ctx, texto, contW, bodyMaxH * 0.94, 22, 42, '500')
      : Math.round(parseInt(document.getElementById('ctrl-font-size')?.value || '30', 10) * sf);

    ctx.font      = `500 ${fontSize}px 'Inter', sans-serif`;
    ctx.fillStyle = '#F7EFE2';
    ctx.textAlign = 'left';
    const lines   = getWrappedLines(ctx, texto, contW);
    drawWrappedLines(ctx, lines, contX, bodyTop + fontSize * 0.78, fontSize * 1.42, bodyMaxH);
  }
}

/** Calcula automaticamente o tamanho de fonte que cabe na área */
function calcAutoFontSize(ctx, text, maxW, maxH, minSize, maxSize, weight = '400') {
  for (let size = maxSize; size >= minSize; size -= 2) {
    ctx.font = `${weight} ${size}px 'Inter', sans-serif`;
    const lines = getWrappedLines(ctx, text, maxW);
    const totalH = lines.length * size * 1.48;
    if (totalH <= maxH) return size;
  }
  return minSize;
}

/** Desenha array de linhas respeitando altura máxima com reticências */
function drawWrappedLines(ctx, lines, x, y, lineH, maxH) {
  let currentY = y;
  for (let i = 0; i < lines.length; i++) {
    if ((i + 1) * lineH > maxH + lineH * 0.25 && i > 0) {
      break;
    }
    let lineText = lines[i];
    const nextExceeds = ((i + 2) * lineH > maxH + lineH * 0.25) && (i < lines.length - 1);
    if (nextExceeds) {
      lineText = lineText.replace(/[.,;:\s]+$/, '') + '...';
    }
    ctx.fillText(lineText, x, currentY);
    currentY += lineH;
  }
}

/** Retorna array de linhas quebradas para o canvas (com fallback para palavras longas) */
function getWrappedLines(ctx, text, maxW) {
  const paragraphs = String(text || '').split('\n');
  const lines = [];

  for (const para of paragraphs) {
    const words = para.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxW) {
        if (current) {
          lines.push(current);
          current = '';
        }
        // Se uma única palavra for maior que maxW, quebra por caractere
        if (ctx.measureText(word).width > maxW) {
          let chunk = '';
          for (const ch of word) {
            if (ctx.measureText(chunk + ch).width > maxW && chunk) {
              lines.push(chunk);
              chunk = ch;
            } else {
              chunk += ch;
            }
          }
          current = chunk;
        } else {
          current = word;
        }
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
  }
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

  const fmt      = ART_FORMATS[currentArtFormat] || ART_FORMATS.square;
  const rawNome  = document.getElementById('ctrl-name')?.value.trim() || 'ouvinte';
  const safeNome = rawNome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase() || 'ouvinte';

  const link     = document.createElement('a');
  link.download  = `vd-podcast-${currentArtFormat}-${safeNome}.png`;
  link.href      = canvas.toDataURL('image/png');
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

  // Notificação específica ao ligar/desligar o modo formulário fechado
  document.getElementById('cfg-manutencao')?.addEventListener('change', (e) => {
    const isClosed = e.target.checked;
    showToast(
      isClosed ? 'Formulário FECHADO para o público (Modo Manutenção) 🔒' : 'Formulário ABERTO para novas perguntas! 🔓',
      isClosed ? 'info' : 'success'
    );
  });

  // Botão Salvar Explícito
  document.getElementById('btn-save-config')?.addEventListener('click', () => {
    const cfg = buildConfigObject();
    saveConfigToStorage(cfg);
    CONFIG = cfg;
    showToast('Configurações salvas e sincronizadas na nuvem!', 'success');
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
