(function () {
  'use strict';

  const RESTRICTED_TERMS = [
    'card', 'cvv', 'credit', 'token', 'auth', 'pass',
    'secret', 'ssn', 'pin', 'cvc', 'securitycode',
    'cc-number', 'cc-exp', 'cc-csc', 'current-password',
    'new-password', 'one-time-code', 'private'
  ];

  const elementMetadataCache = new WeakMap();
  const elementEligibilityCache = new WeakMap();
  const lastPersistedValues = new Map();
  const inputDebounceMap = new Map();
  const DEBOUNCE_TIME = 500;

  function getCurrentNormalizedUrl() {
    try {
      const loc = new URL(window.location.href);
      return `${loc.origin}${loc.pathname}`;
    } catch {
      return window.location.origin + window.location.pathname;
    }
  }

  function isEligibleInput(element) {
    if (!element || !(element instanceof HTMLElement)) return false;

    if (elementEligibilityCache.has(element)) {
      return elementEligibilityCache.get(element);
    }

    let eligible = false;

    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true' || element.getAttribute('contenteditable') === '') {
      eligible = !containsSensitiveData(element);
    } else {
      const tag = element.tagName.toUpperCase();

      if (tag === 'TEXTAREA') {
        eligible = !containsSensitiveData(element);
      } else if (tag === 'INPUT') {
        const type = (element.getAttribute('type') || 'text').toLowerCase();
        const validTypes = ['text', 'email', 'search', 'url', 'tel'];
        if (validTypes.includes(type)) {
          eligible = !containsSensitiveData(element);
        }
      }
    }

    elementEligibilityCache.set(element, eligible);
    return eligible;
  }

  function containsSensitiveData(element) {
    if (element.tagName === 'INPUT' && (element.type || '').toLowerCase() === 'password') {
      return true;
    }

    const inspectList = [
      element.id,
      element.name,
      element.getAttribute('type'),
      element.getAttribute('autocomplete'),
      element.getAttribute('placeholder'),
      element.getAttribute('aria-label'),
      element.className
    ];

    for (const attr of inspectList) {
      if (!attr || typeof attr !== 'string') continue;
      const lower = attr.toLowerCase();
      for (const term of RESTRICTED_TERMS) {
        if (lower.includes(term)) return true;
      }
    }

    const formParent = element.closest('form');
    if (formParent) {
      const formChecks = [
        formParent.id,
        formParent.name,
        formParent.className,
        formParent.getAttribute('action')
      ];

      for (const val of formChecks) {
        if (!val || typeof val !== 'string') continue;
        const lowerForm = val.toLowerCase();
        if (lowerForm.includes('password') || lowerForm.includes('checkout') || lowerForm.includes('payment')) {
          for (const term of RESTRICTED_TERMS) {
            if (lowerForm.includes(term)) return true;
          }
        }
      }
    }

    return false;
  }

  function buildElementPath(element) {
    if (element.id) {
      return `#${CSS.escape(element.id)}`;
    }

    const segments = [];
    let current = element;

    while (current && current.nodeType === Node.ELEMENT_NODE && current !== document.body && current !== document.documentElement) {
      let tag = current.tagName.toLowerCase();

      if (current.id) {
        tag = `#${CSS.escape(current.id)}`;
        segments.unshift(tag);
        break;
      }

      if (current.name) {
        tag += `[name="${CSS.escape(current.name)}"]`;
      }

      let sibling = current;
      let count = 1;
      while (sibling.previousElementSibling) {
        sibling = sibling.previousElementSibling;
        if (sibling.tagName === current.tagName) {
          count++;
        }
      }

      if (count > 1) {
        tag += `:nth-of-type(${count})`;
      }

      segments.unshift(tag);
      current = current.parentElement;
    }

    return segments.join(' > ');
  }

  function getFieldFriendlyName(element) {
    if (element.id) {
      const boundLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      if (boundLabel && boundLabel.innerText.trim()) {
        return boundLabel.innerText.trim().slice(0, 40);
      }
    }

    const wrappingLabel = element.closest('label');
    if (wrappingLabel && wrappingLabel.innerText.trim()) {
      return wrappingLabel.innerText.trim().slice(0, 40);
    }

    if (element.getAttribute('aria-label')) {
      return element.getAttribute('aria-label').trim().slice(0, 40);
    }

    if (element.getAttribute('placeholder')) {
      return element.getAttribute('placeholder').trim().slice(0, 40);
    }

    if (element.name) {
      return element.name;
    }

    if (element.id) {
      return element.id;
    }

    return element.tagName.toLowerCase();
  }

  function inspectElementDescriptor(element) {
    if (elementMetadataCache.has(element)) {
      return elementMetadataCache.get(element);
    }

    let fieldId = '';
    let selector = '';

    if (element.id && document.querySelectorAll(`#${CSS.escape(element.id)}`).length === 1) {
      fieldId = element.id;
      selector = `#${CSS.escape(element.id)}`;
    } else if (element.name) {
      const matchGroup = document.querySelectorAll(`[name="${CSS.escape(element.name)}"]`);
      if (matchGroup.length === 1) {
        fieldId = element.name;
        selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]`;
      } else {
        const idx = Array.from(matchGroup).indexOf(element);
        fieldId = `${element.name}_${idx}`;
        selector = `${element.tagName.toLowerCase()}[name="${CSS.escape(element.name)}"]:nth-of-type(${idx + 1})`;
      }
    } else {
      selector = buildElementPath(element);
      fieldId = selector;
    }

    const fieldLabel = getFieldFriendlyName(element);
    const descriptor = { fieldId, selector, fieldLabel };
    elementMetadataCache.set(element, descriptor);
    return descriptor;
  }

  function extractTextValue(element) {
    if (element.isContentEditable || element.getAttribute('contenteditable') === 'true' || element.getAttribute('contenteditable') === '') {
      return element.innerText || element.textContent || '';
    }
    return element.value || '';
  }

  async function saveFieldDraft(element) {
    if (!isEligibleInput(element)) return;

    const urlKey = `drafts_${getCurrentNormalizedUrl()}`;
    const textContent = extractTextValue(element);
    const { fieldId, selector, fieldLabel } = inspectElementDescriptor(element);

    if (lastPersistedValues.get(fieldId) === textContent) {
      return;
    }

    try {
      const stored = await chrome.storage.local.get(urlKey);
      const pageDrafts = stored[urlKey] || {};

      if (!textContent || textContent.trim() === '') {
        lastPersistedValues.delete(fieldId);
        if (pageDrafts[fieldId]) {
          delete pageDrafts[fieldId];
          if (Object.keys(pageDrafts).length === 0) {
            await chrome.storage.local.remove(urlKey);
          } else {
            await chrome.storage.local.set({ [urlKey]: pageDrafts });
          }
        }
        return;
      }

      pageDrafts[fieldId] = {
        fieldId,
        selector,
        fieldLabel,
        text: textContent,
        updatedAt: Date.now()
      };

      await chrome.storage.local.set({ [urlKey]: pageDrafts });
      lastPersistedValues.set(fieldId, textContent);
    } catch {
      // storage exception handled quietly
    }
  }

  function onUserTyping(event) {
    const el = event.target;
    if (!isEligibleInput(el)) return;

    const { fieldId } = inspectElementDescriptor(el);

    if (inputDebounceMap.has(fieldId)) {
      clearTimeout(inputDebounceMap.get(fieldId));
    }

    const timer = setTimeout(() => {
      saveFieldDraft(el);
      inputDebounceMap.delete(fieldId);
    }, DEBOUNCE_TIME);

    inputDebounceMap.set(fieldId, timer);
  }

  function restoreFieldContent(selector, fieldId, text) {
    let node = null;

    if (selector) {
      try {
        node = document.querySelector(selector);
      } catch {
        node = null;
      }
    }

    if (!node && fieldId) {
      try {
        node = document.getElementById(fieldId) || document.querySelector(`[name="${CSS.escape(fieldId)}"]`);
      } catch {
        node = null;
      }
    }

    if (!node) {
      return { success: false, error: 'Campo não encontrado nesta página.' };
    }

    try {
      if (node.isContentEditable || node.getAttribute('contenteditable') === 'true' || node.getAttribute('contenteditable') === '') {
        node.innerText = text;
      } else {
        node.value = text;
      }

      node.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
      node.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));

      node.scrollIntoView({ behavior: 'smooth', block: 'center' });
      node.focus();

      const previousOutline = node.style.outline;
      const previousTransition = node.style.transition;
      node.style.transition = 'outline 0.25s ease';
      node.style.outline = '2px solid #09090b';

      setTimeout(() => {
        node.style.outline = previousOutline;
        node.style.transition = previousTransition;
      }, 1200);

      return { success: true, message: 'Conteúdo restaurado com sucesso.' };
    } catch (err) {
      return { success: false, error: err.message || 'Não foi possível preencher o campo.' };
    }
  }

  document.addEventListener('input', onUserTyping, true);
  document.addEventListener('change', onUserTyping, true);

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'GET_NORMALIZED_URL') {
      sendResponse({ normalizedUrl: getCurrentNormalizedUrl() });
      return false;
    }

    if (request.action === 'RESTORE_DRAFT') {
      const result = restoreFieldContent(request.selector, request.fieldId, request.text);
      sendResponse(result);
      return false;
    }

    return false;
  });

})();
