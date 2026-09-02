(function () {
  'use strict';

  const currentDomainEl = document.getElementById('currentDomain');
  const draftsContainerEl = document.getElementById('draftsContainer');
  const emptyStateEl = document.getElementById('emptyState');
  const draftsCounterEl = document.getElementById('draftsCounter');
  const inputSearchEl = document.getElementById('inputSearch');
  const btnClearAllEl = document.getElementById('btnClearAll');
  const toastNotificationEl = document.getElementById('toastNotification');
  const toastMessageEl = document.getElementById('toastMessage');

  let activeTabId = null;
  let currentNormalizedUrl = '';
  let currentDraftsMap = {};
  let toastTimer = null;

  function normalizeUrl(fullUrl) {
    try {
      const parsed = new URL(fullUrl);
      return `${parsed.origin}${parsed.pathname}`;
    } catch {
      return fullUrl;
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return '';

    const diff = Math.floor((Date.now() - timestamp) / 1000);
    if (diff < 30) return 'agora';
    if (diff < 60) return `há ${diff}s`;

    const minutes = Math.floor(diff / 60);
    if (minutes < 60) return `há ${minutes} min`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `há ${hours} h`;

    const days = Math.floor(hours / 24);
    if (days === 1) return 'ontem';
    if (days < 7) return `há ${days} dias`;

    return new Date(timestamp).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  }

  function notifyUser(message) {
    if (toastTimer) clearTimeout(toastTimer);

    toastMessageEl.textContent = message;
    toastNotificationEl.classList.remove('hidden');

    toastTimer = setTimeout(() => {
      toastNotificationEl.classList.add('hidden');
    }, 2000);
  }

  async function initializeActiveContext() {
    try {
      const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (activeTab && activeTab.url) {
        activeTabId = activeTab.id;
        currentNormalizedUrl = normalizeUrl(activeTab.url);

        try {
          const loc = new URL(activeTab.url);
          currentDomainEl.textContent = `${loc.hostname}${loc.pathname !== '/' ? loc.pathname : ''}`;
          currentDomainEl.title = currentNormalizedUrl;
        } catch {
          currentDomainEl.textContent = currentNormalizedUrl;
        }
      } else {
        currentDomainEl.textContent = 'Página não suportada';
      }
    } catch {
      currentDomainEl.textContent = 'Erro ao ler endereço';
    }
  }

  async function fetchStoredDrafts() {
    if (!currentNormalizedUrl) {
      renderDraftsList([]);
      return;
    }

    const storageKey = `drafts_${currentNormalizedUrl}`;

    try {
      const payload = await chrome.storage.local.get(storageKey);
      currentDraftsMap = payload[storageKey] || {};
      applyDraftsFilter();
    } catch {
      renderDraftsList([]);
    }
  }

  function applyDraftsFilter() {
    const term = (inputSearchEl.value || '').trim().toLowerCase();
    const list = Object.values(currentDraftsMap);

    list.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const matched = list.filter(item => {
      if (!term) return true;
      const label = (item.fieldLabel || '').toLowerCase();
      const content = (item.text || '').toLowerCase();
      const selector = (item.selector || '').toLowerCase();
      return label.includes(term) || content.includes(term) || selector.includes(term);
    });

    renderDraftsList(matched);
  }

  function renderDraftsList(drafts) {
    draftsContainerEl.innerHTML = '';
    const totalCount = Object.keys(currentDraftsMap).length;

    draftsCounterEl.textContent = `${totalCount} ${totalCount === 1 ? 'item' : 'itens'}`;

    if (!drafts || drafts.length === 0) {
      emptyStateEl.classList.remove('hidden');
      draftsContainerEl.classList.add('hidden');
      btnClearAllEl.style.display = totalCount > 0 ? 'inline-flex' : 'none';
      return;
    }

    emptyStateEl.classList.add('hidden');
    draftsContainerEl.classList.remove('hidden');
    btnClearAllEl.style.display = 'inline-flex';

    const fragment = document.createDocumentFragment();
    drafts.forEach(draft => {
      const card = buildDraftCard(draft);
      fragment.appendChild(card);
    });
    draftsContainerEl.appendChild(fragment);
  }

  function buildDraftCard(draft) {
    const card = document.createElement('article');
    card.className = 'draft-card';
    card.dataset.fieldId = draft.fieldId;

    const preview = draft.text.length > 100 
      ? draft.text.slice(0, 100) + '...'
      : draft.text;

    card.innerHTML = `
      <div class="card-header">
        <span class="field-badge" title="${sanitizeText(draft.selector || draft.fieldId)}">
          ${sanitizeText(draft.fieldLabel || draft.fieldId || 'Campo de texto')}
        </span>
        <span class="time-ago">${formatTimeAgo(draft.updatedAt)}</span>
      </div>
      <div class="card-preview">${sanitizeText(preview)}</div>
      <div class="card-actions">
        <button class="btn-action btn-copy" title="Copiar texto">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
          </svg>
          <span>Copiar</span>
        </button>
        <button class="btn-action btn-restore" title="Restaurar no formulário">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>Restaurar</span>
        </button>
        <button class="btn-icon danger btn-delete" title="Excluir rascunho">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    `;

    const copyBtn = card.querySelector('.btn-copy');
    const restoreBtn = card.querySelector('.btn-restore');
    const deleteBtn = card.querySelector('.btn-delete');

    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(draft.text);
        copyBtn.classList.add('copied');
        copyBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>
          <span>Copiado</span>
        `;
        notifyUser('Texto copiado com sucesso.');

        setTimeout(() => {
          copyBtn.classList.remove('copied');
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span>Copiar</span>
          `;
        }, 1800);
      } catch {
        notifyUser('Falha ao copiar para a área de transferência.');
      }
    });

    restoreBtn.addEventListener('click', async () => {
      if (!activeTabId) {
        notifyUser('Nenhuma aba ativa identificada.');
        return;
      }

      restoreBtn.disabled = true;
      restoreBtn.innerHTML = `<span>Restaurando...</span>`;

      try {
        const reply = await chrome.tabs.sendMessage(activeTabId, {
          action: 'RESTORE_DRAFT',
          selector: draft.selector,
          fieldId: draft.fieldId,
          text: draft.text
        });

        if (reply && reply.success) {
          notifyUser('Texto restaurado no campo da página.');
          restoreBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="20 6 9 17 4 12"></polyline>
            </svg>
            <span>Restaurado</span>
          `;
        } else {
          notifyUser((reply && reply.error) || 'Campo não encontrado na página.');
          restoreBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Restaurar</span>
          `;
        }
      } catch {
        notifyUser('Recarregue a página e tente novamente.');
        restoreBtn.innerHTML = `
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="1 4 1 10 7 10"></polyline>
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
          </svg>
          <span>Restaurar</span>
        `;
      } finally {
        restoreBtn.disabled = false;
        setTimeout(() => {
          restoreBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="1 4 1 10 7 10"></polyline>
              <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path>
            </svg>
            <span>Restaurar</span>
          `;
        }, 1800);
      }
    });

    deleteBtn.addEventListener('click', () => {
      card.classList.add('removing');
      setTimeout(async () => {
        await removeSpecificDraft(draft.fieldId);
      }, 120);
    });

    return card;
  }

  async function removeSpecificDraft(fieldId) {
    if (!currentNormalizedUrl) return;

    const storageKey = `drafts_${currentNormalizedUrl}`;

    try {
      delete currentDraftsMap[fieldId];

      if (Object.keys(currentDraftsMap).length === 0) {
        await chrome.storage.local.remove(storageKey);
      } else {
        await chrome.storage.local.set({ [storageKey]: currentDraftsMap });
      }

      notifyUser('Rascunho excluído.');
      applyDraftsFilter();
    } catch {
      notifyUser('Erro ao excluir rascunho.');
    }
  }

  async function removeAllPageDrafts() {
    if (!currentNormalizedUrl) return;

    const count = Object.keys(currentDraftsMap).length;
    if (count === 0) return;

    const answer = confirm(`Deseja realmente apagar todos os ${count} rascunhos salvos para esta página?`);
    if (!answer) return;

    const storageKey = `drafts_${currentNormalizedUrl}`;

    try {
      await chrome.storage.local.remove(storageKey);
      currentDraftsMap = {};
      notifyUser('Todos os rascunhos desta página foram removidos.');
      applyDraftsFilter();
    } catch {
      notifyUser('Erro ao limpar rascunhos.');
    }
  }

  function sanitizeText(raw) {
    if (!raw) return '';
    const span = document.createElement('span');
    span.textContent = raw;
    return span.innerHTML;
  }

  inputSearchEl.addEventListener('input', applyDraftsFilter);
  btnClearAllEl.addEventListener('click', removeAllPageDrafts);

  document.addEventListener('DOMContentLoaded', async () => {
    await initializeActiveContext();
    await fetchStoredDrafts();
  });

})();
