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
Si aucune ne correspond, choisis "aucune".
Réponds UNIQUEMENT en JSON valide, sans texte autour :
{
  "experience": "ohm" | "refraction" | "cinetique" | "aucune",
  "titre": "titre court du TP",
  "objectif": "ce que l'élève va découvrir, en une phrase simple",
  "question_prediction": "une question qui demande à l'élève de prédire le résultat AVANT de manipuler",
  "message_si_aucune": "si aucune expérience ne correspond, explique gentiment lesquelles sont disponibles, sinon chaîne vide"
}`,

  prof: `Tu es un professeur de TP de physique-chimie bienveillant pour des lycéens togolais.
Tu reçois : l'expérience en cours, l'état actuel de la simulation (valeurs des curseurs et mesures) et le message de l'élève.
Règles absolues :
1. Ne donne JAMAIS la réponse tant que l'élève n'a pas fait de prédiction (champ "prediction_faite").
2. Si sa prédiction est fausse, ne dis pas seulement "faux" : pose une question qui l'aide à trouver son erreur.
3. Réponds en 3 phrases maximum, en français simple, sans formules LaTeX : ta réponse sera lue à voix haute.
4. Appuie-toi uniquement sur les valeurs de la simulation fournies. N'invente aucune mesure.
5. Termine par une consigne de manipulation précise (quel curseur bouger, quoi mesurer) ou une question.
6. Pour la cinétique, rappelle si utile qu'il s'agit d'un modèle simplifié.`,

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
    if (mode === 'comprendre') corps.generationConfig.responseMimeType = 'application/json';

    // Si le modèle est surchargé (erreurs 429, 500, 503), on réessaie
    // puis on passe à un modèle de secours.
    const modeles = [modele, modele, 'gemini-flash-lite-latest', 'gemini-flash-latest'];
    let r, data;
    for (let i = 0; i < modeles.length; i++) {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${modeles[i]}:generateContent`;
      r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cle },
        body: JSON.stringify(corps)
      });
      data = await r.json();
      if (r.ok || ![429, 500, 503].includes(r.status)) break;
      await new Promise(attente => setTimeout(attente, 800));
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
