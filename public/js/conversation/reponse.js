/*
 * reponse.js
 * Bulles des réponses d'Albert, avec leurs boutons Copier et Lire.
 *
 * Avec Reformuler, chaque variante ("### Plus courte"...) a sa propre bulle
 * et son propre bouton Copier. Appelé par ajouter (affichage.js).
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

/* Dévoilement d'une réponse : durée totale et intervalle entre deux tranches. */
const DUREE_DEVOILEMENT = 600, INTERVALLE_DEVOILEMENT = 25;

/**
 * Crée un petit bouton d'icône sous une réponse.
 *
 * @param {string} icone - SVG pris dans ICONES.
 * @param {string} libelle - Texte lu par les lecteurs d'écran et info-bulle.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonAction(icone, libelle) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'bouton-action';
    bouton.innerHTML = icone;
    bouton.setAttribute('aria-label', libelle);
    bouton.title = libelle;
    return bouton;
}

/**
 * Crée un bouton de copie, par défaut "Copier la réponse".
 *
 * @param {string|function(): string} texte - Texte brut à copier, ou qui le donne au moment du clic.
 * @param {string} [libelle] - Libellé du bouton.
 * @param {string} [message] - Toast affiché après la copie.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonCopier(texte, libelle = t('reponse.copier'), message = t('toast.reponse-copiee')) {
    const bouton = boutonAction(ICONES.copier, libelle);
    bouton.addEventListener('click', () => {
        navigator.clipboard.writeText(typeof texte === 'function' ? texte() : texte).then(() => {
            bouton.innerHTML = ICONES.copie;
            toast(message);
            setTimeout(() => {
                bouton.innerHTML = ICONES.copier;
            }, 1500);
        /* Refusée en navigation privée ou hors HTTPS : sans ce toast, rien ne le dit. */
        }).catch(() => toast(t('toast.copie-refusee')));
    });
    return bouton;
}

/**
 * Crée le bouton qui montre les recherches faites pour une réponse.
 *
 * Sa seule présence dit que le modèle a cherché : sans lui, il a répondu
 * de mémoire. Le clic déplie les mots cherchés et les pages consultées.
 *
 * @param {HTMLElement} note - Ligne grise des recherches, repliée au départ.
 * @param {Array<Object>} recherches - Recherches { mots, moteur, sources } de cette réponse.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonRecherches(note, recherches) {
    /* Le moteur de la réponse, pas celui réglé depuis : une conversation
       rouverte doit citer la source qui a servi. Avant, rien ne le notait. */
    const choisis = ((recherches.find(r => r && r.moteur) || {}).moteur || reglages.fournisseurs.join(',')).split(',')
        .map(id => Recherche.MOTEURS[id] || Services.TABLE[id]).filter(Boolean);
    const moteurs = choisis.length ? choisis : [Recherche.MOTEURS.wikipedia];
    /* Le bouton dit où on a cherché : W pour des wikis seuls, globe pour le reste. */
    const bouton = boutonAction(moteurs.every(m => m.wiki) ? ICONES.wikipedia : ICONES.globe,
        t('reponse.recherches', { nom: moteurs.map(m => m.nom).join(', ') }));
    bouton.setAttribute('aria-expanded', 'false');
    bouton.addEventListener('click', () => {
        note.hidden = !note.hidden;
        bouton.setAttribute('aria-expanded', String(!note.hidden));
    });
    return bouton;
}

/**
 * Dit si un numéro de passage cité désigne un passage connu.
 *
 * @param {number} numero - Numéro écrit dans la réponse, 12 pour [P12].
 * @param {Object[]} passages - Passages de Albert.passagesSources.
 * @returns {boolean} true si le passage existe.
 */
function numeroConnu(numero, passages) {
    return numero >= 1 && numero <= passages.length;
}

/**
 * Texte à garder tel quel pour un morceau de Albert.morceauxCitations : le texte lui-même,
 * ou "P12" écrit sans crochets avec un numéro inconnu (un point P2 d'un plan, pas une citation).
 *
 * @param {string|{plages: number[][], crochets: boolean}} m - Morceau de Albert.morceauxCitations.
 * @param {Object[]} passages - Passages de Albert.passagesSources.
 * @returns {?string} Texte à garder, ou null si le morceau est une citation à traiter.
 */
function texteHorsCitation(m, passages) {
    if (typeof m === 'string') {
        return m;
    }
    const premier = m.plages[0][0];
    if (!m.crochets && !numeroConnu(premier, passages)) {
        return 'P' + premier;
    }
    return null;
}

/**
 * Remplace les numéros de passages cités ([P12], P12) par des boutons qui montrent le passage.
 * Le bouton donne la page, (p. 8), ou le numéro pour une source sans pages ; les crochets deviennent des parenthèses.
 * Entre crochets, un numéro qui ne désigne aucun passage est retiré ; seul, il reste du texte (un point P2).
 * Sans les passages (source supprimée), rien ne change.
 *
 * @param {HTMLElement} contenu - Réponse rendue.
 * @param {Object[]} passages - Passages de Albert.passagesSources, ou [] si une source manque.
 * @param {HTMLElement} note - Ligne grise sous la réponse, qui reçoit le passage.
 */
function lierCitations(contenu, passages, note) {
    if (!passages.length) {
        return;
    }
    const marcheur = document.createTreeWalker(contenu, NodeFilter.SHOW_TEXT, {
        acceptNode: (n) => (n.parentElement.closest('pre, code, .katex') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT)
    });
    const noeuds = [];
    for (let n = marcheur.nextNode(); n; n = marcheur.nextNode()) {
        if (/P\d/.test(n.data)) {
            noeuds.push(n);
        }
    }
    for (const noeud of noeuds) {
        const sortie = [];
        for (const m of Albert.morceauxCitations(noeud.data)) {
            const texte = texteHorsCitation(m, passages);
            if (texte !== null) {
                sortie.push(texte);
                continue;
            }
            const parties = partiesCitation(m, passages);
            if (!parties) {
                continue;
            }
            /* L'espace qui précède va dans le groupe : citations masquées, il ne reste pas "croûte ." */
            const groupe = document.createElement('span');
            groupe.className = 'citations';
            const avant = typeof sortie[sortie.length - 1] === 'string' ? sortie.pop() : '';
            sortie.push(avant.replace(/\s+$/, ''));
            groupe.append(avant.slice(avant.replace(/\s+$/, '').length),
                ...parties.map(p => (typeof p === 'string' ? p : boutonCitation(p, note))));
            sortie.push(groupe);
        }
        noeud.replaceWith(...sortie.filter(s => s !== ''));
    }
}

/**
 * Texte d'une réponse à copier : citations écrites comme à l'écran, (p. 8), ou retirées si elles sont masquées.
 *
 * @param {string} texte - Réponse en Markdown.
 * @param {Object[]} passages - Passages de Albert.passagesSources, ou [] si une source manque.
 * @returns {string} Texte à copier.
 */
function texteCitations(texte, passages) {
    if (!passages.length) {
        return texte;
    }
    const visibles = document.documentElement.classList.contains('citations-visibles');
    return Albert.morceauxCitations(texte).map((m) => {
        const tel = texteHorsCitation(m, passages);
        if (tel !== null) {
            return tel;
        }
        const parties = partiesCitation(m, passages);
        return parties && visibles ? parties.map(p => (typeof p === 'string' ? p : p.libelle)).join('') : '\0';
    }).join('').replace(/[ \t]*\0/g, '');
}

/**
 * Ce qu'affiche une citation : (p. 8, p. 12), ou avec plusieurs sources (Programme, p. 8 ; Attendus, p. 3).
 *
 * @param {{plages: number[][], crochets: boolean}} m - Citation de Albert.morceauxCitations.
 * @param {Object[]} passages - Passages de Albert.passagesSources.
 * @returns {?Array<string|Object>} Texte et mentions de mentionsCitees, ou null si aucun numéro n'est connu.
 */
function partiesCitation(m, passages) {
    const connus = (plage) => plage.filter((n) => numeroConnu(n, passages));
    const mentions = mentionsCitees(m.plages.map(plage => connus(plage).map(n => passages[n - 1])).filter(plage => plage.length));
    if (!mentions.length) {
        return null;
    }
    const liste = (ms) => ms.flatMap((mention, i) => (i ? [', ', mention] : [mention]));
    let parties = liste(mentions);
    if (new Set(passages.map(p => p.nom)).size > 1) {
        /* Sans Map.groupBy : absent du Safari des iPad pas à jour. */
        const parNom = mentions.reduce((carte, mention) => carte.set(mention.nom, [...(carte.get(mention.nom) || []), mention]), new Map());
        parties = [...parNom].flatMap(([nom, ms], i) => (i ? [t('reponse.entre-sources')] : []).concat(nomCourt(nom) + ', ', liste(ms)));
    }
    return m.crochets ? ['(', ...parties, ')'] : parties;
}

/**
 * Libellé de chaque numéro ou plage cité : la page, ou le numéro de passage pour une source sans pages.
 * Deux passages de la même page donnent une seule mention, qui les ouvre tous les deux.
 *
 * @param {Object[][]} plages - Passages connus de chaque numéro ou plage, dans l'ordre.
 * @returns {{libelle: string, nom: string, passages: Object[]}[]} Mentions à afficher.
 */
function mentionsCitees(plages) {
    const mentions = new Map();
    for (const plage of plages) {
        const premier = plage[0];
        const dernier = plage[plage.length - 1];
        let libelle;
        if (premier.avecPages && dernier.avecPages && premier.nom === dernier.nom) {
            libelle = premier.page === dernier.page ? t('reponse.page', { page: premier.page })
                : t('reponse.pages', { debut: premier.page, fin: dernier.page });
        } else {
            libelle = plage.length === 1 ? 'P' + premier.n : t('reponse.passages', { debut: premier.n, fin: dernier.n });
        }
        const cle = premier.nom + '\n' + libelle;
        const mention = mentions.get(cle) || { libelle, nom: premier.nom, passages: [] };
        mention.passages.push(...plage.filter(p => !mention.passages.includes(p)));
        mentions.set(cle, mention);
    }
    return [...mentions.values()];
}

/**
 * Bouton d'une mention citée : il montre ses passages sous la réponse, puis les cache.
 *
 * @param {{libelle: string, passages: Object[]}} mention - Mention de mentionsCitees.
 * @param {HTMLElement} note - Ligne grise sous la réponse.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonCitation(mention, note) {
    const bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.className = 'citation';
    bouton.textContent = mention.libelle;
    const numeros = mention.passages.map(p => 'P' + p.n);
    bouton.setAttribute('aria-label', numeros.length > 1 ? t('reponse.citations', { liste: numeros.join(', ') })
        : t('reponse.citation', { n: mention.passages[0].n }));
    bouton.setAttribute('aria-expanded', 'false');
    bouton.addEventListener('click', () => {
        const ouvert = !note.hidden && note.dataset.passage === numeros.join(',');
        for (const autre of note.closest('.carte').querySelectorAll('.citation')) {
            autre.setAttribute('aria-expanded', 'false');
        }
        note.hidden = ouvert;
        note.dataset.passage = numeros.join(',');
        note.textContent = mention.passages.map((passage) => {
            const titre = passage.avecPages ? t('reponse.passage-page', { n: passage.n, nom: passage.nom, page: passage.page })
                : t('reponse.passage', { n: passage.n, nom: passage.nom });
            return [titre, passage.chemin, passage.texte].filter(Boolean).join('\n');
        }).join('\n\n');
        bouton.setAttribute('aria-expanded', String(!ouvert));
    });
    return bouton;
}

/**
 * Crée le bouton qui déplie la trace d'un outil.
 *
 * @param {HTMLElement} note - Ligne grise de la trace, repliée au départ.
 * @param {string} icone - SVG pris dans ICONES.
 * @param {string} libelle - Libellé du bouton.
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonTrace(note, icone, libelle) {
    const bouton = boutonAction(icone, libelle);
    bouton.setAttribute('aria-expanded', 'false');
    bouton.addEventListener('click', () => {
        note.hidden = !note.hidden;
        bouton.setAttribute('aria-expanded', String(!note.hidden));
    });
    return bouton;
}

/**
 * Nom d'une langue en minuscules à partir de son code : "ru" donne "russe".
 *
 * @param {string} code - Code de langue.
 * @returns {string} Nom de la langue, ou le code s'il est inconnu.
 */
function nomLangue(code) {
    return I18n.existe('langue.' + code) ? t('langue.' + code).toLowerCase() : code;
}

/**
 * Crée le bouton "Lire à voix haute".
 *
 * @param {HTMLElement} contenu - Réponse affichée à lire.
 * @param {string} langue - Code de la langue de la réponse ("fr", "ru"...).
 * @returns {HTMLButtonElement} Le bouton.
 */
function boutonLire(contenu, langue) {
    const bouton = boutonAction(ICONES.lire, t('reponse.lire'));
    bouton.addEventListener('click', async () => {
        await Lecture.voixPretes();
        if (!Lecture.disponible(langue)) {
            const nom = nomLangue(langue);
            toast(t(Lecture.enLigne ? 'toast.voix-absente-en-ligne' : 'toast.voix-absente', { langue: nom }));
            return;
        }
        Lecture.basculer(bouton, contenu, langue);
    });
    bouton.addEventListener('lecture-debut', () => {
        bouton.innerHTML = ICONES.arreter;
        bouton.setAttribute('aria-label', t('reponse.arreter-lecture'));
    });
    bouton.addEventListener('lecture-fin', () => {
        bouton.innerHTML = ICONES.lire;
        bouton.setAttribute('aria-label', t('reponse.lire'));
    });
    return bouton;
}

/**
 * Crée la ligne grise placée sous une réponse : mots cherchés, puis sources.
 *
 * Les adresses viennent du moteur, donc d'un tiers : elles passent par le même
 * contrôle que les liens d'une réponse avant de devenir cliquables.
 *
 * @param {Array<Object>} recherches - Recherches { mots, moteur, sources }.
 * @returns {HTMLParagraphElement} La ligne.
 */
function elementRecherches(recherches) {
    /* Les conversations enregistrées avant les sources n'ont que les mots. */
    const faites = recherches.map(r => (typeof r === 'string' ? { mots: r, sources: [] } : r));
    const note = document.createElement('p');
    note.className = 'note recherches';
    note.textContent = t('reponse.note-recherche', { mots: faites.map(r => r.mots).join(' ; ') });
    const sources = [];
    for (const recherche of faites) {
        for (const source of (recherche.sources || [])) {
            /* Deux recherches ramènent souvent la même page. */
            if (!Rendu.urlDangereuse('href', source.url) && !sources.some(s => s.url === source.url)) {
                sources.push(source);
            }
        }
    }
    if (sources.length) {
        const ligne = document.createElement('span');
        ligne.className = 'sources';
        ligne.append(t('reponse.sources'));
        for (const source of sources) {
            const lien = document.createElement('a');
            lien.href = source.url;
            lien.target = '_blank';
            lien.rel = 'noopener noreferrer';
            /* Le numéro est celui cité dans la réponse. Les conversations
               enregistrées avant la numérotation n'en ont pas. */
            lien.textContent = (source.numero ? '[' + source.numero + '] ' : '') + (source.titre || source.url);
            ligne.append(lien);
        }
        note.append(ligne);
    }
    return note;
}

/**
 * Crée la pastille "IA" d'une réponse, lue seulement par les lecteurs d'écran.
 *
 * @returns {HTMLSpanElement} La pastille.
 */
function pastilleIA() {
    const pastille = document.createElement('span');
    pastille.className = 'visuellement-cache';
    pastille.textContent = 'IA';
    return pastille;
}

/**
 * Fait défiler le fil jusqu'à la bulle d'un élément.
 *
 * "nearest" montre le bas de la bulle tant qu'elle tient à l'écran, puis
 * garde son début en haut : "end" cachait le début d'une longue réponse.
 * Imprimerie : le début du document se cale en haut.
 *
 * @param {HTMLElement} element - Élément de la bulle, ou la bulle elle-même.
 */
function suivreBulle(element) {
    element.closest('li')?.scrollIntoView({ block: Albert.OUTILS[outilActuel].documents ? 'start' : 'nearest' });
}

/**
 * Dévoile le texte d'une réponse par tranches, puis affiche le rendu.
 *
 * Albert renvoie tout d'un bloc : seul l'affichage est étalé. La coupe
 * suit le temps écoulé, car un onglet en arrière-plan bride setTimeout à
 * une seconde. `aria-busy` évite au lecteur d'écran de relire à chaque pas.
 * Le fil suit la bulle qui grandit, sans jamais cacher son début.
 *
 * @param {HTMLElement} element - Conteneur de la réponse.
 * @param {string} texte - Réponse en Markdown.
 * @param {boolean} images - true si la réponse a cherché des images Commons.
 * @returns {Promise<void>} Terminée après le rendu final.
 */
async function devoiler(element, texte, images) {
    if (texte.length < 40 || matchMedia('(prefers-reduced-motion: reduce)').matches) {
        return Rendu.afficher(element, texte, images);
    }
    element.setAttribute('aria-busy', 'true');
    let part = 0, debut = performance.now();
    while (part < 1) {
        element.textContent = texte.slice(0, Math.ceil(texte.length * part));
        suivreBulle(element);
        await new Promise(resoudre => setTimeout(resoudre, INTERVALLE_DEVOILEMENT));
        part = (performance.now() - debut) / DUREE_DEVOILEMENT;
    }
    await Rendu.afficher(element, texte, images);
    suivreBulle(element);
    element.removeAttribute('aria-busy');
}

/**
 * Menu qui enregistre une réponse : .docx, .odt, puis PDF par l'impression du navigateur.
 *
 * Un seul bouton à la place de trois : la barre tient sur une ligne de téléphone.
 *
 * @param {function(): (HTMLElement|Promise<HTMLElement>)} lire - Donne le contenu à enregistrer, une fois prêt.
 * @param {function(): string} sujet - Donne le sujet, pour nommer le fichier.
 * @returns {HTMLDetailsElement[]} Le menu, seul dans un tableau.
 */
function boutonsExport(lire, sujet) {
    const menu = document.createElement('details');
    menu.className = 'menu-export';
    const ouvrir = document.createElement('summary');
    ouvrir.className = 'bouton-action';
    ouvrir.innerHTML = ICONES.telecharger;
    ouvrir.setAttribute('aria-label', t('reponse.exporter'));
    ouvrir.title = t('reponse.exporter');
    const choix = document.createElement('div');
    choix.className = 'menu-export-choix';
    /**
     * Bouton du menu d'export : icône du format, libellé, et action qui referme le menu.
     *
     * @param {string} format - Clé de ICONES : docx, odt ou pdf.
     * @param {string} libelle - Clé de traduction du libellé.
     * @param {function(HTMLButtonElement): void} action - Appelée au clic, avec le bouton.
     * @returns {HTMLButtonElement} Le bouton.
     */
    const item = (format, libelle, action) => {
        const bouton = document.createElement('button');
        bouton.type = 'button';
        bouton.innerHTML = ICONES[format];
        bouton.append(t(libelle));
        bouton.addEventListener('click', () => {
            menu.open = false;
            action(bouton);
        });
        return bouton;
    };
    choix.append(...['docx', 'odt'].map((format) => item(format, 'reponse.telecharger-' + format, (bouton) => Rendu.telechargerAvecAttente(bouton,
        /* Imprimerie : document sans gras, à l'export comme à l'écran. */
        async () => Rendu[format](await lire(), !!Albert.OUTILS[outilActuel].documents), Rendu.nomFigure(new Date(), format, sujet())))),
    item('pdf', 'reponse.imprimer-pdf', async () => imprimer(await lire(), sujet())));
    menu.append(ouvrir, choix);
    return [menu];
}

/* Un clic ailleurs referme le menu d'export ouvert. */
document.addEventListener('click', (e) => {
    for (const menu of document.querySelectorAll('.menu-export[open]')) {
        if (!menu.contains(e.target)) {
            menu.open = false;
        }
    }
});

/* Attente de beforeprint après print() : sans lui, le navigateur n'a pas ouvert l'impression. */
const IMPRESSION_ATTENTE_MS = 1000;

/* Attributs qui listent des identifiants séparés par des espaces, sans "#". */
const LISTES_IDENTIFIANTS = ['aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-owns'];

/**
 * Préfixe chaque identifiant d'un bloc et les renvois qui le visent : "#nom" dans les
 * attributs (href, url(#nom) des flèches) et dans les <style> des schémas, listes aria-*.
 * Le texte du bloc ne change pas, même s'il contient le nom d'un identifiant.
 *
 * @param {HTMLElement} racine - Bloc à modifier, lui compris.
 * @param {string} prefixe - Préfixe ajouté, par exemple "impression-".
 */
function renommerIdentifiants(racine, prefixe) {
    const elements = [racine, ...racine.querySelectorAll('*')];
    const noms = new Set(elements.filter((element) => element.id).map((element) => element.id));
    if (noms.size === 0) {
        return;
    }
    const echappes = [...noms].map((nom) => nom.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    /* "#nom" seul : pas suivi d'un caractère qui prolongerait un autre identifiant. */
    const renvoi = new RegExp('#(' + echappes.join('|') + ')(?![\\w-])', 'g');
    for (const element of elements) {
        for (const attribut of [...element.attributes]) {
            if (attribut.name === 'id') {
                attribut.value = prefixe + attribut.value;
            } else if (LISTES_IDENTIFIANTS.includes(attribut.name)) {
                const liste = attribut.value.split(/\s+/);
                attribut.value = liste.map((nom) => (noms.has(nom) ? prefixe + nom : nom)).join(' ');
            } else if (attribut.value.includes('#')) {
                attribut.value = attribut.value.replace(renvoi, '#' + prefixe + '$1');
            }
        }
        if (element.localName === 'style') {
            element.textContent = element.textContent.replace(renvoi, '#' + prefixe + '$1');
        }
    }
}

/**
 * Imprime une réponse seule, pour l'enregistrer en PDF : sa copie va dans
 * #impression, seule partie de la page que garde la feuille d'impression (base.css).
 * Le rendu est celui de l'écran : formules, schémas et code colorisé compris.
 *
 * @param {HTMLElement} contenu - Réponse affichée.
 * @param {string} sujet - Sujet, pour nommer le fichier PDF proposé.
 */
function imprimer(contenu, sujet) {
    const copie = contenu.cloneNode(true);
    /* Identifiants propres à la copie : les flèches d'un schéma visent un identifiant, et
       la copie, qui reste dans la page, ne doit pas prendre celles de l'original. */
    /* Retiré le 21/11/2026 : le remplacement touchait aussi le texte ("intro" devenait "impression-intro").
    let html = copie.innerHTML;
    for (const { id } of copie.querySelectorAll('[id]')) {
        html = html.split(id).join('impression-' + id);
    }
    copie.innerHTML = html;
    */
    renommerIdentifiants(copie, 'impression-');
    /* Gardée jusqu'à la prochaine impression : sur iPad, afterprint arrive avant que le PDF
       soit dessiné, et vider la copie donnait une page blanche. */
    $('impression').replaceChildren(copie);
    /* Le navigateur nomme le PDF d'après le titre de la page ; il revient au geste suivant. */
    const titre = document.title;
    document.title = Rendu.nomFigure(new Date(), 'pdf', sujet).replace(/\.pdf$/, '');
    const remettre = () => {
        document.title = titre;
        document.removeEventListener('pointerdown', remettre, true);
        document.removeEventListener('keydown', remettre, true);
    };
    document.addEventListener('pointerdown', remettre, true);
    document.addEventListener('keydown', remettre, true);
    /* Brave sur iPad ignore print() sans rien dire : sans beforeprint dans la seconde, on le signale. */
    let ouverte = false;
    const ouvrir = () => {
        ouverte = true;
    };
    window.addEventListener('beforeprint', ouvrir, { once: true });
    window.print();
    setTimeout(() => {
        window.removeEventListener('beforeprint', ouvrir);
        if (!ouverte) {
            toast(t('toast.impression-impossible'));
        }
    }, IMPRESSION_ATTENTE_MS);
}

/**
 * Crée la bulle d'une réponse, ou d'une variante si un titre est donné.
 *
 * @param {string} texte - Texte en Markdown.
 * @param {?string} titre - Titre de la variante ("Plus courte"...), ou null.
 * @param {string} langue - Code de la langue, pour la lecture à voix haute.
 * @param {boolean} [animer] - true pour dévoiler le texte au lieu de l'afficher d'un coup.
 * @param {Array<Object>} [recherches] - Recherches { mots, moteur, sources } faites pour cette réponse.
 * @returns {HTMLLIElement} La bulle, pas encore ajoutée au fil.
 */
function bulleReponse(texte, titre, langue, animer = false, recherches = null) {
    const li = document.createElement('li');
    li.className = 'assistant';
    const carte = document.createElement('div');
    carte.className = 'carte';
    if (titre) {
        const entete = document.createElement('p');
        entete.className = 'titre-variante';
        entete.textContent = titre;
        carte.append(entete);
    }
    const contenu = document.createElement('div');
    contenu.className = 'texte rendu';
    /* Images Commons montrées si cette réponse a eu Internet (globe activé) : outil d'images, recherche
       ou service de l'État. Le modèle écrit parfois le lien d'une photo sans l'outil d'images, quand
       une recherche qui ne trouve pas a pris tous ses tours. */
    const imagesCherchees = (recherches || []).some(r => r && (r.image_commons || 'mots' in r));
    /* Imprimerie : pas de Markdown brut dévoilé, le document arrive rendu et monte en fondu (conversation.css). */
    const projet = !!Albert.OUTILS[outilActuel].documents;
    const pret = animer && !projet ? devoiler(contenu, texte, imagesCherchees) : Rendu.afficher(contenu, texte, imagesCherchees);
    if (projet) {
        /* Formules et figures rendues, la hauteur est connue : le début se cale en haut. */
        pret.then(() => suivreBulle(li));
    }

    const actions = document.createElement('div');
    actions.className = 'actions-reponse';
    /* Passages des sources citées, pour copier les citations comme à l'écran. */
    let passages = [];
    actions.append(boutonCopier(() => texteCitations(texte, passages)));
    if (typeof speechSynthesis !== 'undefined') {
        actions.append(boutonLire(contenu, langue));
    }
    carte.append(contenu);
    /* Discussion : les numéros de passages cités s'ouvrent sous la réponse. Une source supprimée laisse les numéros en texte. */
    const cites = (recherches || []).find(r => r && r.passages);
    if (cites) {
        const note = document.createElement('p');
        note.className = 'note calculs passage';
        note.hidden = true;
        carte.append(note);
        const documents = cites.passages.map(nom => bibliotheque.find(d => d.nom === nom));
        passages = documents.every(Boolean) ? Albert.passagesSources(documents) : [];
        pret.then(() => lierCitations(contenu, passages, note));
    }
    /* Une icône par outil local qui a servi. */
    for (const [nom, local] of Object.entries(OUTILS_LOCAUX)) {
        const lignes = (recherches || []).filter(r => r && r[nom]).map(r => (nom === 'calcul' ? Albert.traceCalcul(r[nom]) : r[nom]));
        if (lignes.length) {
            const note = document.createElement('p');
            note.className = 'note calculs';
            note.textContent = t('reponse.note-' + nom, { lignes: lignes.join(' ; ') });
            note.hidden = true;
            carte.append(note);
            actions.append(boutonTrace(note, ICONES[local.icone], t('reponse.' + nom)));
        }
    }
    const images = (recherches || []).filter(r => r && r.image_commons).map(r => r.image_commons);
    if (images.length) {
        const note = document.createElement('p');
        note.className = 'note calculs';
        note.textContent = t('reponse.note-images', { lignes: images.join(' ; ') });
        note.hidden = true;
        carte.append(note);
        actions.append(boutonTrace(note, ICONES.image, t('reponse.images')));
    }
    const sources = (recherches || []).filter(r => r && r.bibliotheque).map(r => r.bibliotheque);
    if (sources.length) {
        const note = document.createElement('p');
        note.className = 'note calculs';
        note.textContent = t('reponse.note-bibliotheque', { lignes: sources.join(' ; ') });
        note.hidden = true;
        carte.append(note);
        actions.append(boutonTrace(note, ICONES.bibliotheque, t('reponse.bibliotheque')));
    }
    const cherchees = (recherches || []).filter(r => r && !r.image_commons && !r.bibliotheque && !r.mesure
        && !Object.keys(OUTILS_LOCAUX).some(nom => r[nom]));
    if (cherchees.length) {
        const note = elementRecherches(cherchees);
        note.hidden = true;
        carte.append(note);
        actions.append(boutonRecherches(note, cherchees));
    }
    /* Jetons et durées de la réponse (chronometre.js), dépliés au clic. */
    const mesuree = (recherches || []).find(r => r && r.mesure);
    if (mesuree) {
        const { note, bouton } = traceMesure(mesuree.mesure);
        carte.append(note);
        actions.append(bouton);
    }
    /* Discussion et Imprimerie : la réponse peut rejoindre la bibliothèque, comme une source. */
    if (Albert.OUTILS[outilActuel].sources) {
        const garder = boutonAction(ICONES.note, t('reponse.vers-bibliotheque'));
        garder.addEventListener('click', () => ajouterNote(texte, Rendu.questionAvant(contenu)));
        actions.append(garder);
    }
    /* Exports toujours en dernier. Le clic attend la fin du rendu : avant, formules et figures manquent. */
    actions.append(...boutonsExport(() => pret.then(() => contenu), () => Rendu.questionAvant(contenu) || 'reponse'));
    carte.append(actions);
    li.append(pastilleIA(), carte);
    return li;
}

/**
 * Ajoute une réponse au fil : une bulle, ou une par variante avec Reformuler.
 *
 * @param {string} texte - Réponse du modèle.
 * @param {string} [langue] - Code de la langue de la réponse ; français par défaut.
 * @param {boolean} [animer] - true pour une réponse qui vient d'arriver ; false à la relecture.
 * @param {Array<Object>} [recherches] - Recherches { mots, moteur, sources } faites pour cette réponse.
 * @returns {HTMLLIElement} La première bulle ajoutée.
 */
function ajouterReponse(texte, langue = 'fr', animer = false, recherches = null) {
    let variantes = null;
    if (outilActuel === 'reformuler') {
        variantes = Albert.decouperVariantes(texte);
    }
    if (!variantes) {
        const li = bulleReponse(texte, null, langue, animer, recherches);
        $('fil').append(li);
        suivreBulle(li);
        return li;
    }
    const bulles = variantes.map(v => bulleReponse(v.texte, v.titre, langue, animer));
    $('fil').append(...bulles);
    /* Montrer le début de la première variante, pas la fin de la dernière. */
    bulles[0].scrollIntoView({ block: 'start' });
    return bulles[0];
}
