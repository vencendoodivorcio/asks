/**
 * app.js — Vencendo o Divórcio Podcast
 * Lógica da Página Pública de Envio de Perguntas (index.html)
 */

// ============================================================
//  CONFIGURAÇÃO & ESTADO GLOBAL
// ============================================================
let CONFIG = null;

const state = {
  isSubmitting: false,
  charMax: 500,
};

// ============================================================
//  INICIALIZAÇÃO
// ============================================================
document.addEventListener('DOMContentLoaded', async () => {
  // 1. Inicializar ícones Lucide
  if (window.lucide) lucide.createIcons();

  // 2. Carregar configuração
  await loadConfig();

  // 3. Inicializar partículas de fundo
  initParticles();

  // 4. Registrar eventos
  registerEvents();

  // 5. Re-renderizar ícones após manipulação de DOM dinâmico
  if (window.lucide) lucide.createIcons();
});

// ============================================================
//  CARREGAR config.json
// ============================================================
async function loadConfig() {
  // 1. Tentar ler do localStorage (caso o usuário tenha editado no mesmo navegador)
  let localCfg = null;
  try {
    const raw = localStorage.getItem('vd_config_v1');
    if (raw) localCfg = JSON.parse(raw);
  } catch (e) {}

  try {
    const res = await fetch('config.json?t=' + Date.now()); // cache-bust
    if (res.ok) {
      CONFIG = await res.json();
    } else if (localCfg) {
      CONFIG = localCfg;
    } else {
      throw new Error('Falha ao carregar config.json');
    }
  } catch (err) {
    console.warn('[VD] Não foi possível carregar config.json. Usando local/padrões.', err);
    CONFIG = localCfg || {
      podcast: {
        titulo: 'Vencendo o Divórcio',
        subtitulo: 'Podcast',
        edicao_atual: 'Episódio Atual',
        descricao: 'Envie sua dúvida sobre vida amorosa e relacionamentos.',
      },
      google_forms: {
        form_url: 'https://docs.google.com/forms/d/e/1FAIpQLSdAwxk2isRo-2ZGLvjT6jzURBGYsNy8cScc-Bz1oAIV4kJ0Yw/formResponse',
        entry_nome: 'entry.1577453072',
        entry_whatsapp: 'entry.1460691419',
        entry_duvida: 'entry.596302096',
      },
      configuracoes: {
        manutencao: false,
        mensagem_manutencao: 'As perguntas estão encerradas.',
        max_chars_duvida: 500,
      },
    };
  }

  applyConfig();

  // 3. Ouvir configurações em tempo real do Firestore (modo formulário fechado / manutenção)
  if (window.db) {
    try {
      window.db.collection('settings').doc('general').onSnapshot(doc => {
        if (doc.exists) {
          const remote = doc.data();
          CONFIG = {
            ...(CONFIG || {}),
            ...remote,
            podcast:       { ...(CONFIG?.podcast || {}), ...(remote.podcast || {}) },
            configuracoes: { ...(CONFIG?.configuracoes || {}), ...(remote.configuracoes || {}) },
            google_forms:  { ...(CONFIG?.google_forms || {}), ...(remote.google_forms || {}) }
          };
          applyConfig();
        }
      }, err => {
        console.warn('[VD] Erro ao sincronizar settings:', err);
      });
    } catch (e) {
      console.warn('[VD] Erro ao registrar listener de settings:', e);
    }
  }
}

function applyConfig() {
  if (!CONFIG) return;
  const pod = CONFIG.podcast || {};
  const cfg = CONFIG.configuracoes || {};

  const descEl = document.getElementById('header-desc');
  if (descEl && pod.descricao) descEl.textContent = pod.descricao;

  // Max chars para a dúvida
  state.charMax = cfg.max_chars_duvida || 500;
  const textarea = document.getElementById('input-duvida');
  if (textarea) textarea.maxLength = state.charMax;
  const charMaxEl = document.getElementById('char-max');
  if (charMaxEl) charMaxEl.textContent = state.charMax;

  // Manutenção / Formulário Fechado em tempo real
  const overlay = document.getElementById('maintenance-overlay');
  const msgEl   = document.getElementById('maintenance-msg');
  if (cfg.manutencao) {
    if (overlay) overlay.classList.remove('hidden');
    if (msgEl) msgEl.textContent = cfg.mensagem_manutencao || 'As perguntas estão encerradas no momento. Aguarde o próximo episódio!';
  } else {
    if (overlay) overlay.classList.add('hidden');
  }
}

// ============================================================
//  REGISTRO DE EVENTOS
// ============================================================
function registerEvents() {
  // Checkbox Anônimo
  const checkAnonimo = document.getElementById('check-anonimo');
  const inputNome    = document.getElementById('input-nome');
  if (checkAnonimo && inputNome) {
    checkAnonimo.addEventListener('change', () => {
      if (checkAnonimo.checked) {
        inputNome.value    = 'Anônimo';
        inputNome.disabled = true;
      } else {
        inputNome.value    = '';
        inputNome.disabled = false;
        inputNome.focus();
      }
    });
  }

  // Máscara WhatsApp
  const inputWpp = document.getElementById('input-whatsapp');
  if (inputWpp) {
    inputWpp.addEventListener('input', maskPhone);
    inputWpp.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace') {
        // Permite deletar normalmente; a máscara será re-aplicada no input
      }
    });
  }

  // Contador de caracteres da dúvida
  const textarea = document.getElementById('input-duvida');
  if (textarea) {
    textarea.addEventListener('input', updateCharCounter);
  }

  // Envio do formulário
  const form = document.getElementById('question-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }

  // Botão "Enviar Outra Pergunta"
  const btnNew = document.getElementById('btn-new-question');
  if (btnNew) {
    btnNew.addEventListener('click', resetForm);
  }
}

// ============================================================
//  MÁSCARA DE TELEFONE BRASILEIRO  (00) 00000-0000
// ============================================================
function maskPhone(e) {
  let v = e.target.value.replace(/\D/g, '').substring(0, 11);
  let masked = '';
  if (v.length === 0) {
    masked = '';
  } else if (v.length <= 2) {
    masked = `(${v}`;
  } else if (v.length <= 7) {
    masked = `(${v.slice(0,2)}) ${v.slice(2)}`;
  } else if (v.length <= 11) {
    masked = `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
  }
  e.target.value = masked;
}

// ============================================================
//  CONTADOR DE CARACTERES
// ============================================================
function updateCharCounter() {
  const textarea  = document.getElementById('input-duvida');
  const countEl   = document.getElementById('char-count');
  const counterEl = document.getElementById('char-counter-display');
  if (!textarea || !countEl) return;

  const len = textarea.value.length;
  const max = state.charMax;
  countEl.textContent = len;

  // Mudar cor conforme proximidade do limite
  if (counterEl) {
    counterEl.classList.remove('warning', 'danger');
    if (len >= max * 0.9) {
      counterEl.classList.add('danger');
    } else if (len >= max * 0.7) {
      counterEl.classList.add('warning');
    }
  }
}

// ============================================================
//  VALIDAÇÃO
// ============================================================
function validateForm() {
  let valid = true;

  const nome     = document.getElementById('input-nome').value.trim();
  const wpp      = document.getElementById('input-whatsapp').value.trim();
  const duvida   = document.getElementById('input-duvida').value.trim();
  const isAnon   = document.getElementById('check-anonimo').checked;

  // Limpar erros anteriores
  ['error-nome','error-whatsapp','error-duvida'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.textContent = '';
  });

  ['input-nome','input-whatsapp','input-duvida'].forEach(id => {
    document.getElementById(id)?.classList.remove('has-error');
  });

  // Nome
  if (!isAnon && nome.length < 2) {
    setError('input-nome', 'error-nome', 'Por favor, informe seu nome (ou marque "Anônimo").');
    valid = false;
  }

  // WhatsApp — deve ter 11 dígitos (DDD + 9 dígitos)
  const wppDigits = wpp.replace(/\D/g, '');
  if (wppDigits.length < 10 || wppDigits.length > 11) {
    setError('input-whatsapp', 'error-whatsapp', 'Informe um número de WhatsApp válido com DDD. Ex: (11) 99999-9999');
    valid = false;
  }

  // Dúvida
  if (duvida.length < 15) {
    setError('input-duvida', 'error-duvida', 'Detalhe um pouco mais sua dúvida (mínimo 15 caracteres).');
    valid = false;
  }

  return valid;
}

function setError(inputId, errorId, msg) {
  const input = document.getElementById(inputId);
  const error = document.getElementById(errorId);
  if (input) {
    input.classList.add('has-error');
    input.classList.add('shake');
    setTimeout(() => input.classList.remove('shake'), 500);
  }
  if (error) error.textContent = msg;
}

// ============================================================
//  ENVIO DO FORMULÁRIO
// ============================================================
async function handleSubmit(e) {
  e.preventDefault();

  if (CONFIG?.configuracoes?.manutencao) {
    alert(CONFIG.configuracoes.mensagem_manutencao || 'As perguntas estão encerradas no momento.');
    return;
  }

  if (state.isSubmitting) return;
  if (!validateForm()) return;

  state.isSubmitting = true;
  setBtnLoading(true);

  const nome   = document.getElementById('input-nome').value.trim();
  const wpp    = document.getElementById('input-whatsapp').value.trim();
  const duvida = document.getElementById('input-duvida').value.trim();

  // 1. Gravar em tempo real no Firestore (sincroniza instantaneamente com todos os PCs do Backstage)
  let firestorePromise = Promise.resolve();
  if (window.db) {
    firestorePromise = window.db.collection('questions').add({
      nome:     nome,
      whatsapp: wpp,
      duvida:   duvida,
      status:   'Pendente',
      archived: false,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      origem:   'web_form'
    });
  }

  // 2. Backup paralelo no Google Forms (mantém a planilha do Google atualizada)
  if (CONFIG?.google_forms?.form_url && !CONFIG.google_forms.form_url.includes('SEU_FORM_ID')) {
    try {
      const formData = new FormData();
      formData.append(CONFIG.google_forms.entry_nome,     nome);
      formData.append(CONFIG.google_forms.entry_whatsapp, wpp);
      formData.append(CONFIG.google_forms.entry_duvida,   duvida);

      fetch(CONFIG.google_forms.form_url, {
        method: 'POST',
        mode:   'no-cors',
        body:   formData,
      }).catch(err => console.warn('[VD] Falha silenciosa no envio secundário ao Forms:', err));
    } catch (e) {
      console.warn('[VD] Erro ao preparar envio ao Forms:', e);
    }
  }

  try {
    await firestorePromise;
    showSuccess();
  } catch (err) {
    console.error('[VD] Erro ao salvar no Firestore:', err);
    // Fallback: enviar via iframe se o Firebase falhar
    submitViaIframe(nome, wpp, duvida);
    setTimeout(showSuccess, 1500);
  } finally {
    state.isSubmitting = false;
    setBtnLoading(false);
  }
}

/**
 * Fallback de envio via iframe oculto.
 * Cria um form temporário apontando para o iframe.
 */
function submitViaIframe(nome, wpp, duvida) {
  const f = CONFIG.google_forms;
  const tempForm = document.createElement('form');
  tempForm.method  = 'POST';
  tempForm.action  = f.form_url;
  tempForm.target  = 'hidden-iframe';
  tempForm.style.display = 'none';

  const addInput = (name, value) => {
    const inp = document.createElement('input');
    inp.type  = 'hidden';
    inp.name  = name;
    inp.value = value;
    tempForm.appendChild(inp);
  };

  addInput(f.entry_nome,     nome);
  addInput(f.entry_whatsapp, wpp);
  addInput(f.entry_duvida,   duvida);

  document.body.appendChild(tempForm);
  tempForm.submit();
  setTimeout(() => document.body.removeChild(tempForm), 3000);
}

// ============================================================
//  UI — ESTADOS DO BOTÃO & TELAS
// ============================================================
function setBtnLoading(loading) {
  const btn     = document.getElementById('btn-submit');
  const btnText = btn?.querySelector('.btn-text');
  const btnLoad = btn?.querySelector('.btn-loading');
  if (!btn) return;

  btn.disabled = loading;
  if (loading) {
    btnText?.classList.add('hidden');
    btnLoad?.classList.remove('hidden');
  } else {
    btnText?.classList.remove('hidden');
    btnLoad?.classList.add('hidden');
  }
}

function showSuccess() {
  document.getElementById('form-container')?.classList.add('hidden');
  const successEl = document.getElementById('success-screen');
  successEl?.classList.remove('hidden');

  // Re-renderizar ícones na tela de sucesso
  if (window.lucide) lucide.createIcons();

  // Scroll suave para o topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function resetForm() {
  document.getElementById('question-form')?.reset();
  document.getElementById('char-count').textContent = '0';
  document.getElementById('char-counter-display')?.classList.remove('warning', 'danger');
  document.getElementById('input-nome').disabled = false;

  document.getElementById('success-screen')?.classList.add('hidden');
  document.getElementById('form-container')?.classList.remove('hidden');

  // Scroll suave para o topo
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ============================================================
//  PARTÍCULAS DE FUNDO (Canvas)
// ============================================================
function initParticles() {
  const canvas = document.getElementById('particles-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  let W = canvas.width  = window.innerWidth;
  let H = canvas.height = window.innerHeight;

  window.addEventListener('resize', () => {
    W = canvas.width  = window.innerWidth;
    H = canvas.height = window.innerHeight;
  });

  // Paleta: brilhos dourados, brancos luminosos e carmesim suaves sobre fundo champagne
  const colors = [
    'rgba(255,255,255,0.95)',
    'rgba(201,151,70,0.85)',
    'rgba(223,178,107,0.85)',
    'rgba(200,29,37,0.45)',
    'rgba(255,244,214,0.9)',
  ];

  const NUM = 85;
  const particles = Array.from({ length: NUM }, () => createParticle(W, H, colors));

  function animate() {
    ctx.clearRect(0, 0, W, H);

    for (const p of particles) {
      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle   = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur  = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      p.x += p.vx;
      p.y += p.vy;
      p.alpha += p.va;

      // Resetar quando sair da tela ou ficar invisível
      if (p.x < -10 || p.x > W + 10 || p.y < -10 || p.y > H + 10 || p.alpha <= 0) {
        Object.assign(p, createParticle(W, H, colors));
        p.alpha = 0; // começa invisível, vai aparecer
      }
    }

    requestAnimationFrame(animate);
  }

  animate();
}

function createParticle(W, H, colors) {
  return {
    x:     Math.random() * W,
    y:     Math.random() * H,
    r:     Math.random() * 3.2 + 1.2,
    vx:    (Math.random() - 0.5) * 0.45,
    vy:    -(Math.random() * 0.6 + 0.15), // sobe levemente
    alpha: Math.random() * 0.75 + 0.2,
    va:    (Math.random() - 0.35) * 0.004, // fade in/out
    color: colors[Math.floor(Math.random() * colors.length)],
  };
}
