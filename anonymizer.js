// ============================================================================
// anonymizer.js — Anonymisation automatique des données identifiantes
// Chargé via importScripts() dans background.js (Service Worker MV3).
// Détecte et remplace les données personnelles avant envoi à l'API.
// ============================================================================

// Acronymes médicaux à NE PAS confondre avec des noms propres
const MEDICAL_ACRONYMS = new Set([
  "ECG","EEG","EMG","IRM","TDM","TEP","PET","CT","NFS","TSH","CRP","VS","INR","TP","TCA",
  "HAS","ANSM","INSERM","CHU","CHR","EHPAD","SAMU","SMUR","IDE","RPPS","ADELI","FINESS",
  "HbA1c","LDL","HDL","AVC","AVK","AOD","BPCO","OAP","IDM","SCA","IC","IM","IT","PR",
  "SEP","AIT","RGO","MCE","EP","EP","TVP","EPO","GFR","DFG","UI","ALD","ITT","AT","MP",
  "HGPO","HBPM","AAA","AIC","ALAT","ASAT","BAV","BMI","BNP","CCA","DCI","DGS","DM","DMS",
  "EFR","ETT","ETO","FC","FEVG","FR","GB","GGT","HAS","Hb","Ht","HTA","HTAP","IMC","IPP",
  "IRC","IRA","IST","IV","IM","NAD","NYHA","OMI","OMS","PCR","PEP","PSA","RAA","RCH","RR",
  "SAS","SPO2","TA","TAD","TAS","VGM","TCMH","CCMH","Ig","IgG","IgM","IgA","IgE",
  "RAI","RPS","CMI","RIA","BPL","BPF","SIDA","VIH","VHC","VHB","VZV","CMV","EBV","HSV",
  "ANCA","AC","AAN","IGF","TSH","T3","T4","ACTH","LH","FSH","GH","DHEA","PTH","CT",
  "ROS","NO","COX","LOX","PG","TNF","IL","IFN","CD","HLA","BCR","TCR","MHC"
]);

// Titres de civilité
const TITRES = "(M\\.|Mme\\.?|Mlle\\.?|Mr\\.?|Mrs\\.?|Dr\\.?|Pr\\.?|Me\\.?|Monsieur|Madame|Mademoiselle|Docteur|Professeur|Maître|Patient|Patiente)";

/**
 * Anonymise un texte en remplaçant les données identifiantes.
 * @param {string} text — texte d'entrée
 * @returns {{text: string, count: number, replacements: Object}}
 */
function anonymizeText(text) {
  if (!text) return { text: "", count: 0, replacements: {} };

  let out = text;
  const replacements = {
    email: 0, nir: 0, tel: 0, date: 0, cp_ville: 0, nom: 0, ipp: 0
  };

  // 1. Emails
  out = out.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, () => {
    replacements.email++;
    return "[EMAIL]";
  });

  // 2. NIR (numéro de sécurité sociale français : 13 chiffres + clé 2 chiffres)
  //    Format : [1-2] AA MM DD/2A/2B CCC NNN [KK] — avec ou sans espaces
  out = out.replace(
    /\b[12]\s?\d{2}\s?(?:0[1-9]|1[0-2]|2[0-9]|3[0-9]|4[0-9]|5[0-9]|6[0-9]|7[0-9]|8[0-9]|9[0-9])\s?(?:2A|2B|\d{2,3})\s?\d{3}\s?\d{3}(?:\s?\d{2})?\b/g,
    () => {
      replacements.nir++;
      return "[NIR]";
    }
  );

  // 3. IPP / numéro de dossier (IPP: 6-12 chiffres précédés de mots-clés)
  out = out.replace(
    /\b(IPP|N°\s*dossier|N°\s*patient|Dossier\s*n°)\s*:?\s*\d{4,12}\b/gi,
    () => {
      replacements.ipp++;
      return "[IPP]";
    }
  );

  // 4. Téléphones français (fixes et mobiles)
  out = out.replace(
    /\b(?:\+33\s?|0033\s?|0)[1-9](?:[\s.\-]?\d{2}){4}\b/g,
    () => {
      replacements.tel++;
      return "[TEL]";
    }
  );

  // 5. Dates (DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY, DD MM YYYY)
  out = out.replace(
    /\b(0?[1-9]|[12]\d|3[01])[\/.\-\s](0?[1-9]|1[0-2])[\/.\-\s](19|20)\d{2}\b/g,
    () => {
      replacements.date++;
      return "[DATE]";
    }
  );

  // 6. Code postal + ville (5 chiffres + mots capitalisés)
  out = out.replace(
    /\b\d{5}\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ\-']+(?:[\s\-][A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ\-']+){0,3}/g,
    () => {
      replacements.cp_ville++;
      return "[CP_VILLE]";
    }
  );

  // 7. Titres + Nom(s) : M. Dupont / Mme Marie Dupont / Dr Jean-Pierre Martin
  const titresRegex = new RegExp(
    `\\b${TITRES}\\s+([A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ\\-']+(?:\\s+[A-ZÀ-ÖØ-Ý][a-zà-öø-ÿ\\-']+){0,3})\\b`,
    "g"
  );
  out = out.replace(titresRegex, (match, titre) => {
    replacements.nom++;
    return `${titre} [NOM]`;
  });

  // 8. Noms en MAJUSCULES (format classique médical : "DUPONT Jean")
  //    2+ lettres majuscules, possiblement composé (DE LA FONTAINE, SAINT-MARTIN)
  out = out.replace(
    /\b([A-ZÀ-ÖØ-Ý]{2,}(?:[\s\-][A-ZÀ-ÖØ-Ý]{2,}){0,3})\b/g,
    (match, nom) => {
      // Vérifier que ce n'est pas un acronyme médical
      const cleaned = nom.replace(/[\s\-]/g, "");
      if (MEDICAL_ACRONYMS.has(nom) || MEDICAL_ACRONYMS.has(cleaned)) return match;
      // Ignore si moins de 3 caractères au total
      if (cleaned.length < 3) return match;
      replacements.nom++;
      return "[NOM]";
    }
  );

  // 9. "né(e) le" / "date de naissance" + date = déjà couvert par 5, on renforce
  out = out.replace(
    /\b(né|née|naissance)\s+(?:le\s+)?(?:\[DATE\]|\d+)/gi,
    (match) => match.replace(/\d+/g, "[DATE]")
  );

  // 10. Adresses (numéro + rue/avenue/boulevard...)
  out = out.replace(
    /\b\d{1,4}(?:\s?(?:bis|ter|quater))?\s+(?:rue|avenue|av\.|boulevard|bd\.|bd|place|pl\.|impasse|allée|route|rte\.|chemin|ch\.|quai|cours)\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ\-']+(?:\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ\-']+){0,5}/gi,
    () => "[ADRESSE]"
  );

  const count = Object.values(replacements).reduce((a, b) => a + b, 0);
  return { text: out, count, replacements };
}
