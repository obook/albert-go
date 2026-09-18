// Client de l'API Albert via le webhook n8n : Albert ne répond pas au CORS.
'use strict';

const Albert = {
    BASE: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1',
    DELAI_MS: 120000,

    // Liste de secours si /v1/models ne répond pas, d'après l'annuaire BidouIAge (1er août 2026).
    // Albert peut changer le modèle derrière un alias : la liste chargée par modeles() fait foi.
    MODELES: [
        { id: 'openweight-medium', nom: 'Medium', reel: 'mistral-small-3-2-24b-instruct-2506', contexte: 128000, description: 'Équilibré entre qualité et rapidité. Accepte les images.' },
        { id: 'openweight-large', nom: 'Large', reel: 'openai/gpt-oss-120b', contexte: 131072, description: 'Le plus capable, pour les raisonnements longs. Plus lent.' },
        { id: 'openweight-small', nom: 'Small', reel: 'ministral-3-8b-instruct-2512', contexte: 262144, description: 'Le plus rapide, pour les questions simples. Accepte les images.' },
        { id: 'openweight-code', nom: 'Code', reel: 'qwen3-coder-30b-A3b-instruct', contexte: 262144, description: 'Spécialisé en programmation.' },
        { id: 'openweight-code-2', nom: 'Code 2', reel: 'deepseek-v4-flash', contexte: 393216, description: 'Programmation, contexte très long.' }
    ],

    async modeles(cle) {
        const res = await fetch(this.BASE + '/models', {
            headers: { 'Authorization': 'Bearer ' + cle },
            signal: AbortSignal.timeout(20000)
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) throw new Error(this.messageErreur(res.status, corps));
        return this.conversation((corps && corps.data) || []);
    },

    // Modèles de conversation (avec ou sans images), sans les modèles OCR ; alias openweight-* en priorité.
    // Le type est dans "type", ou dans "model_type" derrière certains proxys (albert-atelier).
    conversation(liste) {
        const ordre = this.MODELES.map(m => m.id);
        return liste
            .filter(m => ['text-generation', 'image-text-to-text'].includes(m.model_type || m.type))
            .filter(m => ![m.id, ...(m.aliases || [])].some(n => /ocr/i.test(n)))
            .map(m => {
                const alias = (m.aliases || []).find(a => a.startsWith('openweight-')) || m.id;
                const connu = this.MODELES.find(c => c.id === alias);
                const vision = (m.model_type || m.type) === 'image-text-to-text';
                return {
                    id: alias,
                    nom: connu ? connu.nom : this.nomCourt(alias),
                    reel: m.id,
                    description: connu ? connu.description : (vision ? 'Accepte les images.' : 'Modèle de conversation.'),
                    contexte: m.max_context_length || (connu && connu.contexte) || null
                };
            })
            .sort((a, b) => {
                const ia = ordre.indexOf(a.id), ib = ordre.indexOf(b.id);
                if (ia >= 0 || ib >= 0) return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
                return a.id.localeCompare(b.id);
            });
    },

    // openweight-code-2 -> Code 2
    nomCourt(alias) {
        return alias.replace(/^openweight-/, '').split('-')
            .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1)).join(' ');
    },

    async repondre(cle, requete, annulation) {
        const res = await fetch(this.BASE + '/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + cle, 'Content-Type': 'application/json' },
            body: JSON.stringify(requete),
            signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
        return { texte: corps.choices[0].message.content, usage: corps.usage || null };
    },

    // Part de la fenêtre de contexte occupée par le dernier échange, en %, ou null si inconnue.
    occupation(usage, contexte) {
        if (!usage || !contexte) return null;
        const jetons = usage.total_tokens || ((usage.prompt_tokens || 0) + (usage.completion_tokens || 0));
        return Math.min(100, Math.round(jetons / contexte * 100));
    },

    HISTORIQUE_MAX: 30,

    // Multimodal (image-text-to-text) d'après l'annuaire BidouIAge du 1er août 2026.
    MODELE_VISION: 'openweight-medium',
    CONSIGNE_IMAGE: 'Transcris fidèlement tout le texte visible dans cette image, en Markdown. '
        + 'Écris les formules en LaTeX entre $. Si l\'image contient une figure ou un schéma, '
        + 'décris-le en quelques phrases. Ne réponds rien d\'autre.',

    // Texte d'une image, obtenu du modèle de vision.
    transcrire(cle, dataUrl, annulation) {
        return this.repondre(cle, {
            model: this.MODELE_VISION,
            temperature: 0,
            messages: [{ role: 'user', content: [
                { type: 'text', text: this.CONSIGNE_IMAGE },
                { type: 'image_url', image_url: { url: dataUrl } }
            ] }]
        }, annulation).then(r => r.texte);
    },

    // Question envoyée au modèle : texte saisi suivi du contenu du fichier joint.
    joindre(question, piece) {
        if (!piece) return question;
        return (question ? question + '\n\n' : '') + 'Contenu du fichier "' + piece.nom + '" :\n\n' + piece.texte;
    },

    // Position dans l'historique des questions : -1 = saisie libre, 0 = la plus récente.
    naviguer(historique, index, sens) {
        const suivant = index + (sens === 'haut' ? 1 : -1);
        return Math.max(-1, Math.min(suivant, historique.length - 1));
    },

    // Mémoire désactivée : seule la dernière question part.
    messagesAEnvoyer(conversation, memoire) {
        return memoire ? conversation : conversation.slice(-1);
    },

    messageErreur(status, corps) {
        if (status === 401 || status === 403) {
            return 'Clé refusée par Albert. Vérifiez-la ou changez-la dans les réglages.';
        }
        if (status === 429) {
            return 'Quota atteint. Réessayez dans une minute.';
        }
        const detail = corps && (typeof corps.detail === 'string' ? corps.detail : corps.message);
        return 'Erreur ' + status + (detail ? ' : ' + String(detail).slice(0, 200) : '.');
    }
};

if (typeof module !== 'undefined') {
    module.exports = Albert;
}
