/**
 * content.js — Dachi
 * Modale rendue dans un Shadow DOM *fermé* : les scripts de la page hôte ne
 * peuvent ni lire le texte généré ni actionner les boutons. Le CSS est fourni
 * par background.js via globalThis.__DACHI_CSS (monde isolé) avant l'injection.
 * Script classique (pas de module).
 *
 * Phases reçues du Service Worker : form, loading, preview, stream, result,
 * error, reopen, toast. Messages émis : submitForm (réponses aux questions),
 * runAction (aperçu validé / régénérer / affiner), openOptions.
 * Répond à ping et getSelection.
 */
(() => {
    'use strict';

    // ─── Instance déjà présente ? ────────────────────────────────────────
    // Un content script survit au rechargement de l'extension mais perd son
    // chrome.runtime (« Extension context invalidated »). On sonde l'ancienne
    // instance : si elle répond « vivante », on s'efface ; sinon on la remplace.
    const probe = new CustomEvent('dachi:probe', { detail: { alive: false } });
    document.dispatchEvent(probe);
    if (probe.detail.alive) return;
    const stale = document.getElementById('dc-host');
    if (stale) stale.remove();
    document.addEventListener('dachi:probe', (e) => {
        let alive = false;
        try { alive = !!(chrome.runtime && chrome.runtime.id); } catch (_) {}
        if (alive && e.detail) e.detail.alive = true;
    });

    // ─── Icônes ──────────────────────────────────────────────────────────
    const LOGO = `<svg class="dc-header-logo" viewBox="0 0 100 100" aria-hidden="true"><defs><linearGradient id="dc-lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#6366F1"/><stop offset="1" stop-color="#8B5CF6"/></linearGradient></defs><rect width="100" height="100" rx="24" fill="url(#dc-lg)"/><path fill="#fff" d="M74 22 C58 22 40 30 34 48 L26 72 L30 76 L38 62 C44 66 54 64 60 56 C68 46 72 34 74 22 Z"/><path d="M30 76 L52 44" stroke="#6D5BF3" stroke-width="3.5" stroke-linecap="round"/><path fill="#fff" d="M76 67 Q78.3 71.7 83 74 Q78.3 76.3 76 81 Q73.7 76.3 69 74 Q73.7 71.7 76 67Z"/></svg>`;
    const svg = (d) => `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
    const ICONS = {
        copy:    svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
        insert:  svg('<path d="M12 5v14M5 12h14"/>'),
        refresh: svg('<path d="M21 12a9 9 0 1 1-2.64-6.36"/><path d="M21 3v6h-6"/>'),
        send:    svg('<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>'),
        sparkle: svg('<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z"/>'),
        options: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>')
    };

    // ─── Messages d'erreur (clé = code avant « : ») ──────────────────────
    const ERRORS = {
        NO_API_KEY:             { icon: '🔑', title: 'Clé API non configurée',          text: 'Configurez votre clé API OpenAI dans les options de l\'extension.', showOpt: true },
        NO_API_KEY_SCALEWAY:    { icon: '🔑', title: 'Clé API Scaleway non configurée', text: 'Configurez votre clé API Scaleway dans les options de l\'extension.', showOpt: true },
        NO_PROJECT_ID_SCALEWAY: { icon: '🆔', title: 'ID de projet Scaleway manquant',  text: 'Renseignez l\'ID de projet Scaleway dans les options (visible dans l\'URL de la console Scaleway).', showOpt: true },
        NO_MODEL_SCALEWAY:      { icon: '🤖', title: 'Modèle Scaleway non renseigné',   text: 'Indiquez un modèle Scaleway dans les options.', showOpt: true },
        NO_API_KEY_OPENROUTER:  { icon: '🔑', title: 'Clé API OpenRouter non configurée', text: 'Configurez votre clé API OpenRouter (sk-or-…) dans les options de l\'extension.', showOpt: true },
        NO_MODEL_OPENROUTER:    { icon: '🤖', title: 'Modèle OpenRouter non renseigné',  text: 'Indiquez un identifiant de modèle OpenRouter (ex. mistralai/mistral-small-3.2-24b-instruct) dans les options.', showOpt: true },
        NO_LOCAL_URL:           { icon: '🔗', title: 'URL du serveur manquante',        text: 'Configurez l\'URL du serveur local dans les options.', showOpt: true },
        NO_LOCAL_MODEL:         { icon: '🤖', title: 'Modèle local non configuré',      text: 'Configurez le nom du modèle dans les options.', showOpt: true },
        NO_PROVIDER:            { icon: '⚙️', title: 'Fournisseur non configuré',       text: 'Sélectionnez un fournisseur API dans les options.', showOpt: true },
        CGU_NOT_ACCEPTED:       { icon: '⚖️', title: 'Conditions d\'utilisation à accepter', text: 'Avant la première utilisation, lisez et acceptez les conditions d\'utilisation dans les options.', showOpt: true },
        API_KEY_INVALID:        { icon: '🚫', title: 'Clé API refusée',                 text: 'Votre clé API est rejetée par le fournisseur. Vérifiez-la dans les options.', showOpt: true },
        RATE_LIMITED:           { icon: '⏳', title: 'Limite de requêtes atteinte',     text: 'Trop de requêtes. Réessayez dans quelques instants.' },
        TIMEOUT:                { icon: '⏱️', title: 'Délai d\'attente dépassé',         text: 'Le modèle n\'a pas répondu à temps. Avec un long texte sur un serveur local sans GPU, la lecture du texte peut prendre plusieurs minutes : réessayez avec une sélection plus courte, ou patientez davantage (Dachi attend jusqu\'à 4 minutes 30 le premier mot d\'un modèle local).' },
        CONTEXT_TOO_LONG:       { icon: '📏', title: 'Texte trop long pour ce modèle',   text: 'Le texte sélectionné (plus les consignes) dépasse la fenêtre de contexte du modèle. Réduisez la sélection aux passages utiles, ou choisissez un modèle avec un contexte plus large. Avec Ollama, augmentez la fenêtre : OLLAMA_CONTEXT_LENGTH=16384 (défaut 4096).' },
        NETWORK_ERROR:          { icon: '📡', title: 'Erreur de connexion',             text: 'Impossible de joindre le service. Vérifiez votre connexion.' },
        SERVER_ERROR:           { icon: '🔧', title: 'Service indisponible',            text: 'Le fournisseur rencontre des difficultés. Réessayez dans quelques minutes.' },
        API_ERROR:              { icon: '❌', title: 'Erreur du fournisseur',           text: 'Le fournisseur a renvoyé une erreur.' },
        EMPTY_RESPONSE:         { icon: '🫥', title: 'Réponse vide',                    text: 'Le modèle n\'a rien renvoyé. Réessayez ou changez de modèle.' },
        LOCAL_CONNECTION_REFUSED: { icon: '🖥️', title: 'Serveur inaccessible',        text: 'Le serveur ne répond pas. Vérifiez qu\'Ollama / LM Studio est bien lancé et accessible.' },
        LOCAL_PERMISSION_DENIED:  { icon: '🔐', title: 'Serveur distant non autorisé', text: 'Chrome n\'a pas autorisé Dachi à joindre cette adresse. Ouvrez les options et cliquez sur « Tester la connexion » pour accorder l\'autorisation.', showOpt: true },
        NO_CONTENT_SCRIPT:      { icon: '🚫', title: 'Page inaccessible',               text: 'Dachi ne peut pas s\'afficher sur cette page (page interne de Chrome, PDF…).' }
    };

    // ─── État ────────────────────────────────────────────────────────────
    let lastFocusedEditable = null;
    let lastSelectionRange = null;
    let lastSelectionText = '';
    let currentRequest = null;   // requête en cours (pour régénérer / affiner)
    let lastResult = null;       // dernier résultat affiché (pour « rouvrir »)
    let previousFocus = null;    // focus à restaurer à la fermeture
    let mode = null;             // form | loading | preview | stream | result | error
    let insertWhenReady = false; // Alt+Maj+V pressé pendant la génération → insérer dès le résultat
    const lastAnswers = {};      // dernières réponses par action (pré-remplissage)

    function isEditableEl(el) {
        return el && el.nodeType === Node.ELEMENT_NODE && (
            el.isContentEditable || el.tagName === 'TEXTAREA' ||
            (el.tagName === 'INPUT' && ['text', 'search', 'url', 'email', ''].includes(el.type))
        );
    }

    function findEditableAncestor(node) {
        let el = node && node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
        while (el && el !== document.body) {
            if (isEditableEl(el)) return el;
            el = el.parentElement;
        }
        return null;
    }

    /** Sélection courante avec ses retours à la ligne (champs de saisie inclus). */
    function getSelectionText() {
        // Champ de saisie : uniquement s'il est le contexte courant (focus), sinon
        // une ancienne sélection restée dans le champ masquerait celle de la page.
        const el = lastFocusedEditable;
        if (el && document.activeElement === el && (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') &&
            typeof el.selectionStart === 'number' && el.selectionEnd > el.selectionStart) {
            return el.value.substring(el.selectionStart, el.selectionEnd);
        }
        const sel = document.getSelection();
        const live = sel ? sel.toString() : '';
        return live.trim() ? live : lastSelectionText;
    }

    // Hôte du Shadow DOM (déclaré ici : les écouteurs ci-dessous y font référence)
    const host = document.createElement('dachi-host');
    host.id = 'dc-host';
    const shadow = host.attachShadow({ mode: 'closed' });
    const insideModal = (t) => t === host || (t && t.nodeType === Node.ELEMENT_NODE && host.contains(t));

    /**
     * Mémorise le champ éditable courant et la sélection. Appelé à l'injection
     * (première utilisation sur la page : le clic droit a eu lieu AVANT que nos
     * écouteurs existent), au clic droit, à la demande de sélection du Service
     * Worker et juste avant que la modale ne prenne le focus.
     */
    function captureContext(force) {
        const sel = document.getSelection();
        let candidate = null;
        if (document.activeElement && !insideModal(document.activeElement)) candidate = findEditableAncestor(document.activeElement);
        if (!candidate && sel && sel.anchorNode) candidate = findEditableAncestor(sel.anchorNode);
        if (candidate && (force || !lastFocusedEditable)) lastFocusedEditable = candidate;
        if (sel && sel.rangeCount > 0 && (force || !lastSelectionRange)) {
            try { lastSelectionRange = sel.getRangeAt(0).cloneRange(); } catch (_) {}
        }
        const text = getSelectionText();
        if (text.trim() && (force || !lastSelectionText.trim())) lastSelectionText = text;
    }

    document.addEventListener('focusin', (e) => {
        const el = e.target;
        if (el && !insideModal(el) && isEditableEl(el)) lastFocusedEditable = el;
    });

    // Capture au clic droit : champ éditable + Range + texte de la sélection.
    document.addEventListener('contextmenu', (e) => {
        if (insideModal(e.target)) return;

        let candidate = findEditableAncestor(e.target);
        if (!candidate && document.activeElement) candidate = findEditableAncestor(document.activeElement);
        const sel = document.getSelection();
        if (!candidate && sel && sel.anchorNode) candidate = findEditableAncestor(sel.anchorNode);
        if (candidate) lastFocusedEditable = candidate;

        if (sel && sel.rangeCount > 0) {
            try { lastSelectionRange = sel.getRangeAt(0).cloneRange(); } catch (_) {}
        }
        lastSelectionText = getSelectionText();

        // Réveille le Service Worker pendant que le menu s'ouvre (démarrage à froid absorbé)
        if (lastSelectionText.trim()) {
            try { const p = chrome.runtime.sendMessage({ action: 'wake' }); if (p && p.catch) p.catch(() => {}); } catch (_) {}
        }
    }, true);

    // ─── DOM (dans le Shadow DOM fermé) ───────────────────────────────────
    const style = document.createElement('style');
    style.textContent = ':host { all: initial; }\n' + (typeof globalThis.__DACHI_CSS === 'string' ? globalThis.__DACHI_CSS : '');
    shadow.appendChild(style);

    const root = document.createElement('div');
    root.id = 'dc-root';

    const overlay = document.createElement('div');
    overlay.id = 'dc-overlay';
    overlay.innerHTML = `
        <div id="dc-modal" role="dialog" aria-modal="true" aria-labelledby="dc-title">
            <div class="dc-header">
                <div class="dc-header-left">
                    ${LOGO}
                    <h3 id="dc-title">Dachi</h3>
                </div>
                <button class="dc-close-btn" id="dc-close" title="Fermer (Échap)" aria-label="Fermer">×</button>
            </div>
            <div id="dc-body"></div>
            <div class="dc-actions" id="dc-actions" hidden></div>
        </div>
    `;

    const toast = document.createElement('div');
    toast.id = 'dc-toast';
    toast.setAttribute('role', 'status');

    root.appendChild(overlay);
    root.appendChild(toast);
    shadow.appendChild(root);
    document.body.appendChild(host);

    const titleEl   = shadow.getElementById('dc-title');
    const bodyEl    = shadow.getElementById('dc-body');
    const actionsEl = shadow.getElementById('dc-actions');
    const modal     = shadow.getElementById('dc-modal');

    shadow.getElementById('dc-close').addEventListener('click', (e) => { if (e.isTrusted) closePreview(); });

    function handleModalKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); closePreview(); return; }
        if (e.key === 'Tab') { trapFocus(e); return; }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); requestInsert(); }
    }

    /**
     * Demande d'insertion (raccourci Alt+Maj+V ou Ctrl+Entrée) : immédiate si
     * un résultat est affiché, différée jusqu'à l'arrivée du résultat si une
     * génération est en cours, sinon reprend le dernier résultat de la page.
     */
    function requestInsert() {
        if (mode === 'result') { doInsert(); return; }
        if (mode === 'loading' || mode === 'stream') {
            insertWhenReady = true;
            showToast('Le résultat sera inséré dès qu\'il sera prêt…');
            return;
        }
        if (mode === 'preview' || mode === 'form') {
            showToast('Validez d\'abord cette étape (Entrée), puis Alt+Maj+V.', true);
            return;
        }
        if (lastResult) { showResult(lastResult); doInsert(); return; }
        showToast('Aucun résultat à insérer — lancez d\'abord une action.', true);
    }

    // Échap / Tab quand le focus est resté sur la page (modale ouverte sans champ)
    document.addEventListener('keydown', (e) => {
        if (!overlay.classList.contains('visible')) return;
        handleModalKey(e);
    });

    // ─── Isolation vis-à-vis des gestionnaires globaux de la page hôte ──
    // Les événements nés dans la modale traversent le Shadow DOM et remontent
    // jusqu'au document, où la page les voit venir d'un élément inconnu
    // (« dachi-host »). Certains logiciels métier interceptent alors la frappe
    // (raccourcis globaux, preventDefault hors de leurs propres champs) et
    // rien ne s'écrit dans nos champs. On traite Échap / Tab ici puis on
    // arrête la propagation : la page hôte ne reçoit plus rien.
    const ISOLATED_EVENTS = ['keydown', 'keyup', 'keypress', 'input', 'beforeinput', 'change',
        'paste', 'cut', 'copy', 'mousedown', 'click', 'dblclick', 'pointerdown',
        'focusin', 'focusout', 'wheel', 'contextmenu'];
    for (const type of ISOLATED_EVENTS) {
        root.addEventListener(type, (e) => {
            if (type === 'keydown') handleModalKey(e);
            e.stopPropagation();
        });
    }

    makeDraggable(modal, modal.querySelector('.dc-header'));

    // ─── Ouverture / fermeture ───────────────────────────────────────────
    function openPreview() {
        if (!overlay.classList.contains('visible')) {
            previousFocus = document.activeElement;
            captureContext(false);
            overlay.classList.add('visible');
        }
    }

    function closePreview() {
        overlay.classList.remove('visible');
        mode = null;
        insertWhenReady = false;
        if (previousFocus && document.contains(previousFocus)) {
            try { previousFocus.focus({ preventScroll: true }); } catch (_) {}
        }
        previousFocus = null;
    }

    function focusables() {
        return Array.from(modal.querySelectorAll('button, input, textarea, [tabindex]:not([tabindex="-1"])'))
            .filter(el => !el.disabled && el.offsetParent !== null);
    }

    function trapFocus(e) {
        const list = focusables();
        if (!list.length) return;
        const first = list[0], last = list[list.length - 1];
        const active = shadow.activeElement;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }

    // ─── Helpers de rendu ────────────────────────────────────────────────
    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text != null) node.textContent = text;
        return node;
    }

    function button(label, icon, className, onClick) {
        const b = el('button', `dc-btn ${className}`);
        b.type = 'button';
        b.innerHTML = `${icon || ''}<span>${label}</span>`;
        // Seuls les clics réels de l'utilisateur déclenchent une action (aucun
        // script ne doit pouvoir envoyer une requête à l'IA à la place du médecin).
        b.addEventListener('click', (e) => { if (e.isTrusted) onClick(e); });
        return b;
    }

    function setActions(...buttons) {
        actionsEl.innerHTML = '';
        for (const b of buttons) if (b) actionsEl.appendChild(b);
        actionsEl.hidden = buttons.filter(Boolean).length === 0;
    }

    const ANON_LABELS = { email: 'email', nir: 'NIR', tel: 'téléphone', date: 'date', cp_ville: 'ville', nom: 'nom', ipp: 'IPP', adresse: 'adresse' };

    function anonymizationSummary(anonymization) {
        if (!anonymization || !anonymization.enabled) return null;
        if (!anonymization.count) return { ok: true, text: 'Anonymisation active — aucune donnée identifiante détectée.' };
        const parts = Object.entries(anonymization.replacements || {})
            .filter(([, n]) => n > 0)
            .map(([k, n]) => `${n} ${ANON_LABELS[k] || k}${n > 1 ? 's' : ''}`);
        return { ok: false, text: `${anonymization.count} élément${anonymization.count > 1 ? 's' : ''} remplacé${anonymization.count > 1 ? 's' : ''} avant envoi (${parts.join(', ')}).` };
    }

    function truncationMessage(usage) {
        const u = usage || {};
        const cap = u.maxTokens ? `${u.maxTokens} jetons` : 'la longueur maximale';
        let why;
        if (u.completion && u.reasoning && u.reasoning >= u.completion * 0.5) {
            why = `le modèle a dépensé <strong>${u.reasoning} des ${u.completion} jetons générés en raisonnement interne</strong> (modèle « thinking »). Choisissez un modèle sans raisonnement, ou augmentez « Longueur max » dans les options.`;
        } else if (u.completion) {
            why = `<strong>${u.completion} jetons générés</strong>, plafond de ${cap} atteint. Augmentez « Longueur max » dans les options, ou demandez une version plus courte via « Affiner ». Si le texte semble complet mais se répète, le modèle a bouclé : essayez « Régénérer » ou un autre modèle.`;
        } else {
            why = `plafond de ${cap} atteint. Augmentez « Longueur max » dans les options, réduisez le texte source, ou demandez une version plus courte via « Affiner ».`;
        }
        return `⚠️ <strong>Réponse tronquée</strong> — ${why}`;
    }

    function banner(kind, html) {
        const b = el('div', `dc-banner dc-banner-${kind}`);
        b.innerHTML = html;
        return b;
    }

    function makeTextarea(value, placeholder) {
        const ta = el('textarea');
        ta.id = 'dc-textarea';
        ta.placeholder = placeholder || 'Le texte généré par l’IA apparaîtra ici…';
        ta.spellcheck = true;
        ta.lang = 'fr';
        ta.value = value || '';
        return ta;
    }

    // ─── Vues ────────────────────────────────────────────────────────────
    let loadingHintTimer = null;
    function showLoading(title, info) {
        mode = 'loading';
        titleEl.textContent = title;
        const chars = info && info.inputChars ? info.inputChars : 0;
        const words = chars ? Math.round(chars / 6) : 0;
        const size = words ? ` — texte envoyé : ~${words.toLocaleString('fr-FR')} mots` : '';
        bodyEl.innerHTML = `
            <div class="dc-loading">
                <div class="dc-spinner"></div>
                <span class="dc-loading-text">Génération en cours…${size}</span>
                <span class="dc-loading-hint" hidden></span>
            </div>`;
        setActions();
        openPreview();

        // Après 20 s sans premier mot, on explique l'attente (surtout en local)
        clearTimeout(loadingHintTimer);
        const hint = bodyEl.querySelector('.dc-loading-hint');
        loadingHintTimer = setTimeout(() => {
            if (mode !== 'loading' || !hint) return;
            hint.textContent = info && info.isLocal
                ? 'Le modèle local lit le texte avant de répondre : sur un PC sans GPU, un long courrier peut demander plusieurs minutes. Dachi attend jusqu\'à 4 minutes 30.'
                : 'Le fournisseur met du temps à répondre (file d\'attente ou modèle à raisonnement). Dachi attend encore un peu.';
            hint.hidden = false;
        }, 20000);
    }

    /** Questions posées avant la génération (actions qui en déclarent). */
    function showForm(title, form, request) {
        mode = 'form';
        titleEl.textContent = title;
        bodyEl.innerHTML = '';

        if (form.intro) bodyEl.appendChild(banner('info', `📝 ${form.intro}`));

        const wrap = el('div', 'dc-form');
        const controls = {};
        const previous = lastAnswers[request.menuId] || {};

        for (const f of form.fields || []) {
            const half = f.type !== 'textarea' && f.type !== 'checkboxes';
            const field = el('div', 'dc-field' + (half ? ' dc-field-half' : ''));
            const id = `dc-f-${f.key}`;
            const label = el('label', null, f.label + (f.required ? ' *' : ''));
            label.htmlFor = id;
            let control;
            if (f.type === 'textarea') {
                control = el('textarea');
                control.rows = f.rows || 2;
            } else if (f.type === 'select') {
                control = el('select');
                for (const opt of f.options || []) {
                    const o = el('option', null, opt);
                    o.value = opt;
                    control.appendChild(o);
                }
            } else if (f.type === 'checkboxes') {
                // Plusieurs choix : la « valeur » est la liste des cases cochées
                control = el('div', 'dc-checks');
                const prevSet = new Set(String(previous[f.key] || '').split(', ').filter(Boolean));
                (f.options || []).forEach((opt, i) => {
                    const item = el('label', 'dc-check');
                    const cb = el('input');
                    cb.type = 'checkbox';
                    cb.value = opt;
                    cb.id = `${id}-${i}`;
                    cb.checked = prevSet.has(opt);
                    item.appendChild(cb);
                    item.appendChild(el('span', null, opt));
                    control.appendChild(item);
                });
                Object.defineProperty(control, 'value', {
                    get() { return Array.from(control.querySelectorAll('input:checked')).map(c => c.value).join(', '); },
                    set(v) { const set = new Set(String(v || '').split(', ')); control.querySelectorAll('input').forEach(c => { c.checked = set.has(c.value); }); }
                });
                control.focus = () => { const first = control.querySelector('input'); if (first) first.focus(); };
                label.htmlFor = '';
            } else {
                control = el('input');
                control.type = 'text';
                if (Array.isArray(f.suggestions) && f.suggestions.length) {
                    const dl = el('datalist');
                    dl.id = `${id}-list`;
                    for (const s of f.suggestions) { const o = el('option'); o.value = s; dl.appendChild(o); }
                    control.setAttribute('list', dl.id);
                    field.appendChild(dl);
                }
            }
            if (f.type !== 'checkboxes') {
                control.id = id;
                if (f.placeholder) control.placeholder = f.placeholder;
                if (previous[f.key] != null) control.value = previous[f.key];
            }
            controls[f.key] = control;
            field.appendChild(label);
            field.appendChild(control);
            if (f.help) field.appendChild(el('p', 'dc-field-help', f.help));
            wrap.appendChild(field);
        }
        bodyEl.appendChild(wrap);

        const submit = () => {
            const answers = {};
            for (const f of form.fields || []) {
                const v = (controls[f.key].value || '').trim();
                if (f.required && !v) {
                    controls[f.key].focus();
                    controls[f.key].classList.add('dc-invalid');
                    showToast(`« ${f.label} » est obligatoire.`, true);
                    return;
                }
                answers[f.key] = v;
            }
            lastAnswers[request.menuId] = answers;
            showLoading(title);
            try {
                const p = chrome.runtime.sendMessage({ action: 'submitForm', menuId: request.menuId, sourceText: request.sourceText, answers });
                if (p && typeof p.catch === 'function') p.catch(() => showError(title, 'NETWORK_ERROR: extension injoignable'));
            } catch (_) {
                showError(title, 'NETWORK_ERROR: extension injoignable');
            }
        };

        for (const c of Object.values(controls)) {
            c.addEventListener('input', () => c.classList.remove('dc-invalid'));
            c.addEventListener('change', () => c.classList.remove('dc-invalid'));
            if (c.tagName === 'INPUT' || c.tagName === 'SELECT') c.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } });
        }

        setActions(
            button('Annuler', null, 'dc-btn-secondary', closePreview),
            button(form.submitLabel || 'Générer', ICONS.sparkle, 'dc-btn-primary', submit)
        );
        openPreview();
        const first = Object.values(controls)[0];
        if (first) setTimeout(() => first.focus(), 50);
    }

    /** Aperçu du texte anonymisé avant envoi (modifiable). */
    function showPreview(title, request) {
        mode = 'preview';
        currentRequest = request;
        titleEl.textContent = title;
        bodyEl.innerHTML = '';

        const summary = anonymizationSummary(request.anonymization);
        bodyEl.appendChild(banner('info', `🛡️ <strong>Vérifiez le texte avant envoi.</strong> ${summary ? summary.text : ''} Vous pouvez corriger ci-dessous ce qui sera transmis à l’IA — les placeholders seront ré-identifiés dans la réponse.`));

        const ta = makeTextarea(request.text);
        bodyEl.appendChild(ta);

        setActions(
            button('Annuler', null, 'dc-btn-secondary', closePreview),
            button('Envoyer à l’IA', ICONS.send, 'dc-btn-primary', () => {
                const text = ta.value;
                if (!text.trim()) { showToast('Le texte est vide.', true); return; }
                runAction({ ...currentRequest, text });
            })
        );
        openPreview();
        setTimeout(() => ta.focus(), 50);
    }

    /** Texte partiel pendant le streaming (ou activité de raisonnement avant le premier mot). */
    function showStream(title, partial, reasoningChars) {
        if (mode !== 'stream') {
            mode = 'stream';
            titleEl.textContent = title;
            bodyEl.innerHTML = '';
            bodyEl.appendChild(banner('info', '✨ Génération en cours…'));
            const ta = makeTextarea('');
            ta.readOnly = true;
            bodyEl.appendChild(ta);
            setActions();
            openPreview();
        }
        const b = bodyEl.querySelector('.dc-banner');
        if (b) {
            b.innerHTML = (!partial && reasoningChars)
                ? `🧠 Le modèle réfléchit avant de répondre… (~${Math.round(reasoningChars / 5).toLocaleString('fr-FR')} mots de raisonnement interne). Pour aller plus vite, réglez « Raisonnement » sur « désactivé » dans les options.`
                : '✨ Génération en cours…';
        }
        const ta = shadow.getElementById('dc-textarea');
        if (!ta) return;
        const atBottom = ta.scrollHeight - ta.scrollTop - ta.clientHeight < 24;
        ta.value = partial;
        if (atBottom) ta.scrollTop = ta.scrollHeight;
    }

    function showResult(payload) {
        mode = 'result';
        lastResult = payload;
        currentRequest = payload.request || currentRequest;
        if (insertWhenReady) {
            insertWhenReady = false;
            // Rendu minimal de la textarea pour réutiliser doInsert(), puis insertion
            bodyEl.innerHTML = '';
            bodyEl.appendChild(makeTextarea(payload.result));
            doInsert();
            return;
        }
        titleEl.textContent = payload.title;
        bodyEl.innerHTML = '';

        const summary = anonymizationSummary(payload.anonymization);
        if (summary) {
            let text = summary.ok ? `🛡️ ${summary.text}` : `🛡️ <strong>Anonymisation automatique :</strong> ${summary.text}`;
            if (!summary.ok && payload.rehydration && payload.rehydration.enabled) {
                text += payload.rehydration.restored > 0
                    ? ` <strong>${payload.rehydration.restored} ré-identifié${payload.rehydration.restored > 1 ? 's' : ''}</strong> dans la réponse (les données d’origine n’ont jamais quitté votre poste).`
                    : ' Aucun placeholder à ré-identifier dans la réponse.';
            }
            bodyEl.appendChild(banner(summary.ok ? 'ok' : 'info', text));
        }
        if (payload.truncated) bodyEl.appendChild(banner('warn', truncationMessage(payload.usage)));

        const ta = makeTextarea(payload.result);
        bodyEl.appendChild(ta);

        if (payload.timing && payload.timing.totalMs) {
            const t = payload.timing;
            const words = Math.round((t.outputChars || 0) / 6);
            const genMs = Math.max(1, t.totalMs - t.ttftMs);
            const wps = words && genMs ? Math.round(words / (genMs / 1000)) : 0;
            const parts = [`premier mot ${(t.ttftMs / 1000).toFixed(1).replace('.', ',')} s`, `total ${(t.totalMs / 1000).toFixed(1).replace('.', ',')} s`];
            if (wps) parts.push(`~${wps} mots/s`);
            if (t.reasoningChars) parts.push(`raisonnement interne ~${Math.round(t.reasoningChars / 5).toLocaleString('fr-FR')} mots`);
            if (t.model) parts.push(t.model);
            bodyEl.appendChild(el('p', 'dc-timing', '⏱ ' + parts.join(' · ')));
        }

        // Affiner : consigne supplémentaire appliquée à la réponse précédente
        const refine = el('div', 'dc-refine');
        const refineInput = el('input');
        refineInput.type = 'text';
        refineInput.placeholder = 'Affiner : ex. « plus court », « vouvoiement », « ton plus formel »…';
        refineInput.setAttribute('aria-label', 'Consigne pour affiner la réponse');
        const refineBtn = button('Affiner', ICONS.sparkle, 'dc-btn-secondary dc-btn-sm', () => submitRefine());
        const submitRefine = () => {
            const extra = refineInput.value.trim();
            if (!extra) { refineInput.focus(); return; }
            if (!currentRequest) { showToast('Requête d’origine introuvable — relancez depuis le clic droit.', true); return; }
            runAction({ ...currentRequest, extraInstruction: extra, previousResult: ta.value });
        };
        refineInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); submitRefine(); } });
        refine.appendChild(refineInput);
        refine.appendChild(refineBtn);
        bodyEl.appendChild(refine);

        const regen = button('Régénérer', ICONS.refresh, 'dc-btn-ghost', () => {
            if (!currentRequest) { showToast('Requête d’origine introuvable — relancez depuis le clic droit.', true); return; }
            runAction({ ...currentRequest, extraInstruction: '', previousResult: '' });
        });
        regen.classList.add('dc-actions-left');

        setActions(
            regen,
            button('Copier', ICONS.copy, 'dc-btn-secondary', doCopy),
            Object.assign(button('Remplacer la sélection', ICONS.insert, 'dc-btn-primary', doInsert), { title: 'Ctrl+Entrée · Alt+Maj+V' })
        );

        openPreview();
        setTimeout(() => ta.focus(), 50);
    }

    function showError(title, message) {
        mode = 'error';
        insertWhenReady = false;
        titleEl.textContent = title;
        const raw = String(message || '');
        const key = raw.split(':')[0].trim();
        const detail = raw.includes(':') ? raw.slice(raw.indexOf(':') + 1).trim() : '';
        const err = ERRORS[key] || { icon: '❌', title: 'Erreur', text: raw || 'Erreur inconnue.' };

        bodyEl.innerHTML = '';
        const box = el('div', 'dc-error');
        box.appendChild(el('span', 'dc-error-icon', err.icon));
        box.appendChild(el('h4', null, err.title));
        box.appendChild(el('p', null, err.text));
        if (detail && ERRORS[key]) box.appendChild(el('code', 'dc-error-detail', detail));
        if (key === 'EMPTY_RESPONSE') {
            box.appendChild(el('p', 'dc-error-hint', 'Avec Ollama, un texte plus long que la fenêtre de contexte (4 096 jetons par défaut) est tronqué silencieusement et le modèle peut ne rien renvoyer : réduisez la sélection ou lancez Ollama avec OLLAMA_CONTEXT_LENGTH=16384.'));
        }
        if (err.showOpt) {
            box.appendChild(button('Ouvrir les options', ICONS.options, 'dc-btn-secondary', () => chrome.runtime.sendMessage({ action: 'openOptions' })));
        }
        bodyEl.appendChild(box);
        setActions();
        openPreview();
    }

    function reopenLast() {
        if (lastResult) showResult(lastResult);
        else showToast('Aucun résultat récent sur cette page.', true);
    }

    // ─── Actions vers le Service Worker ──────────────────────────────────
    function runAction(request) {
        currentRequest = request;
        showLoading(request.title || titleEl.textContent);
        try {
            const p = chrome.runtime.sendMessage({ action: 'runAction', request });
            if (p && typeof p.catch === 'function') p.catch(() => showError(request.title, 'NETWORK_ERROR: extension injoignable'));
        } catch (_) {
            showError(request.title, 'NETWORK_ERROR: extension injoignable');
        }
    }

    // ─── Copier / Insérer ────────────────────────────────────────────────
    async function doCopy() {
        const ta = shadow.getElementById('dc-textarea');
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
        showToast('Texte copié');
        closePreview();
    }

    function doInsert() {
        const ta = shadow.getElementById('dc-textarea');
        if (!ta || !ta.value) return;
        const text = ta.value;

        // 1) champ éditable mémorisé → insertion ; 2) range capturée → restauration ;
        // 3) dernier recours : presse-papier.
        let target = lastFocusedEditable;
        if (!(target && document.contains(target))) target = findEditableAncestor(previousFocus);
        if (!target && lastSelectionRange) {
            try { target = findEditableAncestor(lastSelectionRange.startContainer); } catch (_) {}
        }
        if (target && document.contains(target)) {
            try { target.focus(); } catch (_) {}

            if (target.isContentEditable) {
                if (lastSelectionRange) {
                    try {
                        const sel = window.getSelection();
                        sel.removeAllRanges();
                        sel.addRange(lastSelectionRange);
                    } catch (_) {}
                }
                // Le texte du modèle est traité comme du texte, jamais comme du HTML
                // (une réponse contenant <script> ou <img onerror> serait sinon
                // injectée telle quelle dans la page hôte).
                const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
                const html = escapeHtml(text).split('\n\n').map(p => p.replace(/\n/g, '<br>')).join('<br><br>');
                let inserted = false;
                try { inserted = document.execCommand('insertHTML', false, html); } catch (_) {}
                if (!inserted) {
                    try {
                        const sel = window.getSelection();
                        if (sel && sel.rangeCount > 0) {
                            const range = sel.getRangeAt(0);
                            range.deleteContents();
                            range.insertNode(range.createContextualFragment(html));
                        }
                    } catch (_) {}
                }
                previousFocus = null;   // le focus reste dans le champ cible
                showToast('Texte inséré');
                closePreview();
                return;
            }

            if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
                const start = (typeof target.selectionStart === 'number') ? target.selectionStart : target.value.length;
                const end   = (typeof target.selectionEnd === 'number')   ? target.selectionEnd   : target.value.length;
                target.value = target.value.substring(0, start) + text + target.value.substring(end);
                target.selectionStart = target.selectionEnd = start + text.length;
                target.dispatchEvent(new Event('input', { bubbles: true }));
                target.dispatchEvent(new Event('change', { bubbles: true }));
                previousFocus = null;
                showToast('Texte inséré');
                closePreview();
                return;
            }
        }

        doCopy();
        showToast('Aucun champ éditable détecté — texte copié dans le presse-papier', true);
    }

    // ─── Toast ───────────────────────────────────────────────────────────
    let toastTimer = null;
    function showToast(msg, isError = false) {
        toast.textContent = msg;
        toast.className = isError ? 'error' : '';
        void toast.offsetHeight;
        toast.classList.add('visible');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove('visible'), 2600);
    }

    // ─── Déplacement de la modale ────────────────────────────────────────
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

    // Première utilisation sur la page : le clic droit vient d'avoir lieu,
    // le champ est encore actif et la sélection encore en place.
    captureContext(true);

    // ─── Messages du Service Worker ──────────────────────────────────────
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
        if (!msg) return;
        if (msg.action === 'ping') { sendResponse({ pong: true }); return; }
        if (msg.action === 'getSelection') { captureContext(false); sendResponse({ text: getSelectionText() }); return; }

        switch (msg.phase) {
            case 'form':    showForm(msg.title, msg.form || { fields: [] }, msg.request || {}); break;
            case 'loading': showLoading(msg.title, { inputChars: msg.inputChars, isLocal: msg.isLocal }); break;
            case 'preview': showPreview(msg.title, msg.request); break;
            case 'stream':  showStream(msg.title, msg.partial, msg.reasoningChars); break;
            case 'result':  showResult(msg); break;
            case 'error':   showError(msg.title, msg.error); break;
            case 'reopen':  reopenLast(); break;
            case 'insert':  requestInsert(); break;
            case 'toast':   showToast(msg.message, !!msg.isError); break;
        }
        sendResponse({ received: true });
    });
})();
