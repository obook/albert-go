/*
 * tools/calcul/outils.js
 * Les outils locaux proposés au modèle (OUTILS_LOCAUX) : leur définition
 * pour le champ "tools" de l'API et leur exécution.
 *
 * Chargé après les autres fichiers de tools/calcul/ : chaque outil appelle
 * Calcul, Formel, Calendrier, Compteur, Tirage, Facteurs ou Statistiques.
 * Utilisé par tools/recherche/outils-modele.js et par les réglages.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/**
 * Définition d'un outil pour le champ "tools" de l'API.
 *
 * @param {string} nom - Nom de l'outil, préfixe de ses textes dans langues/*.js.
 * @param {Object} proprietes - { paramètre: type JSON Schema }.
 * @param {string[]} requis - Paramètres obligatoires.
 * @returns {Object} Entrée du champ tools.
 */
function definirOutil(nom, proprietes, requis) {
    const properties = {};
    for (const [cle, schema] of Object.entries(proprietes)) {
        properties[cle] = { ...schema, description: t(nom + '.' + cle) };
    }
    return {
        type: 'function',
        function: { name: nom, description: t(nom + '.description'), parameters: { type: 'object', properties, required: requis } }
    };
}

/** Nombre au format de la langue, sans séparateur de milliers. */
const formaterNombre = (v, langue) => v.toLocaleString(langue, { maximumSignificantDigits: Calcul.CHIFFRES, useGrouping: false });

/* Le nom sert de réglage, de clé de stockage et de préfixe i18n. */
const OUTILS_LOCAUX = {
    /* Une expression math.js ; ou des entiers à décomposer avec leur PGCD et
       leur PPCM, que math.js ne décompose pas ; ou une série statistique,
       aux conventions du lycée que math.js ne suit pas (écart-type sur n,
       quartiles pris dans la série) ; ou une commande de calcul formel,
       passée à Giac. */
    calcul: {
        icone: 'calculatrice',
        outil: () => definirOutil('calcul', {
            expression: { type: 'string' },
            nombres: { type: 'array', items: { type: 'integer' } },
            valeurs: { type: 'array', items: { type: 'number' } },
            coefficients: { type: 'array', items: { type: 'number' } },
            derivee: { type: 'string' },
            formel: { type: 'string' }
        }, []),
        executer: async (a, langue) => {
            if (Array.isArray(a.nombres) && a.nombres.length) {
                return Facteurs.decrire(a.nombres.map(Number));
            }
            if (Array.isArray(a.valeurs) && a.valeurs.length && Array.isArray(a.coefficients) && a.coefficients.length) {
                const { moyenne, total } = Statistiques.ponderer(a.valeurs, a.coefficients);
                return t('calcul.ponderee', { moyenne: formaterNombre(moyenne, langue), total: formaterNombre(total, langue) });
            }
            if (a.formel) {
                try {
                    if (Formel.TABLEAU.test(a.formel)) {
                        const sortie = await Formel.sortieTableau(a.formel);
                        return t('calcul.tableau', { lecture: Formel.lecture(sortie), tableau: Formel.tableau(sortie) });
                    }
                    return a.formel + ' : ' + await Formel.calculer(a.formel);
                } catch (err) {
                    /* Trop long ou moteur absent : rendu comme résultat, l'appelant ne connaît que calcul.invalide. */
                    if (err.message === t('calcul.invalide')) {
                        throw err;
                    }
                    return err.message;
                }
            }
            if (a.derivee) {
                await Calcul.charger();
                return 'd/dx (' + a.derivee + ') = ' + Calcul.deriver(a.derivee);
            }
            if (Array.isArray(a.valeurs) && a.valeurs.length) {
                const f = {};
                for (const [cle, v] of Object.entries(Statistiques.calculer(a.valeurs))) {
                    f[cle] = formaterNombre(v, langue);
                }
                return t('calcul.statistiques', f);
            }
            await Calcul.charger();
            let resultat;
            try {
                resultat = Calcul.evaluer(a.expression);
            } catch (err) {
                /* Les modèles moyens écrivent souvent la commande Xcas dans expression (mesuré le 13/10/2026). */
                if (Formel.COMMANDE.test(a.expression)) {
                    return OUTILS_LOCAUX.calcul.executer({ formel: a.expression }, langue);
                }
                throw err;
            }
            return a.expression + ' = ' + (typeof resultat === 'number'
                ? resultat.toLocaleString(langue, { maximumSignificantDigits: Calcul.CHIFFRES, useGrouping: false })
                : resultat);
        }
    },
    tirage: {
        icone: 'de',
        outil: () => definirOutil('tirage', {
            elements: { type: 'array', items: { type: 'string' } },
            groupes: { type: 'integer' },
            nombre: { type: 'integer' }
        }, ['elements']),
        executer: (a) => {
            const elements = (a.elements || []).map(String).filter(Boolean);
            if (!elements.length) {
                throw new Error(t('tirage.invalide'));
            }
            if (a.groupes > 1) {
                return Tirage.repartir(elements, Math.min(a.groupes, elements.length))
                    .map((g, i) => t('tirage.groupe', { numero: i + 1, membres: g.join(', ') })).join(' ; ');
            }
            const ordre = Tirage.melanger(elements);
            /* Sans nombre, le premier tiré est nommé : le modèle oublie souvent
               nombre pour "un nom parmi", et répondait par toute la liste. */
            return a.nombre > 0
                ? t('tirage.tires', { liste: ordre.slice(0, a.nombre).join(', ') })
                : t('tirage.ordre', { liste: ordre.join(', '), premier: ordre[0] });
        }
    },
    calendrier: {
        icone: 'calendrier',
        outil: () => definirOutil('calendrier', {
            date: { type: 'string' }, jours: { type: 'integer' }, mois: { type: 'integer' }, report: { type: 'boolean' },
            heures: { type: 'number' }, fin: { type: 'string' },
            ouvres: { type: 'boolean' }, feries: { type: 'integer' }, alsace_moselle: { type: 'boolean' }
        }, []),
        executer: (a, langue) => Calendrier.repondre(a, langue)
    },
    compteur: {
        icone: 'compteur',
        outil: () => definirOutil('compteur', {
            texte: { type: 'string' }, lettre: { type: 'string' }, epeler: { type: 'boolean' },
            anagramme: { type: 'string' }, lisibilite: { type: 'boolean' }
        }, ['texte']),
        executer: (a, langue) => {
            const compte = Compteur.compter(a.texte);
            const lignes = [t('compteur.resultat', {
                ...compte,
                motMots: tn('compteur.mots', compte.mots),
                motCaracteres: tn('compteur.caracteres', compte.caracteres)
            })];
            if (a.lettre) {
                lignes.push(t('compteur.occurrences', { lettre: String(a.lettre).trim(), nombre: Compteur.occurrences(a.texte, a.lettre) }));
            }
            if (a.epeler) {
                lignes.push(t('compteur.epele', Compteur.epeler(a.texte)));
            }
            if (a.anagramme) {
                const [un, deux] = [Compteur.trier(a.texte), Compteur.trier(a.anagramme)];
                lignes.push(t(un === deux ? 'compteur.anagramme-oui' : 'compteur.anagramme-non', { un: un, deux: deux }));
            }
            if (a.lisibilite) {
                const mesures = Compteur.lisibilite(a.texte);
                lignes.push(t('compteur.mesures', {
                    ...mesures,
                    moyenne: mesures.moyenne.toLocaleString(langue, { maximumFractionDigits: 1 }),
                    seuilPhrase: Compteur.PHRASE_LONGUE,
                    seuilMot: Compteur.MOT_LONG
                }));
            }
            return lignes.join(' ');
        }
    }
    /* Contrôle SIRET et IBAN, retiré le 2026-10-11.
    , controle: {
        icone: 'controle',
        outil: () => definirOutil('controle', { numero: { type: 'string' } }, ['numero']),
        executer: (a) => {
            const { type, valide } = Controle.verifier(a.numero);
            return t(valide ? 'controle.valide' : 'controle.faux', { type: type, numero: String(a.numero).trim() });
        }
    }
    */
};

/* Export pour les tests Node ; ignoré dans le navigateur. */
if (typeof module !== 'undefined') {
    module.exports = { OUTILS_LOCAUX, definirOutil };
}
