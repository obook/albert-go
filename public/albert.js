// Client de l'API Albert via le webhook n8n : Albert ne répond pas au CORS.
'use strict';

const Albert = {
    BASE: 'https://n8n.incubateur.education.gouv.fr/webhook/albert-go/v1',
    DELAI_MS: 120000,
    MODELE_DEFAUT: 'openweight-medium',

    async appeler(chemin, cle, options) {
        const res = await fetch(this.BASE + chemin, Object.assign({
            headers: { 'Authorization': 'Bearer ' + cle, 'Content-Type': 'application/json' },
            signal: AbortSignal.timeout(this.DELAI_MS)
        }, options));
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
        return corps;
    },

    async modeles(cle) {
        const corps = await this.appeler('/models', cle);
        return (corps.data || []).map(m => m.id).sort();
    },

    async repondre(cle, modele, messages) {
        const corps = await this.appeler('/chat/completions', cle, {
            method: 'POST',
            body: JSON.stringify({ model: modele, messages: messages })
        });
        return corps.choices[0].message.content;
    },

    messageErreur(status, corps) {
        if (status === 401 || status === 403) {
            return 'Clé refusée par Albert. Vérifiez-la ou changez-la.';
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
