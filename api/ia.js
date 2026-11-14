// Fonction serveur Vercel : /api/ia
// Elle reçoit les demandes du navigateur et appelle Gemini.
// La clé reste ici, côté serveur : elle n'est jamais visible dans le navigateur.

const PROMPTS = {
  comprendre: `Tu es l'assistant de LaboPoche, un laboratoire virtuel de physique-chimie pour les lycéens togolais.
L'élève t'envoie une photo de leçon, un texte ou une phrase dictée.
Choisis UNE expérience parmi :
- "ohm" : loi d'Ohm, tension, intensité, résistance, circuit électrique
- "refraction" : réfraction de la lumière, indice de réfraction, loi de Snell-Descartes, réflexion totale
- "cinetique" : cinétique chimique, vitesse de réaction, temps de demi-réaction, influence de la température ou de la concentration, hydrolyse du chlorure de tertiobutyle
Si aucune ne correspond, choisis "aucune" : une simulation sera alors créée sur mesure pour le sujet.
Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "experience": "ohm" | "refraction" | "cinetique" | "aucune",
  "sujet": "nom court du sujet scientifique demandé (ex : Chute libre, Pendule simple, Photosynthèse)",
  "scientifique": true si la demande porte sur les sciences (physique, chimie, SVT, niveau lycée ou université), sinon false,
  "titre": "titre court du TP",
  "objectif": "ce que l'élève va découvrir, en une phrase simple",
  "question_prediction": "une question qui demande à l'élève de prédire le résultat AVANT de manipuler",
  "message_si_aucune": "si la demande n'est pas scientifique, explique gentiment que LaboPoche fait des expériences de sciences, sinon chaîne vide"
}`,

  generer: `Tu es l'ingénieur pédagogique de LaboPoche, un laboratoire virtuel de sciences pour lycéens et étudiants africains.
Crée une simulation interactive pour le sujet donné (physique, chimie, SVT, niveau lycée ou université).
Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "titre": "titre court de l'expérience",
  "objectif": "ce que l'élève va découvrir, en une phrase simple",
  "explication": ["2 ou 3 phrases simples qui expliquent le phénomène"],
  "formule": "la loi principale en texte clair, sans LaTeX (ex : T = 2π × √(L / g))",
  "question_prediction": "une question qui demande à l'élève de prédire le résultat AVANT de manipuler",
  "colonnes": ["noms des grandeurs avec leur unité, ex : L (m)", "T (s)"],
  "graphe": { "x": "une des colonnes (une grandeur réglée)", "y": "une des colonnes (une grandeur mesurée)" },
  "html": "le document HTML complet de la simulation"
}
Règles pour "colonnes" : 2 à 4 colonnes. D'abord les réglages des curseurs, puis les grandeurs mesurées.
Règles pour "html" :
- Document HTML autonome : <!DOCTYPE html>, CSS et JavaScript inline. AUCUNE ressource externe (pas de CDN, pas d'image distante, pas de police externe) et aucun appel réseau (pas de fetch, XMLHttpRequest, WebSocket).
- Moins de 8 000 caractères : code court, simple, robuste, sans commentaires et sans erreur JavaScript.
- Pleine largeur, lisible dès 320 px de large, sans défilement horizontal. body { margin: 0; padding: 12px; font-family: system-ui, sans-serif; background: #FBFAF6; color: #1B1F2A; }. Couleurs : vert #0F8A5F, orange #E8792B, bleu #2563C9.
- Une simulation visuelle, animée ou qui réagit tout de suite aux réglages, dans un <svg viewBox="..."> en width 100 %, ou dans un <canvas> dont la taille suit la largeur de la fenêtre.
- 1 à 3 curseurs <input type="range"> en width 100 %, chacun avec son nom, sa valeur et son unité affichés. Éventuellement un bouton (ex : Lâcher, Lancer, Recommencer). Aucun autre contrôle.
- Un afficheur des grandeurs mesurées : police monospace, fond #1B1F2A, texte #7CFFB2, coins arrondis.
- Calculs fidèles aux lois scientifiques : vraies formules, vraies constantes, unités SI. Si c'est un modèle simplifié, écris « Modèle simplifié » en petit sous la simulation.
- À chaque changement, et une première fois dès le chargement, appelle :
  window.parent.postMessage({ type: 'labopoche-etat', valeurs: {...}, mesures: {...} }, '*')
  "valeurs" contient les réglages des curseurs, "mesures" les grandeurs mesurées ou calculées. Leurs clés sont EXACTEMENT les textes de "colonnes" et leurs valeurs sont des nombres (3 chiffres significatifs). Pendant une animation, envoie l'état au plus 10 fois par seconde.
- Pas de tableau de mesures ni de bouton « Mesurer » : la page LaboPoche les gère.
- Pas de alert, prompt, confirm, localStorage, ni de lien.
Pour la chimie et la SVT, simule le phénomène de façon quantitative (ex : photosynthèse : intensité lumineuse et CO2 donnent le volume d'O2 dégagé ; dosage acide-base : volume versé donne le pH ; osmose : concentrations donnent le sens et le volume d'eau qui passe).
Si la demande n'est pas un sujet de sciences, mets "html" à "" et explique pourquoi dans "objectif".`,

  prof: `Tu es un professeur de TP de physique-chimie bienveillant pour des lycéens togolais.
Tu reçois : l'expérience en cours, l'état actuel de la simulation (valeurs des curseurs et mesures) et le message de l'élève.
Règles absolues :
1. Ne donne JAMAIS la réponse tant que l'élève n'a pas fait de prédiction (champ "prediction_faite").
2. Si sa prédiction est fausse, ne dis pas seulement "faux" : pose une question qui l'aide à trouver son erreur.
3. Réponds en 3 phrases maximum, en français simple, sans formules LaTeX : ta réponse sera lue à voix haute.
4. Appuie-toi uniquement sur les valeurs de la simulation fournies. N'invente aucune mesure.
5. Termine par une consigne de manipulation précise (quel curseur bouger, quoi mesurer) ou une question.
6. Pour la cinétique, rappelle si utile qu'il s'agit d'un modèle simplifié.
7. Lis la prédiction de l'élève comme une réponse à "question_posee". Si elle est juste, dis-le clairement et félicite-le avant de lui faire vérifier. Ne dis jamais qu'une prédiction juste est fausse.
Lois de référence (ne les contredis jamais) :
- Loi d'Ohm : U = R x I. À résistance constante, l'intensité est proportionnelle à la tension : si U double, I double. À tension constante, si R double, I est divisée par deux.
- Réfraction : n1 x sin(i1) = n2 x sin(i2). En passant dans un milieu plus réfringent, le rayon se rapproche de la normale. Réflexion totale possible seulement du milieu le plus réfringent vers le moins réfringent, au-delà de l'angle limite.
- Cinétique : la vitesse de réaction augmente avec la température, et le temps de demi-réaction diminue alors. Une concentration initiale plus grande augmente la vitesse initiale et la conductivité finale, mais pour cette réaction d'ordre 1 le temps de demi-réaction ne dépend pas de la concentration.`,

  rapport: `À partir de l'expérience et du tableau de mesures fourni, rédige un compte rendu de TP de niveau lycée, en français.
Structure exacte, avec ces titres en markdown (##) : Objectif, Matériel (virtuel), Protocole, Tableau de mesures, Exploitation des résultats, Conclusion.
Le tableau de mesures doit être un tableau markdown.
N'utilise QUE les mesures fournies. Si elles sont insuffisantes pour conclure (moins de 3 mesures), dis-le clairement et indique quelles mesures ajouter.
Pas de LaTeX : écris les formules en texte simple (ex : U = R x I).`
};

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ erreur: 'Méthode non autorisée' });
    return;
  }

  const cle = process.env.GEMINI_API_KEY;
  const modele = process.env.GEMINI_MODEL || 'gemini-flash-latest';
  if (!cle) {
    res.status(500).json({ erreur: 'Clé GEMINI_API_KEY absente dans les réglages Vercel' });
    return;
  }

  try {
    const { mode, texte, image, contexte } = req.body || {};
    if (!PROMPTS[mode]) {
      res.status(400).json({ erreur: 'Mode inconnu' });
      return;
    }

    // Construction du message envoyé à Gemini
    const parts = [];
    if (contexte) parts.push({ text: 'Contexte (JSON) : ' + JSON.stringify(contexte) });
    if (texte) parts.push({ text: 'Message de l\'élève : ' + String(texte).slice(0, 2000) });
    if (image) parts.push({ inline_data: { mime_type: 'image/jpeg', data: image } });
    if (parts.length === 0) parts.push({ text: '(vide)' });

    const corps = {
      system_instruction: { parts: [{ text: PROMPTS[mode] }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { temperature: mode === 'comprendre' ? 0.2 : 0.5 }
    };
    if (mode === 'comprendre' || mode === 'generer') corps.generationConfig.responseMimeType = 'application/json';
    // Génération : on coupe la « réflexion » du modèle, sinon il dépasse le temps limite
    if (mode === 'generer') {
      corps.generationConfig.temperature = 0.4;
      corps.generationConfig.maxOutputTokens = 12000;
      corps.generationConfig.thinkingConfig = { thinkingBudget: 0 };
    }

    // Si le modèle est surchargé (erreurs 429, 500, 503) ou ne répond pas
    // à temps, on passe au modèle de secours suivant.
    // La génération d'une simulation est longue : 50 s au total pour ce mode, 15 s par essai pour les autres.
    const modeles = [modele, 'gemini-flash-lite-latest', 'gemini-flash-latest'];
    const finLimite = Date.now() + (mode === 'generer' ? 50000 : 45000);
    let r = null, data = null;
    for (let i = 0; i < modeles.length; i++) {
      const reste = finLimite - Date.now();
      if (reste < 3000) break;
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modeles[i]}:generateContent`;
      try {
        r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
          body: JSON.stringify(corps),
          signal: AbortSignal.timeout(mode === 'generer' ? reste : Math.min(15000, reste))
        });
        data = await r.json();
        // Certains modèles refusent de couper la réflexion : on réessaie le même modèle sans ce réglage
        if (r.status === 400 && corps.generationConfig.thinkingConfig) {
          delete corps.generationConfig.thinkingConfig;
          i--;
          continue;
        }
        res.setHeader('x-labopoche-modele', modeles[i]);
        if (r.ok || ![429, 500, 503].includes(r.status)) break;
      } catch (e) {
        r = null; // délai dépassé : on essaie le modèle suivant
      }
    }

    if (!r) {
      res.status(504).json({ erreur: 'Gemini ne répond pas', detail: 'Les serveurs de Google sont surchargés, réessaie dans une minute.' });
      return;
    }

    if (!r.ok) {
      res.status(502).json({ erreur: 'Erreur Gemini', detail: data.error ? data.error.message : data });
      return;
    }

    const reponse = (data.candidates?.[0]?.content?.parts || [])
      .filter(p => p.text && !p.thought)
      .map(p => p.text)
      .join('')
      .trim();

    res.status(200).json({ reponse });
  } catch (e) {
    res.status(500).json({ erreur: 'Erreur serveur', detail: String(e) });
  }
};
