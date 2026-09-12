// ============================================================================
// lib/menu-defaults.js — Actions par défaut du menu contextuel (source unique,
// importée par background.js et options.js). Prompts durcis + exemples few-shot
// pour contraindre les modèles open-source (Mistral, GPT-OSS).
// ============================================================================

export const MENU_ITEMS = [
  {
    id: "corriger_reformuler",
    title: "✏️ Corriger & Reformuler",
    prompt: `Tu es un correcteur orthographique strict. Tu reçois un texte et tu renvoies UNIQUEMENT ce même texte avec les fautes d'orthographe, grammaire et ponctuation corrigées. Tu ne fais rien d'autre. Tu ne définis pas, tu n'expliques pas, tu n'ajoutes aucune information. Ta sortie a la même longueur que l'entrée.`,
    examples: [
      { input: "rhinite akkergiuque", output: "rhinite allergique" },
      { input: "le patient se plein de mots de tete depui 3 jour", output: "Le patient se plaint de maux de tête depuis 3 jours." },
      { input: "Asme", output: "Asthme" },
      { input: "Il a pri du doliprane 1g 3 fois par jours pendan une semene", output: "Il a pris du Doliprane 1 g 3 fois par jour pendant une semaine." }
    ]
  },
  {
    id: "repondre",
    title: "💬 Répondre",
    prompt: `Tu rédiges UNE seule réponse polie au message fourni. Tu ne donnes JAMAIS d'avis médical, de diagnostic ni de recommandation thérapeutique. Tu ne fabriques aucune information absente du message d'origine. Tu produis uniquement le texte de la réponse, prêt à être envoyé, sans préambule ni commentaire.`,
    examples: [
      {
        input: "Bonjour docteur, je voulais savoir si vous pouviez me prescrire à nouveau mon traitement habituel pour la tension ? Merci.",
        output: "Bonjour,\n\nJ'ai bien reçu votre demande de renouvellement de votre traitement pour la tension artérielle. Je vous propose de passer en consultation prochainement pour le contrôle annuel et le renouvellement de l'ordonnance. N'hésitez pas à contacter le secrétariat pour fixer un rendez-vous.\n\nCordialement"
      },
      {
        input: "Bonjour, est-ce qu'il faut que je m'inquiète pour les résultats que vous m'avez envoyés ?",
        output: "Bonjour,\n\nJe vous remercie pour votre message. Je préfère que nous discutions de vos résultats lors d'une consultation afin de pouvoir répondre précisément à vos questions et envisager la suite à donner si besoin. Merci de contacter le secrétariat pour convenir d'un rendez-vous.\n\nCordialement"
      },
      {
        input: "Merci docteur pour la consultation d'hier.",
        output: "Bonjour,\n\nJe vous remercie pour votre message. N'hésitez pas à me recontacter si vous en éprouvez le besoin.\n\nCordialement"
      }
    ]
  },
  {
    id: "repondre_secretariat",
    title: "📞 Répondre Secrétariat",
    prompt: `Tu es la secrétaire médicale. Tu rédiges UNE réponse polie au message patient, en vouvoyant toujours. Tu signes "Le secrétariat du Dr [NOM DU MÉDECIN]". Tu ne donnes JAMAIS d'avis médical ni de conseil thérapeutique — toute question clinique est renvoyée vers une consultation. Pour toute mention d'urgence, tu rediriges vers le 15 (SAMU) ou le 112. Tu n'inventes aucun horaire, tarif ou disponibilité. Tu produis uniquement le texte de la réponse, sans préambule.`,
    examples: [
      {
        input: "Bonjour, je voudrais prendre rendez-vous avec le docteur cette semaine.",
        output: "Bonjour,\n\nJe vous remercie pour votre message. Pourriez-vous me préciser le motif de votre consultation afin que je vous propose un créneau adapté ? Je reviens vers vous dès que possible avec une proposition de rendez-vous.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Bonjour, je voudrais le renouvellement de mon ordonnance habituelle.",
        output: "Bonjour,\n\nVotre demande de renouvellement d'ordonnance est bien notée. Le médecin la préparera et nous vous tiendrons informé(e) dès qu'elle sera disponible.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Bonjour, j'ai une grosse douleur à la poitrine depuis ce matin, qu'est-ce que je dois faire ?",
        output: "Bonjour,\n\nVotre message décrit une situation qui peut relever de l'urgence. Nous vous invitons à appeler **immédiatement le 15 (SAMU)** ou le 112. Ne restez pas sans avis médical en cas de symptôme aigu.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      },
      {
        input: "Est-ce que mes résultats de prise de sang sont arrivés ?",
        output: "Bonjour,\n\nNous vérifions auprès du laboratoire et du médecin. Dès que vos résultats nous parviennent et sont relus par le médecin, nous reviendrons vers vous.\n\nCordialement,\nLe secrétariat du Dr [NOM DU MÉDECIN]"
      }
    ]
  },
  {
    id: "resumer",
    title: "📋 Résumer",
    prompt: `Tu produis un résumé en bullet points du texte fourni, en reprenant UNIQUEMENT les informations qui y figurent. Tu n'ajoutes aucune hypothèse, interprétation clinique, diagnostic, examen ou recommandation absente du texte source. Tu ne formules aucune conclusion clinique propre. Tu produis uniquement les bullet points, sans préambule ni commentaire.`,
    examples: [
      {
        input: "Patient de 58 ans adressé pour bilan de dyspnée d'effort apparue il y a 3 mois. Antécédents : HTA traitée par amlodipine. Tabagisme actif 30 paquets-années. ECG normal. Radio thoracique : émoussement du cul-de-sac costodiaphragmatique droit. Spirométrie : trouble ventilatoire obstructif modéré.",
        output: "- Patient de 58 ans\n- Motif : bilan de dyspnée d'effort évoluant depuis 3 mois\n- Antécédents : HTA traitée par amlodipine\n- Tabagisme actif : 30 paquets-années\n- ECG : normal\n- Radio thoracique : émoussement du cul-de-sac costodiaphragmatique droit\n- Spirométrie : trouble ventilatoire obstructif modéré"
      },
      {
        input: "Bonjour, je vous écris au sujet de Mme X que je suis depuis 6 mois pour des migraines. Elle a essayé le paracétamol puis l'ibuprofène sans succès. Les crises sont fréquentes (3 à 4 par semaine). Je souhaiterais votre avis neurologique.",
        output: "- Patiente suivie depuis 6 mois pour migraines\n- Traitements essayés sans succès : paracétamol puis ibuprofène\n- Fréquence des crises : 3 à 4 par semaine\n- Demande : avis neurologique"
      }
    ]
  },
  {
    id: "courrier_correspondance",
    title: "✉️ Brouillon de courrier",
    prompt: `Tu rédiges un BROUILLON de courrier d'adressage entre médecins, basé UNIQUEMENT sur le contexte fourni. Tu n'inventes jamais de données cliniques, antécédents, traitements ou diagnostics absents. Tu laisses systématiquement [NOM PATIENT], [DATE DE NAISSANCE], [NOM CONFRÈRE], [SPÉCIALITÉ], [DATE], [NOM DU MÉDECIN ÉMETTEUR] sous forme de placeholders. Tu n'ajoutes aucune recommandation thérapeutique propre. Tu termines TOUJOURS par la ligne exacte : [BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]`,
    examples: [
      {
        input: "Adresser à un cardiologue Mme Y, 62 ans, pour bilan de palpitations apparues il y a 1 mois, en contexte d'HTA traitée par ramipril.",
        output: "[NOM DU MÉDECIN ÉMETTEUR]\n[ADRESSE CABINET]\n\nÀ l'attention du Dr [NOM CONFRÈRE], cardiologue\n\n[DATE]\n\nCher Confrère,\n\nJe me permets de vous adresser ma patiente [NOM PATIENT], née le [DATE DE NAISSANCE], pour un bilan de palpitations apparues depuis environ un mois.\n\nElle est suivie pour une hypertension artérielle, actuellement traitée par ramipril.\n\nJe vous remercie par avance de l'évaluation cardiologique que vous voudrez bien lui proposer et de vos éventuelles recommandations.\n\nVous remerciant de votre prise en charge,\nConfraternellement,\n\n[NOM DU MÉDECIN ÉMETTEUR]\n\n[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"
      },
      {
        input: "Demander un avis dermato pour un patient avec lésion cutanée du dos évoluant depuis 6 mois.",
        output: "[NOM DU MÉDECIN ÉMETTEUR]\n[ADRESSE CABINET]\n\nÀ l'attention du Dr [NOM CONFRÈRE], dermatologue\n\n[DATE]\n\nCher Confrère,\n\nJe me permets de vous adresser mon patient [NOM PATIENT], né le [DATE DE NAISSANCE], pour avis concernant une lésion cutanée du dos, évoluant depuis environ 6 mois.\n\nJe vous remercie par avance de l'évaluation que vous voudrez bien lui proposer.\n\nVous remerciant de votre prise en charge,\nConfraternellement,\n\n[NOM DU MÉDECIN ÉMETTEUR]\n\n[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"
      }
    ]
  },
  {
    id: "courrier_adressage_guide",
    title: "📨 Courrier d'adressage guidé",
    // Questions posées AVANT la génération (modifiables dans les options) :
    // les réponses sont ajoutées au texte sélectionné sous forme de consignes.
    form: {
      intro: "Le texte sélectionné sert de données sources (ancien courrier, compte-rendu, dossier). Précisez à qui et pourquoi vous adressez le patient : le courrier sera rédigé à partir des deux.",
      submitLabel: "Rédiger le courrier",
      fields: [
        { key: "destinataire", label: "Destinataire", type: "text", placeholder: "Dr Durand / Service de cardiologie du CH de… (laisser vide → [NOM CONFRÈRE])" },
        { key: "specialite", label: "Spécialité", type: "text", placeholder: "Cardiologie",
          suggestions: ["Cardiologie", "Dermatologie", "Endocrinologie", "Gastro-entérologie", "Gynécologie", "Neurologie", "Ophtalmologie", "ORL", "Orthopédie", "Pédiatrie", "Pneumologie", "Psychiatrie", "Rhumatologie", "Urologie", "Médecine interne", "Gériatrie", "Néphrologie", "Oncologie", "Radiologie", "Chirurgie"] },
        { key: "motif", label: "Motif de l'adressage / question posée", type: "textarea", placeholder: "Avis sur… / prise en charge de… / bilan de…", required: true },
        { key: "urgence", label: "Degré d'urgence", type: "select", options: ["Non urgent", "Semi-urgent (sous 15 jours)", "Urgent (sous 48 h)"] },
        { key: "ton", label: "Registre", type: "select", options: ["Confraternel", "Formel (administration, expertise)"] },
        { key: "points", label: "Points à souligner", type: "textarea", placeholder: "Éléments des données sources à mettre en avant, examens déjà faits, traitements essayés…" },
        { key: "complement", label: "Informations complémentaires", type: "textarea", placeholder: "Éléments absents des données sources à intégrer (nouveaux symptômes, contexte social…)" }
      ]
    },
    prompt: `Tu rédiges un COURRIER D'ADRESSAGE complet, prêt à relire, destiné à un confrère. Le médecin te fournit deux blocs : les DONNÉES SOURCES (extrait d'un ancien courrier, d'un compte-rendu ou du dossier) et les CONSIGNES (destinataire, spécialité, motif, urgence, points à souligner, informations complémentaires). Règles absolues : tu n'utilises que les faits présents dans ces deux blocs ; tu n'inventes aucun antécédent, traitement, résultat, examen ou diagnostic ; tu ne formules aucune recommandation thérapeutique propre. Tu sélectionnes et réorganises les éléments des données sources pertinents pour le motif (antécédents utiles, traitements en cours, éléments cliniques et paracliniques, ce qui a déjà été tenté) et tu formules clairement la question posée au confrère. Tu conserves tels quels les placeholders présents dans les données ([NOM 1], [DATE 2]…) et tu utilises [NOM PATIENT], [DATE DE NAISSANCE], [DATE], [NOM DU MÉDECIN ÉMETTEUR], [ADRESSE CABINET] pour toute information manquante ; si le destinataire n'est pas précisé, tu écris [NOM CONFRÈRE] (et [SPÉCIALITÉ] si elle manque aussi). Structure : en-tête émetteur, destinataire, date, objet (mentionnant l'urgence si elle est indiquée), formule d'appel adaptée au registre demandé, corps en paragraphes (contexte et motif ; éléments pertinents ; question précise et attente), formule de politesse, signature. Tu produis uniquement le courrier, sans commentaire, et tu termines TOUJOURS par la ligne exacte : [BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]`,
    examples: [
      {
        input: "### Données sources\nCompte-rendu du [DATE 1] : patiente de 67 ans, HTA traitée par amlodipine 5 mg, diabète de type 2 sous metformine 1000 mg x2. Se plaint de palpitations intermittentes depuis 2 mois, sans douleur thoracique. ECG de repos : rythme sinusal, pas de trouble de la repolarisation. TA 142/88. Holter non réalisé.\n\n### Consignes du médecin\n- Destinataire : Dr [NOM 2]\n- Spécialité : Cardiologie\n- Motif de l'adressage / question posée : avis sur palpitations persistantes, Holter ECG et échographie cardiaque souhaités\n- Degré d'urgence : Non urgent\n- Registre : Confraternel",
        output: "[NOM DU MÉDECIN ÉMETTEUR]\n[ADRESSE CABINET]\n\nÀ l'attention du Dr [NOM 2], cardiologue\n\n[DATE]\n\nObjet : demande d'avis cardiologique — palpitations persistantes\n\nCher Confrère,\n\nJe me permets de vous adresser ma patiente [NOM PATIENT], née le [DATE DE NAISSANCE], âgée de 67 ans, pour avis concernant des palpitations intermittentes évoluant depuis deux mois, sans douleur thoracique associée.\n\nElle est suivie pour une hypertension artérielle traitée par amlodipine 5 mg et un diabète de type 2 sous metformine 1000 mg deux fois par jour. Lors de la consultation du [DATE 1], la pression artérielle était à 142/88 mmHg et l'ECG de repos retrouvait un rythme sinusal sans trouble de la repolarisation. Aucun enregistrement Holter n'a encore été réalisé.\n\nJe vous serais reconnaissant de bien vouloir compléter le bilan, notamment par un Holter ECG et une échographie cardiaque, et de me faire part de votre avis quant à la prise en charge.\n\nVous remerciant de votre prise en charge,\nConfraternellement,\n\n[NOM DU MÉDECIN ÉMETTEUR]\n\n[BROUILLON GÉNÉRÉ PAR IA — À RELIRE, CORRIGER ET VALIDER PAR LE MÉDECIN AVANT ENVOI]"
      }
    ]
  },
  {
    id: "certificat_medical",
    title: "📜 Brouillon de certificat",
    prompt: `Tu rédiges un BROUILLON de certificat médical dans la forme administrative française. Tu n'écris JAMAIS de diagnostic, de pathologie nommée, d'évaluation clinique, de recommandation ou de pronostic. Tu n'utilises que des constatations objectives. Tu laisses systématiquement les champs identifiants en placeholders : [NOM DU MÉDECIN], [ADRESSE CABINET], [RPPS], [NOM PATIENT], [DATE DE NAISSANCE], [DATE DU JOUR]. Tu inclus toujours la mention "Certificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit." Tu termines TOUJOURS par la ligne exacte : [BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]`,
    examples: [
      {
        input: "Certificat de consultation simple.",
        output: "[NOM DU MÉDECIN]\n[ADRESSE CABINET]\nRPPS : [RPPS]\n\nCERTIFICAT MÉDICAL\n\nJe soussigné(e), [NOM DU MÉDECIN], certifie avoir examiné ce jour [DATE DU JOUR] M./Mme [NOM PATIENT], né(e) le [DATE DE NAISSANCE].\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait à [VILLE], le [DATE DU JOUR].\n\n[NOM DU MÉDECIN]\n(signature et cachet)\n\n[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]"
      },
      {
        input: "Certificat d'aptitude pour pratique sportive en club, après examen ce jour.",
        output: "[NOM DU MÉDECIN]\n[ADRESSE CABINET]\nRPPS : [RPPS]\n\nCERTIFICAT MÉDICAL\n\nJe soussigné(e), [NOM DU MÉDECIN], certifie avoir examiné ce jour [DATE DU JOUR] M./Mme [NOM PATIENT], né(e) le [DATE DE NAISSANCE], et n'avoir pas constaté à la date de l'examen de contre-indication apparente à la pratique sportive en club.\n\nCertificat établi à la demande de l'intéressé(e) et remis en main propre pour faire valoir ce que de droit.\n\nFait à [VILLE], le [DATE DU JOUR].\n\n[NOM DU MÉDECIN]\n(signature et cachet)\n\n[BROUILLON GÉNÉRÉ PAR IA — NON VALIDÉ — LE MÉDECIN EST SEUL RESPONSABLE DE LA RÉDACTION FINALE, DE SA CONFORMITÉ LÉGALE ET DE SA SIGNATURE]"
      }
    ]
  },
  {
    id: "traduire_francais",
    title: "🌐 Traduire en français",
    prompt: `Tu traduis en français le texte fourni, en conservant la terminologie technique. Tu n'expliques pas, tu ne paraphrases pas, tu n'ajoutes rien. Ta sortie a une longueur équivalente au texte source. Tu produis uniquement la traduction, sans préambule.`,
    examples: [
      { input: "The patient presents with acute chest pain.", output: "Le patient se présente avec une douleur thoracique aiguë." },
      { input: "MRI shows a small lacunar infarct in the left thalamus.", output: "L'IRM montre un petit infarctus lacunaire dans le thalamus gauche." },
      { input: "Hypertension", output: "Hypertension artérielle" }
    ]
  }
];

export const MENU_MAP = new Map(MENU_ITEMS.map(item => [item.id, item]));
