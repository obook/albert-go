/*
 * rendu/images.js
 * Images de Wikimedia Commons sous les liens d'une réponse, et téléchargement de fichiers.
 *
 * Complète l'objet Rendu de rendu.js, chargé avant.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Rendu, {
    /**
     * Affiche au-dessus d'un lien vers Commons l'image qu'il désigne, avec son
     * crédit. Seulement si la réponse a eu Internet (globe activé) et qu'Internet
     * est toujours autorisé : Wikimedia voit alors l'adresse IP. Sans Internet,
     * un lien écrit de mémoire par le modèle reste un lien.
     *
     * @param {HTMLElement} element - Conteneur de la réponse.
     * @param {boolean} [cherchees] - true si cette réponse a eu Internet (images, recherche ou service).
     * @returns {Promise<void>}
     */
    async imagesCommons(element, cherchees = false) {
        if (!cherchees || !reglages.recherche) {
            return;
        }
        const vus = new Set();
        for (const lien of element.querySelectorAll('a[href]')) {
            const titre = Recherche.fichierCommons(lien.href);
            if (!titre || vus.has(titre)) {
                continue;
            }
            vus.add(titre);
            /* Image avant le lien : en tête du <li>, sinon avant le paragraphe. */
            const bloc = lien.closest('p, li');
            const placer = (noeud) => bloc && bloc.tagName === 'LI' ? bloc.prepend(noeud) : (bloc || lien).before(noeud);
            const lienSeul = bloc && bloc.textContent.trim() === lien.textContent.trim();
            const image = await Recherche.imageCommons(titre).catch(() => null)
                || await this.imageApprochee(titre).catch(() => null);
            if (!image) {
                const note = document.createElement('p');
                note.className = 'image-absente';
                note.textContent = t('reponse.image-absente');
                placer(note);
                continue;
            }
            const figure = document.createElement('figure');
            figure.className = 'image-commons';
            const img = document.createElement('img');
            img.src = image.src;
            img.alt = titre.replace(/^[^:]+:/, '').replace(/\.[^.]+$/, '').replace(/_/g, ' ');
            const credit = document.createElement('a');
            credit.href = image.page;
            credit.target = '_blank';
            credit.rel = 'noopener noreferrer';
            /* Le lien mène à la page Commons : le nom du site ne sert que si rien d'autre n'est connu. */
            credit.textContent = [image.auteur, image.date, image.licence].filter(Boolean).join(', ') || 'Wikimedia Commons';
            const legende = document.createElement('figcaption');
            /* Ligne 1 : le titre, en italique ; <q> met les guillemets de la langue de la page. */
            if (image.description) {
                const titreImage = document.createElement('q');
                const italique = document.createElement('i');
                italique.textContent = image.description;
                titreImage.append(italique);
                legende.append(titreImage);
            }
            /* Ligne 2 : auteur, date, licence. */
            legende.append(credit);
            /* Clic : l'image en taille réelle, dans un nouvel onglet. */
            const agrandir = document.createElement('a');
            agrandir.href = image.original;
            agrandir.target = '_blank';
            agrandir.rel = 'noopener noreferrer';
            agrandir.append(img);
            const cadre = document.createElement('div');
            cadre.className = 'cadre-image';
            cadre.append(agrandir);
            /* Un lien download vers un autre site ouvre l'image : on la récupère. */
            if (/^https:\/\/upload\.wikimedia\.org\//.test(image.original)) {
                const bouton = boutonAction(ICONES.telecharger, t('reponse.telecharger-image'));
                bouton.addEventListener('click', () => this.telechargerAvecAttente(bouton,
                    () => fetch(image.original).then((r) => {
                        if (!r.ok) {
                            throw new Error(r.status);
                        }
                        return r.blob();
                    }), this.nomImage(titre)));
                const boutons = document.createElement('div');
                boutons.className = 'boutons-figure';
                boutons.append(bouton);
                cadre.append(boutons);
            }
            figure.append(cadre, legende);
            placer(figure);
            /* Lien seul : le crédit mène à la même page, il ferait doublon. */
            if (lienSeul) {
                (bloc.tagName === 'LI' ? lien : bloc).remove();
            }
        }
    },

    /**
     * Nom d'une image de Commons enregistrée : son nom sur Commons, nettoyé.
     *
     * @param {string} titre - Titre du fichier, ex. "File:Tour_Eiffel.jpg".
     * @returns {string} Ex. tour-eiffel.jpg.
     */
    nomImage(titre) {
        const [, nom, extension] = titre.replace(/^[^:]+:/, '').match(/^(.*?)(?:\.(\w+))?$/);
        return (this.motsFichier(nom, 60) || 'image') + '.' + (extension || 'jpg').toLowerCase();
    },

    /**
     * Fichier inventé par le modèle : première vraie image de Commons qui reprend tous les mots de son nom.
     *
     * @param {string} titre - Titre introuvable, ex. "File:Picasso,_Les_Demoiselles_d'Avignon.jpg".
     * @returns {Promise<?Object>} Voir Recherche.lireImageCommons.
     */
    async imageApprochee(titre) {
        const mots = titre.replace(/^[^:]+:/, '').replace(/\.[^.]+$/, '').replace(/[_,()]+|\b\d+\b/g, ' ').replace(/\s+/g, ' ').trim();
        /* Tous les mots d'au moins 4 lettres dans le nom ou la description, sinon mieux vaut rien : Picasso ne doit pas donner Munch. */
        const voulus = Recherche.motsCles(mots);
        const trouvee = (await Recherche.chercherImages(mots)).find(i => Recherche.contientTout(i, voulus));
        return trouvee ? Recherche.imageCommons(trouvee.titre) : null;
    },

    /**
     * Télécharge un fichier long à préparer : bouton inactif et clignotant en attendant.
     *
     * @param {HTMLButtonElement} bouton - Bouton cliqué.
     * @param {function(): Promise<Blob>} preparer - Fabrique le contenu.
     * @param {string} nom - Nom du fichier.
     */
    async telechargerAvecAttente(bouton, preparer, nom) {
        bouton.disabled = true;
        bouton.classList.add('en-cours');
        /* Sur mobile, rien d'autre ne dit que le fichier arrive : le message reste jusqu'au suivant. */
        toast(t('toast.telechargement-en-cours'), true);
        try {
            this.telecharger(await preparer(), nom);
            toast(t('toast.telecharge', { nom: nom }));
        } catch (err) {
            toast(t('toast.telechargement-impossible'));
        } finally {
            bouton.disabled = false;
            bouton.classList.remove('en-cours');
        }
    },

    /**
     * Enregistre un fichier sur le poste.
     *
     * @param {Blob} fichier - Contenu.
     * @param {string} nom - Nom du fichier.
     */
    telecharger(fichier, nom) {
        const lien = document.createElement('a');
        lien.href = URL.createObjectURL(fichier);
        lien.download = nom;
        lien.click();
        setTimeout(() => URL.revokeObjectURL(lien.href), 1000);
    },
});
