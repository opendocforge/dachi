// ============================================================================
// lib/anonymizer.js — Pseudonymisation locale des données identifiantes.
//
// anonymizeText() remplace chaque valeur identifiante par un placeholder
// numéroté ([NOM 1], [DATE 2], …) et renvoie la table de correspondance
// placeholder → valeur d'origine. rehydrateText() fait l'opération inverse
// sur la réponse de l'IA. La table ne doit JAMAIS quitter le poste de
// l'utilisateur : seul le texte anonymisé est envoyé à l'API.
//
// Module partagé par background.js (Service Worker en mode module) et les
// tests unitaires (node --test).
// ============================================================================

export const MEDICAL_ACRONYMS = new Set([
  // Examens / biologie
  "ECG","EEG","EMG","IRM","TDM","TEP","PET","CT","NFS","TSH","CRP","VS","INR","TP","TCA",
  "HbA1c","LDL","HDL","GFR","DFG","ALAT","ASAT","GGT","Hb","Ht","VGM","TCMH","CCMH","BNP",
  "PSA","PCR","LDH","CPK","TGO","TGP","PAL","BU","ECBU","BHC","FSC","HGPO","EFR","ETT","ETO",
  "FEVG","SPO2","TA","TAD","TAS","FC","FR","GB","IMC","BMI","EVA","RAI","CMI","RIA","RAS",
  // Pathologies / cliniques
  "AVC","AIT","HSA","HED","HSD","TC","IDM","SCA","STEMI","NSTEMI","IC","IM","IT","IAo","RM",
  "RAC","FA","ESV","BAV","BBG","BBD","HVG","HTA","HTAP","AOMI","TVP","EP","MTEV","OAP","BPCO",
  "SAS","PID","PNO","RGO","RCH","MC","IRC","IRA","IST","MST","SEP","SLA","NMO","DFT","DCL",
  "MA","MCI","PR","RAA","AAA","CIVD","ACR","AVP","TNM","RCP","PPS","DA","ATCD","TTT","PEC",
  "IOA","SIDA","VIH","VHC","VHB","HBV","HCV","VZV","CMV","EBV","HSV","HPV","HTLV","COVID",
  "SARS","BCG","DTP","ROR","ORL","DIU","DIM","AAN","ANCA","AC","IgG","IgM","IgA","IgE","Ig",
  "IGF","T3","T4","ACTH","LH","FSH","GH","DHEA","PTH","EPO","ROS","NO","COX","LOX","PG","TNF",
  "IL","IFN","CD","HLA","BCR","TCR","MHC","NYHA","OMI","NAD","PEP","RR","TSA",
  // Traitements / voies
  "AVK","AOD","HBPM","IPP","VNI","PO","IV","SC","IN","VO","LP","LI","CP","GEL","AMP","SOL",
  "SUSP","MG","ML","UI","QSP","MCE","IDE",
  // Institutions / administratif
  "HAS","ANSM","INSERM","CHU","CHR","CH","EHPAD","SAMU","SMUR","SAU","UHCD","USI","USC","SSR",
  "HAD","RPPS","ADELI","FINESS","ALD","ITT","AT","MP","DCI","DGS","DM","DMS","DMP","INS",
  "CPAM","CNAM","MSA","ARS","CMU","CSS","AME","PMI","CMP","CATTP","ESAT","MDPH","AAH","APA",
  "PCH","AJPP","OMS","BPL","BPF","RPS","MT","AS","ASH",
  // Mots courants en capitales (formulaires, en-têtes) — pas des noms
  "NIR","RDV","CR","CRH","CRO","CRC","OK","NB","PS","CC","CV","TEL","TÉL","FAX","MAIL",
  "EMAIL","DATE","NOM","PRENOM","PRÉNOM","ADRESSE","URGENT","ATTENTION","IMPORTANT",
  "CERTIFICAT","MEDICAL","MÉDICAL","ORDONNANCE","COMPTE","RENDU","CONSULTATION"
]);

const TITRES = "(M\\.|Mme\\.?|Mlle\\.?|Mr\\.?|Mrs\\.?|Dr\\.?|Pr\\.?|Me\\.?|Monsieur|Madame|Mademoiselle|Docteur|Professeur|Maître|Patient|Patiente)";
const TITRE_RE = new RegExp(`^${TITRES}$`);
const MOIS = "(?:janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)";
const CAP = "[A-ZÀ-ÖØ-Ý]";
const LOW = "[a-zà-öø-ÿ\\-']";
// Un mot de nom propre : « Dupont » ou « DUPONT »
const WORD = `(?:${CAP}${LOW}+|${CAP}{2,})`;

const LABELS = {
  email: "EMAIL", nir: "NIR", ipp: "IPP", tel: "TEL", date: "DATE",
  cp_ville: "CP_VILLE", nom: "NOM", adresse: "ADRESSE"
};

// Sentinelle interne : \u0000<n>\u0000. Aucune règle ne peut la re-capturer
// (pas de lettre, pas de chiffre isolé), ce qui évite qu'un placeholder soit
// lui-même anonymisé par une règle suivante — c'était le cas de l'ancienne
// implémentation, où [DATE] / [TEL] / [EMAIL] finissaient tous en [[NOM]].
const SENTINEL = (n) => `\u0000${n}\u0000`;
const SENTINEL_RE = /\u0000(\d+)\u0000/g;

export function emptyReplacements() {
  return { email: 0, nir: 0, tel: 0, date: 0, cp_ville: 0, nom: 0, ipp: 0, adresse: 0 };
}

/**
 * @param {string} text
 * @param {{ customAcronyms?: Iterable<string> }} [options]
 * @returns {{ text: string, count: number, replacements: object, map: Record<string,string> }}
 */
export function anonymizeText(text, options = {}) {
  const replacements = emptyReplacements();
  if (!text) return { text: "", count: 0, replacements, map: {} };

  const custom = new Set(Array.from(options.customAcronyms || [], s => String(s).trim().toUpperCase()).filter(Boolean));
  const isAcronym = (s) => {
    const cleaned = s.replace(/[\s\-]/g, "");
    return MEDICAL_ACRONYMS.has(s) || MEDICAL_ACRONYMS.has(cleaned) || custom.has(cleaned.toUpperCase());
  };

  const entries = [];          // index → { kind, value }
  const byValue = new Map();   // "kind|valeur" → index
  const token = (kind, value) => {
    const key = `${kind}|${value}`;
    if (byValue.has(key)) return SENTINEL(byValue.get(key));
    const idx = entries.length;
    entries.push({ kind, value });
    byValue.set(key, idx);
    replacements[kind] += 1;
    return SENTINEL(idx);
  };

  let out = text;

  // Email
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (m) => token("email", m));

  // NIR (numéro de sécurité sociale, avec ou sans clé)
  out = out.replace(
    /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2]|[2-9]\d)\s?(?:2A|2B|\d{2,3})\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g,
    (m) => token("nir", m)
  );

  // IPP / n° de dossier
  out = out.replace(
    /\b(IPP|N°\s*dossier|N°\s*patient|Dossier\s*n°)\s*:?\s*(\d{4,12})\b/gi,
    (m, label, num) => `${label} ${token("ipp", num)}`
  );

  // Téléphone (formats français)
  out = out.replace(/(?:\+33\s?|0033\s?|\b0)[1-9](?:[\s.\-]?\d{2}){4}\b/g, (m) => token("tel", m));

  // Dates numériques jj/mm/aaaa
  out = out.replace(
    /\b(?:0?[1-9]|[12]\d|3[01])[\/.\-\s](?:0?[1-9]|1[0-2])[\/.\-\s](?:19|20)\d{2}\b/g,
    (m) => token("date", m)
  );

  // Dates en toutes lettres : 12 janvier 2024, 1er mars 2023
  out = out.replace(
    new RegExp(`\\b(?:0?[1-9]|[12]\\d|3[01])(?:er)?\\s+${MOIS}\\s+(?:19|20)\\d{2}\\b`, "gi"),
    (m) => token("date", m)
  );

  // Code postal + ville
  out = out.replace(
    new RegExp(`\\b\\d{5}\\s+${CAP}${LOW}+(?:[\\s\\-]${CAP}${LOW}+){0,3}`, "g"),
    (m) => token("cp_ville", m)
  );

  // Titre de civilité + Nom (Dr Martin, Mme DUPONT Marie…)
  out = out.replace(
    new RegExp(`\\b${TITRES}\\s+(${WORD}(?:\\s+${WORD}){0,3})\\b`, "g"),
    (m, titre, nom) => `${titre} ${token("nom", nom)}`
  );

  // Prénom NOM (Jean DUPONT) — la partie en capitales ne doit pas être un acronyme
  out = out.replace(
    new RegExp(`\\b(${CAP}${LOW}{1,})\\s+(${CAP}{2,}(?:[\\s\\-]${CAP}{2,}){0,3})\\b`, "g"),
    (m, prenom, nom) => (isAcronym(nom) || TITRE_RE.test(prenom)) ? m : token("nom", m)
  );

  // Mots en MAJUSCULES (noms de famille) hors acronymes médicaux
  out = out.replace(
    new RegExp(`\\b(${CAP}{2,}(?:[\\s\\-]${CAP}{2,}){0,3})\\b`, "g"),
    (m, nom) => {
      if (isAcronym(nom)) return m;
      if (nom.replace(/[\s\-]/g, "").length < 3) return m;
      return token("nom", m);
    }
  );

  // "né le 1960", "née en 1985" : année isolée après une mention de naissance
  out = out.replace(
    /\b(né|née|naissance)(\s+(?:le|en)\s+|\s+)((?:19|20)\d{2})\b/gi,
    (m, mot, sep, annee) => `${mot}${sep}${token("date", annee)}`
  );

  // Adresse postale
  out = out.replace(
    /\b\d{1,4}(?:\s?(?:bis|ter|quater))?\s+(?:rue|avenue|av\.|boulevard|bd\.|bd|place|pl\.|impasse|allée|route|rte\.|chemin|ch\.|quai|cours)\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ\-']+(?:\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ\-']+){0,5}/gi,
    (m) => token("adresse", m)
  );

  // Rendu final : placeholders numérotés dans l'ordre d'apparition + table
  const map = {};
  const numbering = new Map();   // index d'entrée → numéro d'apparition
  out = out.replace(SENTINEL_RE, (_, n) => {
    const idx = Number(n);
    if (!numbering.has(idx)) numbering.set(idx, numbering.size + 1);
    const e = entries[idx];
    const ph = `[${LABELS[e.kind]} ${numbering.get(idx)}]`;
    map[ph] = e.value;
    return ph;
  });

  const count = Object.values(replacements).reduce((a, b) => a + b, 0);
  return { text: out, count, replacements, map };
}

/**
 * Réinjecte les valeurs d'origine à la place des placeholders dans la réponse
 * de l'IA. Tolère les variantes d'écriture du modèle ([nom 1], [NOM_1], [ NOM 1 ]).
 * @returns {{ text: string, restored: number }}
 */
export function rehydrateText(text, map) {
  if (!text || !map) return { text: text || "", restored: 0 };
  let restored = 0;
  let out = text;
  for (const [ph, value] of Object.entries(map)) {
    const m = ph.match(/^\[([A-Z_]+) (\d+)\]$/);
    if (!m) continue;
    const label = m[1].replace(/_/g, "[_\\s]?");
    const re = new RegExp(`\\[\\s*${label}[\\s_\\-]*${m[2]}\\s*\\]`, "gi");
    out = out.replace(re, () => { restored += 1; return value; });
  }
  return { text: out, restored };
}

/** Parse la liste d'acronymes saisie par l'utilisateur (virgules, espaces, retours à la ligne). */
export function parseAcronymList(str) {
  return String(str || "").split(/[\s,;]+/).map(s => s.trim()).filter(Boolean);
}
