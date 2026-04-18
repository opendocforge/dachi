/**
 * content.js — Dachi
 * Injection directe dans la page.
 * Pas de Shadow DOM. Le CSS est injecté par background.js via insertCSS.
 */
(() => {
    'use strict';

    // Prevent duplicate
    if (document.getElementById('dc-root')) return;

    // Icons (Material filled)
    const ICONS = {
        copy:   `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`,
        insert: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>`,
        check:  `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z"/></svg>`
    };

    // Error messages — multi-provider
    const ERRORS = {
        // Config manquante
        NO_API_KEY:           { icon: '🔑', title: 'Clé API non configurée',          text: 'Configurez votre clé API OpenAI dans les options de l\'extension.', showOpt: true },
        NO_API_KEY_AZURE:     { icon: '🔑', title: 'Clé API Azure non configurée',    text: 'Configurez votre clé API Azure dans les options de l\'extension.', showOpt: true },
        NO_ENDPOINT_AZURE:    { icon: '🔗', title: 'Endpoint Azure manquant',         text: 'Configurez l\'endpoint Azure dans les options de l\'extension.', showOpt: true },
        NO_DEPLOYMENT_AZURE:  { icon: '📦', title: 'Déploiement Azure manquant',      text: 'Configurez le nom du déploiement Azure dans les options.', showOpt: true },
        INVALID_AZURE_ENDPOINT: { icon: '🛡️', title: 'Endpoint Azure invalide',      text: 'L\'endpoint doit être un domaine *.openai.azure.com pour garantir la conformité HDS.', showOpt: true },
        NO_LOCAL_URL:         { icon: '🔗', title: 'URL serveur local manquante',     text: 'Configurez l\'URL du serveur local dans les options.', showOpt: true },
        NO_LOCAL_MODEL:       { icon: '🤖', title: 'Modèle local non configuré',      text: 'Configurez le nom du modèle dans les options.', showOpt: true },
        NO_PROVIDER:          { icon: '⚙️', title: 'Fournisseur non configuré',       text: 'Sélectionnez un fournisseur API dans les options.', showOpt: true },
        // Erreurs API
        API_KEY_INVALID:      { icon: '🚫', title: 'Clé API invalide',                text: 'Votre clé API est rejetée. Vérifiez-la dans les options.', showOpt: true },
        RATE_LIMITED:         { icon: '⏳', title: 'Limite de requêtes atteinte',     text: 'Trop de requêtes. Réessayez dans quelques instants.' },
        TIMEOUT:              { icon: '⏱️', title: 'Délai d\'attente dépassé',         text: 'La requête a pris trop de temps. Réessayez.' },
        NETWORK_ERROR:        { icon: '📡', title: 'Erreur de connexion',             text: 'Impossible de joindre le service. Vérifiez votre connexion.' },
        SERVER_ERROR:         { icon: '🔧', title: 'Service indisponible',            text: 'Le service rencontre des difficultés. Réessayez dans quelques minutes.' },
        LOCAL_CONNECTION_REFUSED: { icon: '🖥️', title: 'Serveur local inaccessible', text: 'Le serveur local ne répond pas. Vérifiez qu\'Ollama/LM Studio est bien lancé.' }
    };

    // State
    let lastFocusedEditable = null;

    // Track last focused editable on the page
    document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (el && !el.closest('#dc-root') &&
            (el.isContentEditable || el.tagName === 'TEXTAREA' ||
            (el.tagName === 'INPUT' && ['text','search','url','email',''].includes(el.type)))) {
            lastFocusedEditable = el;
        }
    });

    // Build UI
    const root = document.createElement('div');
    root.id = 'dc-root';

    const overlay = document.createElement('div');
    overlay.id = 'dc-overlay';
    overlay.innerHTML = `
        <div id="dc-modal">
            <div class="dc-header">
                <div class="dc-header-left">
                    <img class="dc-header-logo" src="${chrome.runtime.getURL('icons/icon48.png')}" alt="">
                    <h3 id="dc-title">Dachi</h3>
                </div>
                <button class="dc-close-btn" id="dc-close" title="Fermer">\u00d7</button>
            </div>
            <div id="dc-body"></div>
        </div>
    `;

    const toast = document.createElement('div');
    toast.id = 'dc-toast';

    root.appendChild(overlay);
    root.appendChild(toast);
    document.body.appendChild(root);

    // References
    const titleEl = document.getElementById('dc-title');
    const bodyEl  = document.getElementById('dc-body');
    const modal   = document.getElementById('dc-modal');

    // Events
    document.getElementById('dc-close').addEventListener('click', closePreview);

    overlay.addEventListener('click', (e) => {
        if (e.target.id === 'dc-overlay') closePreview();
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && overlay.classList.contains('visible')) closePreview();
    });

    // Make header draggable
    const header = modal.querySelector('.dc-header');
    makeDraggable(modal, header);

    // Open / Close
    function openPreview() {
        overlay.classList.add('visible');
    }

    function closePreview() {
        overlay.classList.remove('visible');
    }

    // Show loading
    function showLoading(title) {
        titleEl.textContent = title;
        bodyEl.innerHTML = `
            <div class="dc-loading">
                <div class="dc-spinner"></div>
                <span class="dc-loading-text">Analyse en cours\u2026</span>
            </div>
        `;
        const oldActions = modal.querySelector('.dc-actions');
        if (oldActions) oldActions.remove();
        openPreview();
    }

    // Show result
    function showResult(title, text, anonymization) {
        titleEl.textContent = title;

        bodyEl.innerHTML = '';

        // Bannière d'anonymisation si des éléments ont été remplacés
        if (anonymization && anonymization.enabled && anonymization.count > 0) {
            const banner = document.createElement('div');
            banner.className = 'dc-anon-banner';
            const labels = {
                email: 'email', nir: 'NIR', tel: 'téléphone',
                date: 'date', cp_ville: 'ville', nom: 'nom', ipp: 'IPP'
            };
            const parts = Object.entries(anonymization.replacements)
                .filter(([, n]) => n > 0)
                .map(([k, n]) => `${n} ${labels[k] || k}${n > 1 ? 's' : ''}`);
            banner.innerHTML = `🛡️ <strong>Anonymisation automatique :</strong> ${anonymization.count} élément${anonymization.count > 1 ? 's' : ''} remplacé${anonymization.count > 1 ? 's' : ''} avant envoi (${parts.join(', ')}).`;
            bodyEl.appendChild(banner);
        } else if (anonymization && anonymization.enabled) {
            const banner = document.createElement('div');
            banner.className = 'dc-anon-banner dc-anon-ok';
            banner.innerHTML = `🛡️ Anonymisation active — aucune donnée identifiante détectée.`;
            bodyEl.appendChild(banner);
        }

        const textarea = document.createElement('textarea');
        textarea.id = 'dc-textarea';
        textarea.placeholder = 'Le texte g\u00e9n\u00e9r\u00e9 par l\'IA appara\u00eetra ici\u2026';
        textarea.spellcheck = true;
        textarea.lang = 'fr';
        textarea.value = text;
        bodyEl.appendChild(textarea);

        let actions = modal.querySelector('.dc-actions');
        if (!actions) {
            actions = document.createElement('div');
            actions.className = 'dc-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'dc-btn dc-btn-secondary';
            copyBtn.id = 'dc-copy-btn';
            copyBtn.innerHTML = `${ICONS.copy} Copier`;
            copyBtn.addEventListener('click', doCopy);

            const insertBtn = document.createElement('button');
            insertBtn.className = 'dc-btn dc-btn-primary';
            insertBtn.id = 'dc-insert-btn';
            insertBtn.innerHTML = `${ICONS.insert} Remplacer la s\u00e9lection`;
            insertBtn.addEventListener('click', doInsert);

            actions.appendChild(copyBtn);
            actions.appendChild(insertBtn);
            modal.appendChild(actions);
        } else {
            const cb = actions.querySelector('#dc-copy-btn');
            const ib = actions.querySelector('#dc-insert-btn');
            if (cb) { cb.innerHTML = `${ICONS.copy} Copier`; cb.className = 'dc-btn dc-btn-secondary'; }
            if (ib) { ib.innerHTML = `${ICONS.insert} Remplacer la s\u00e9lection`; ib.className = 'dc-btn dc-btn-primary'; }
        }

        openPreview();
        setTimeout(() => textarea.focus(), 100);
    }

    // Show error
    function showError(title, errorKey) {
        titleEl.textContent = title;
        const err = ERRORS[errorKey] || { icon: '\u274c', title: 'Erreur', text: errorKey || 'Erreur inconnue.' };

        bodyEl.innerHTML = '';

        const errorDiv = document.createElement('div');
        errorDiv.className = 'dc-error';

        const iconSpan = document.createElement('span');
        iconSpan.className = 'dc-error-icon';
        iconSpan.textContent = err.icon;

        const h4 = document.createElement('h4');
        h4.textContent = err.title;

        const p = document.createElement('p');
        p.textContent = err.text;

        errorDiv.appendChild(iconSpan);
        errorDiv.appendChild(h4);
        errorDiv.appendChild(p);

        if (err.showOpt) {
            const btn = document.createElement('button');
            btn.className = 'dc-btn dc-btn-secondary';
            btn.textContent = '\u2699\ufe0f Ouvrir les options';
            btn.addEventListener('click', () => chrome.runtime.sendMessage({ action: 'openOptions' }));
            errorDiv.appendChild(btn);
        }

        bodyEl.appendChild(errorDiv);

        const oldActions = modal.querySelector('.dc-actions');
        if (oldActions) oldActions.remove();

        openPreview();
    }

    // Copy
    async function doCopy() {
        const ta = document.getElementById('dc-textarea');
        if (!ta || !ta.value) return;

        try {
            await navigator.clipboard.writeText(ta.value);
        } catch {
            const tmp = document.createElement('textarea');
            tmp.value = ta.value;
            tmp.style.position = 'fixed';
            tmp.style.left = '-9999px';
            document.body.appendChild(tmp);
            tmp.select();
            document.execCommand('copy');
            document.body.removeChild(tmp);
        }

        showToast('Texte copi\u00e9 !');
        closePreview();
    }

    // Insert / Replace selection
    function doInsert() {
        const ta = document.getElementById('dc-textarea');
        if (!ta || !ta.value) return;
        const text = ta.value;

        if (lastFocusedEditable) {
            const el = lastFocusedEditable;
            el.focus();

            if (el.isContentEditable) {
                const html = text
                    .split('\n\n')
                    .map(p => p.replace(/\n/g, '<br>'))
                    .join('<br><br>');
                document.execCommand('insertHTML', false, html);
            } else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
                const start = el.selectionStart || 0;
                const end = el.selectionEnd || 0;
                el.value = el.value.substring(0, start) + text + el.value.substring(end);
                el.selectionStart = el.selectionEnd = start + text.length;
                el.dispatchEvent(new Event('input', { bubbles: true }));
                el.dispatchEvent(new Event('change', { bubbles: true }));
            }

            showToast('Texte ins\u00e9r\u00e9 !');
            closePreview();
        } else {
            doCopy();
        }
    }

    // Toast
    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.className = 'dc-toast' + (isError ? ' error' : '');
        void toast.offsetHeight;
        toast.id = 'dc-toast';
        toast.classList.add('visible');
        setTimeout(() => toast.classList.remove('visible'), 2500);
    }

    // Drag
    function makeDraggable(card, handle) {
        let ox, oy, ix, iy;

        function onMove(e) {
            card.style.left = (ix + e.clientX - ox) + 'px';
            card.style.top = (iy + e.clientY - oy) + 'px';
            card.style.transform = 'none';
            card.style.margin = '0';
            card.style.position = 'fixed';
        }

        function onUp() {
            handle.style.cursor = 'grab';
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
        }

        handle.addEventListener('mousedown', (e) => {
            if (e.target.closest('.dc-close-btn')) return;
            handle.style.cursor = 'grabbing';
            const r = card.getBoundingClientRect();
            ox = e.clientX; oy = e.clientY;
            ix = r.left; iy = r.top;
            document.addEventListener('mousemove', onMove);
            document.addEventListener('mouseup', onUp);
            e.preventDefault();
        });
    }

    // Listen for messages from background
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (msg.phase === 'loading') {
            showLoading(msg.title);
        } else if (msg.phase === 'result') {
            showResult(msg.title, msg.result, msg.anonymization);
        } else if (msg.phase === 'error') {
            showError(msg.title, msg.error);
        }
        sendResponse({ received: true });
    });

    console.log('[Dachi] UI injected.');
})();
