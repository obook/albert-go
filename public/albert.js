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
