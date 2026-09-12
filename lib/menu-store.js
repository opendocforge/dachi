// ============================================================================
// lib/menu-store.js — Persistance des actions du menu contextuel.
//
// Une clé chrome.storage.sync par action ("menu_<id>") pour rester sous la
// limite QUOTA_BYTES_PER_ITEM (8 192 octets) même avec des exemples few-shot
// personnalisés sur chaque action. L'ancien format (une seule clé
// `menuOverrides` + `customMenuItems`) est migré automatiquement.
// ============================================================================

export const MENU_KEY_PREFIX = "menu_";
export const LEGACY_KEYS = ["menuOverrides", "customMenuItems"];
// Marge sous la limite Chrome (8 192 octets, clé + valeur sérialisée)
export const MAX_ITEM_BYTES = 8000;

export const keyFor = (id) => `${MENU_KEY_PREFIX}${id}`;
export const isMenuKey = (key) => key.startsWith(MENU_KEY_PREFIX) || LEGACY_KEYS.includes(key);

function byteLength(str) {
  return new TextEncoder().encode(str).length;
}

/**
 * Charge la configuration : { overrides: {id → {title?, prompt?, examples?, enabled?}},
 * custom: [{id, title, prompt, examples, enabled}] }.
 * Migre l'ancien format si présent.
 */
export async function loadMenuConfig() {
  const all = await chrome.storage.sync.get(null);
  const overrides = {};
  const custom = [];

  for (const [key, value] of Object.entries(all)) {
    if (!key.startsWith(MENU_KEY_PREFIX) || !value || typeof value !== "object") continue;
    const id = key.slice(MENU_KEY_PREFIX.length);
    if (value.custom) {
      custom.push({ id, title: value.title || id, prompt: value.prompt || "", examples: value.examples || [], enabled: value.enabled !== false, form: value.form || null });
    } else {
      overrides[id] = value;
    }
  }

  // Migration de l'ancien format
  const legacyOverrides = all.menuOverrides;
  const legacyCustom = all.customMenuItems;
  if (legacyOverrides || legacyCustom) {
    const writes = {};
    for (const [id, ov] of Object.entries(legacyOverrides || {})) {
      if (!overrides[id]) { overrides[id] = ov; writes[keyFor(id)] = ov; }
    }
    for (const item of legacyCustom || []) {
      if (!item || !item.id || custom.some(c => c.id === item.id)) continue;
      const entry = { custom: true, title: item.title, prompt: item.prompt, examples: item.examples || [], enabled: item.enabled !== false };
      custom.push({ id: item.id, ...entry });
      writes[keyFor(item.id)] = entry;
    }
    try {
      if (Object.keys(writes).length) await chrome.storage.sync.set(writes);
      await chrome.storage.sync.remove(LEGACY_KEYS);
    } catch (_) {
      // Quota ou erreur transitoire : on garde l'ancien format, la migration
      // sera retentée au prochain chargement.
    }
  }

  custom.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return { overrides, custom };
}

/**
 * Enregistre une action (override d'une action par défaut, ou action perso
 * avec `custom: true`). Rejette avec Error("QUOTA") si l'entrée dépasse la
 * limite par clé, ou l'erreur Chrome d'origine.
 */
export async function saveMenuItem(id, data) {
  const key = keyFor(id);
  const size = byteLength(key) + byteLength(JSON.stringify(data));
  if (size > MAX_ITEM_BYTES) {
    const err = new Error("QUOTA");
    err.size = size;
    throw err;
  }
  await chrome.storage.sync.set({ [key]: data });
}

export async function removeMenuItem(id) {
  await chrome.storage.sync.remove(keyFor(id));
}

/**
 * Liste effective des actions (défauts + overrides + perso), dans l'ordre du menu.
 * @returns {Array<{id, title, prompt, examples, enabled, isDefault, override}>}
 */
export function resolveMenuItems(defaults, config) {
  const items = defaults.map(item => {
    const ov = (config.overrides && config.overrides[item.id]) || {};
    return {
      id: item.id,
      title: ov.title || item.title,
      prompt: ov.prompt || item.prompt,
      examples: Array.isArray(ov.examples) ? ov.examples : (item.examples || []),
      enabled: ov.enabled !== false,
      // Questions avant génération : l'override peut en définir, en retirer
      // (form: null) ou hériter de celles de l'action par défaut.
      form: ov.form !== undefined ? ov.form : (item.form || null),
      isDefault: true,
      override: ov
    };
  });
  for (const c of config.custom || []) {
    items.push({ ...c, form: c.form || null, isDefault: false, override: null });
  }
  return items;
}
