// Client de l'API Albert via le webhook n8n : Albert ne répond pas au CORS.
'use strict';

const Albert = {
    BASE: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1',
    DELAI_MS: 120000,

    // Alias stables de l'API Albert pour la conversation (docs/MODELES.md d'albert-atelier).
    MODELES: [
        { id: 'openweight-medium', nom: 'Medium', description: 'Équilibré entre qualité et rapidité.' },
        { id: 'openweight-large', nom: 'Large', description: 'Le plus capable, pour les raisonnements longs. Plus lent.' },
        { id: 'openweight-small', nom: 'Small', description: 'Le plus rapide, pour les questions simples.' },
        { id: 'openweight-code', nom: 'Code', description: 'Spécialisé en programmation.' }
    ],

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
        return corps.choices[0].message.content;
    },

    HISTORIQUE_MAX: 30,

    // Modèle multimodal d'après docs/MODELES.md d'albert-atelier (non vérifié avec l'alias).
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
        }, annulation);
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
