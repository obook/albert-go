/*
 * i18n.js
 * Textes de l'interface en français et en anglais.
 *
 * Premier script chargé : tous les autres appellent t('clé'). La langue
 * est choisie au démarrage (stockage.js) et changée dans les réglages.
 * Dans index.html, les textes portent data-t, data-t-html ou data-t-attr,
 * relus par I18n.appliquer à chaque changement de langue.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Septembre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

const I18n = {
    /** Langues de l'interface. La première sert de secours. */
    LANGUES: ['fr', 'en'],

    /** Langue affichée. */
    langue: 'fr',

    /**
     * Langue du navigateur, si l'interface la connaît.
     *
     * @returns {string} Code de langue de LANGUES.
     */
    defaut() {
        const langue = (navigator.language || 'fr').slice(0, 2).toLowerCase();
        return this.LANGUES.includes(langue) ? langue : 'fr';
    },

    /**
     * Change la langue de l'interface.
     *
     * @param {string} langue - Code de langue ; une langue inconnue donne le français.
     */
    definir(langue) {
        this.langue = this.LANGUES.includes(langue) ? langue : 'fr';
        document.documentElement.lang = this.langue;
    },

    /**
     * Texte d'une clé, avec ses valeurs.
     *
     * @param {string} cle - Clé du dictionnaire.
     * @param {Object} [valeurs] - Valeurs des {marqueurs} du texte.
     * @returns {string} Texte traduit, ou le texte français, ou la clé.
     */
    t(cle, valeurs) {
        const table = this.TEXTES[this.langue] || this.TEXTES.fr;
        let texte = table[cle];
        if (texte === undefined) {
            texte = this.TEXTES.fr[cle];
        }
        if (texte === undefined) {
            return cle;
        }
        if (!valeurs) {
            return texte;
        }
        return texte.replace(/\{(\w+)\}/g, (marque, nom) => (valeurs[nom] === undefined ? marque : valeurs[nom]));
    },

    /**
     * Indique si une clé existe dans la langue affichée ou en français.
     *
     * @param {string} cle - Clé du dictionnaire.
     * @returns {boolean} true si un texte lui répond.
     */
    existe(cle) {
        return this.TEXTES[this.langue][cle] !== undefined || this.TEXTES.fr[cle] !== undefined;
    },

    /**
     * Traduit la page : textes, textes avec lien, et attributs.
     *
     * data-t-html reçoit du HTML écrit ici, jamais du texte du modèle.
     */
    appliquer() {
        for (const element of document.querySelectorAll('[data-t]')) {
            element.textContent = this.t(element.dataset.t);
        }
        for (const element of document.querySelectorAll('[data-t-html]')) {
            element.innerHTML = this.t(element.dataset.tHtml);
        }
        /* data-t-attr="aria-label:menu.fermer;title:menu.fermer" */
        for (const element of document.querySelectorAll('[data-t-attr]')) {
            for (const paire of element.dataset.tAttr.split(';')) {
                const [attribut, cle] = paire.split(':');
                element.setAttribute(attribut.trim(), this.t(cle.trim()));
            }
        }
    },

    TEXTES: {
        fr: {
            /* En-tête et menu. */
            'entete.sous-titre': 'Discuter avec le chat de l\'État',
            'menu.ouvrir': 'Menu',
            'menu.fermer': 'Fermer le menu',
            'menu.resume': 'Ouvrir les réglages',
            'menu.nouvelle': 'Nouvelle conversation',
            'menu.outils': 'Outils',
            'menu.historique': 'Historique des conversations',
            'menu.reglages': 'Réglages',
            'menu.partager': 'Partager',
            'menu.apropos': 'À propos',
            'menu.changer-cle': 'Changer de clé',
            'historique.vide': 'Aucune conversation pour l\'instant.',
            'historique.supprimer': 'Supprimer',
            'historique.supprimer-aria': 'Supprimer la conversation : {titre}',

            /* Thèmes. */
            'theme.light': 'Thème clair',
            'theme.dark': 'Thème sombre',
            'theme.system': 'Thème du système',
            'theme.light.aria': 'Thème clair. Passer au thème sombre.',
            'theme.dark.aria': 'Thème sombre. Passer au thème du système.',
            'theme.system.aria': 'Thème du système. Passer au thème clair.',

            /* Outils. */
            'outil.discuter': 'Discuter',
            'outil.corriger': 'Corriger',
            'outil.reformuler': 'Reformuler',
            'outil.traduire': 'Traduire',
            'invite.discuter': 'Poser votre question...',
            'invite.reformuler': 'Collez le texte à reformuler...',
            'invite.traduire': 'Collez le texte à traduire...',
            'invite.corriger': 'Collez le texte à corriger...',

            /* Langues de Traduire. */
            'langue.choisir': 'Changer de langue',
            'langue.auto': 'Automatique',
            'langue.source': 'Langue source',
            'langue.cible': 'Langue cible',
            'langue.fr': 'Français',
            'langue.en': 'Anglais',
            'langue.de': 'Allemand',
            'langue.es': 'Espagnol',
            'langue.it': 'Italien',
            'langue.pt': 'Portugais',
            'langue.nl': 'Néerlandais',
            'langue.ru': 'Russe',
            'langue.zh': 'Chinois',
            'langue.ja': 'Japonais',
            'langue.ar': 'Arabe',
            'langue.la': 'Latin',

            /* Écran de la clé. */
            'cle.titre': 'Entrez votre clé Albert',
            'cle.label': 'Clé API',
            'cle.stockee': 'Votre clé reste stockée dans ce navigateur.<br/>Elle passe par l\'<a href="https://n8n.incubateur.education.gouv.fr" target="_blank" rel="noopener noreferrer">incubateur interministériel</a> sans être enregistrée.',
            'cle.enregistrer': 'Enregistrer la clé',
            'cle.demander': 'Pas encore de clé ? <a href="https://albert.sites.beta.gouv.fr/access/" target="_blank" rel="noopener noreferrer">Demander un accès à Albert</a>, réservé aux agents publics.',
            'cle.verification': 'Vérification de la clé...',

            /* Saisie. */
            'chat.aria': 'Conversation',
            'saisie.label': 'Votre question',
            'saisie.joindre': 'Joindre une image ou un fichier texte',
            'saisie.precedente': 'Question précédente',
            'saisie.suivante': 'Question suivante',
            'saisie.envoyer': 'Envoyer',
            'saisie.arreter': 'Arrêter',
            'saisie.avertissement': 'Une IA peut se tromper : vérifiez ses réponses.',
            'piece.retirer': 'Retirer le fichier',
            'piece.lecture': '{nom} : lecture en cours...',
            'piece.image-collee': 'image collée',
            'fichier.joint': 'Fichier joint : {nom}',
            'vous': 'Vous : ',
            'duree': '{secondes} s',

            /* Réglages. */
            'reglages.titre': 'Réglages',
            'reglages.conseil': 'Conseillé : modèle Large, température 0,2, toute la conversation envoyée.',
            'reglages.modele': 'Modèle',
            'reglages.alias': 'Alias : {id}',
            'reglages.modele-reel': 'Modèle : {reel}',
            'reglages.temperature': 'Température',
            'reglages.precis': 'Précis',
            'reglages.creatif': 'Créatif',
            'reglages.aide-temperature': 'Bas : réponses stables et factuelles. Haut : réponses plus variées.',
            'reglages.contexte': 'Contexte',
            'reglages.lecture': 'Lecture à voix haute',
            'reglages.voix-en-ligne': 'Autoriser les voix en ligne',
            'reglages.aide-voix': 'Seulement si aucune voix française n\'est installée. Le texte lu part alors chez Google, Microsoft...',
            'reglages.recherche': 'Recherche',
            'reglages.recherche-active': 'Inclure la recherche sur Internet',
            'reglages.moteur': 'Moteur',
            'reglages.cle-recherche': 'Clé API',
            'reglages.cx': 'ID du moteur de recherche',
            'reglages.aide-recherche': 'Une recherche part à chaque question. Pour Google, créez le <a href="https://programmablesearchengine.google.com" target="_blank" rel="noopener noreferrer">moteur</a> et sa <a href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com" target="_blank" rel="noopener noreferrer">clé API</a>. Pour Mojeek, le service est payant sur devis.',
            'reglages.cle': 'Clé API',
            'reglages.cle-note': 'Une clé est enregistrée dans ce navigateur.',
            'reglages.langue': 'Langue',
            'reglages.conseilles': 'Réglages conseillés',
            'reglages.resume': '{modele}, température {temperature}, {contexte}',
            'contexte.sans': 'sans contexte',
            'contexte.complet': 'contexte complet',
            'contexte.pourcent': 'contexte {pourcent} %',
            'partage.actif': 'À la fermeture de l\'onglet, la clé et les conversations seront effacées.',
            'partage.inactif': 'À la fermeture de l\'onglet, la clé et les conversations seront conservées.',
            'memoire.actif': 'Envoyé à Albert : toute la conversation.',
            'memoire.inactif': 'Envoyé à Albert : une question seulement.',

            /* Modèles. */
            'modele.type.texte': 'Texte',
            'modele.type.texte-images': 'Texte et images',
            'modele.openweight-medium': 'Équilibré entre qualité et rapidité.',
            'modele.openweight-large': 'Le plus capable, pour les raisonnements longs. Plus lent.',
            'modele.openweight-small': 'Le plus rapide, pour les questions simples.',
            'modele.openweight-code': 'Spécialisé en programmation.',
            'modele.openweight-code-2': 'Programmation, contexte très long.',
            'modele.inconnu': 'Modèle de conversation.',

            /* Boîtes de dialogue. */
            'dialogue.fermer': 'Fermer',
            'dialogue.oui': 'Oui',
            'dialogue.non': 'Non',
            'confirmer-cle.titre': 'Changer de clé ?',
            'confirmer-cle.texte': 'La clé enregistrée sera effacée de ce navigateur. Il faudra en saisir une pour continuer.',
            'confirmer-suppression.titre': 'Supprimer cette conversation ?',
            'partage.titre': 'Partager Albert Go',
            'partage.texte': 'Scannez le QR code ou copiez l\'adresse. Votre clé n\'est pas partagée : chacun utilise la sienne.',
            'partage.qr': 'QR code de l\'adresse d\'Albert Go',
            'partage.adresse': 'Adresse d\'Albert Go',
            'partage.copier': 'Copier',

            /* À propos. */
            'info.titre': 'À propos d\'Albert Go',
            'info.intro': 'Albert Go permet de discuter avec <a href="https://albert.sites.beta.gouv.fr/" target="_blank" rel="noopener noreferrer">Albert</a>, l\'IA de l\'État portée par la DINUM, avec votre propre clé API.',
            'info.donnees': 'Vos données',
            'info.donnees.effacement': 'Par défaut, votre clé, vos questions et vos conversations sont effacées à la fermeture de l\'onglet. Vous pouvez désactiver cette option dans les réglages. "Changer de clé", dans le menu, efface la clé.',
            'info.donnees.relais': 'Vos questions passent par un relais n8n interministériel, qui n\'enregistre rien, puis vont directement à Albert API, hébergé en France.',
            'info.donnees.fichiers': 'Un fichier texte joint est lu dans ce navigateur et envoyé avec votre question. Une image jointe est envoyée à Albert pour en extraire le texte.',
            'info.donnees.traceurs': 'Aucun compte, aucun cookie, aucune bibliothèque chargée depuis un site tiers. La lecture à voix haute utilise les voix de l\'appareil, et les voix en ligne seulement si vous les autorisez.',
            'info.clavier': 'Clavier',
            'info.clavier.texte': 'Entrée : envoyer. Maj+Entrée : nouvelle ligne. Flèches haut et bas : questions précédentes.',
            'info.reponses': 'Les réponses',
            'info.reponses.texte': 'L\'IA peut se tromper ou inventer. Vérifiez ses réponses avant de les utiliser, et ne lui confiez pas de données personnelles.',
            'info.projet': 'Le projet',
            'info.projet.texte': 'Réalisé par Olivier Booklage. <a href="https://forge.apps.education.fr/booklageolivier/albert-go" target="_blank" rel="noopener noreferrer">Code source sur la Forge des communs numériques éducatifs</a>.',
            'info.version': 'Version : ',
            'version.format': '{commit} du {date}',

            /* Réponses. */
            'reponse.copier': 'Copier la réponse',
            'reponse.lire': 'Lire à voix haute',
            'reponse.arreter-lecture': 'Arrêter la lecture',
            'reponse.recherches': 'Voir les recherches faites',
            'reponse.recherches-wikipedia': 'Voir les recherches faites dans Wikipédia',
            'reponse.note-recherche': 'Recherche : {mots}',

            /* Messages. */
            'toast.adresse-copiee': 'Adresse copiée.',
            'toast.reponse-copiee': 'Réponse copiée.',
            'toast.conversation-supprimee': 'Conversation supprimée.',
            'toast.conversation-longue': 'Conversation trop longue pour être enregistrée. Elle reste affichée jusqu\'à la fermeture de l\'onglet.',
            'toast.memoire-pleine': 'Mémoire du navigateur pleine : {nombre} ancienne(s) conversation(s) supprimée(s).',
            'toast.liens': 'Albert n\'ouvre pas les liens. Pour une page web, collez son texte ou joignez-le en fichier.',
            'toast.recherche-indisponible': 'Recherche indisponible avec ce modèle.',
            'toast.voix-absente-en-ligne': 'Aucune voix en {langue} disponible dans ce navigateur.',
            'toast.voix-absente': 'Aucune voix en {langue} installée sur cet appareil. Les voix en ligne ne sont pas utilisées.',
            'etat.reflechit': 'Albert réfléchit...',
            'etat.annulee': 'Question annulée.',
            'etat.attendre-lecture': 'Attendez la fin de la lecture du fichier.',
            'etat.lecture-image': 'Lecture de l\'image par Albert...',
            'etat.recherche': 'Recherche de « {mots} »...',

            /* Erreurs. */
            'erreur.cle-refusee': 'Clé refusée par Albert. Vérifiez-la ou changez-la.',
            'erreur.quota': 'Quota atteint. Réessayez dans une minute.',
            'erreur.http': 'Erreur {status}.',
            'erreur.http-detail': 'Erreur {status} : {detail}',
            'erreur.relais': 'Relais n8n injoignable. Vérifiez la connexion.',
            'erreur.timeout': 'Albert ne répond pas. Réessayez.',
            'erreur.origine': 'Le relais n8n n\'acceptera pas l\'adresse {origine}. Ouvrez ',
            'erreur.consigne': 'Consigne de l\'outil {outil} introuvable.',
            'erreur.format': 'Format non pris en charge : images et fichiers texte uniquement.',
            'erreur.fichier-long': 'Fichier trop long : 200 Ko au plus.',
            'erreur.hors-cadre': 'Ouvrir Albert Go dans son propre onglet',

            /* Textes envoyés au modèle. */
            'demande.reformuler': 'Reformule ce texte :\n\n{texte}',
            'demande.corriger': 'Corrige ce texte :\n\n{texte}',
            'demande.traduire': 'Traduis ce texte en {cible} :\n\n{texte}',
            'demande.traduire-source': 'Traduis ce texte en {cible} (langue source : {source}) :\n\n{texte}',
            'demande.fichier': 'Contenu du fichier "{nom}" :\n\n{texte}',
            'demande.image': 'Transcris fidèlement tout le texte visible dans cette image, en Markdown. '
                + 'Écris les formules en LaTeX entre $. Si l\'image contient une figure ou un schéma, '
                + 'décris-le en quelques phrases. Ne réponds rien d\'autre.',
            'recherche.description': 'Cherche une information et renvoie des extraits sourcés. '
                + 'À appeler pour un fait à vérifier, une date, un chiffre, une étymologie, '
                + 'une actualité ou une source à citer, et chaque fois que tu répondrais de mémoire '
                + 'sur un sujet précis. Le moteur est soit Wikipédia, soit un moteur web selon le '
                + 'réglage : ce que tu reçois est tout ce dont tu disposes, dis-le si cela ne suffit pas.',
            'recherche.parametre': 'Les mots à chercher.',
            'recherche.source-wikipedia': 'dans Wikipédia',
            'recherche.source-web': 'sur le web',
            'recherche.rappel': 'Tu disposes de l\'outil recherche_web : tu peux chercher {source}, '
                + 'et tu le dis si on te le demande. Sers-t\'en dès qu\'une réponse demande un fait précis '
                + 'que tu n\'es pas certain de connaître.',
            'recherche.resultats': 'Résultats de recherche :\n{extraits}\n\nRéponds maintenant à la question à partir de ces extraits.',
            'recherche.aucun-mot': 'Aucun mot à chercher.',
            'recherche.aucun-resultat': 'Aucun résultat.',
            'recherche.impossible': 'Recherche impossible : {message}',
            'recherche.moteur-injoignable': 'moteur injoignable ({status}).',
            'recherche.wikipedia-injoignable': 'Wikipédia injoignable ({status}).',
            'recherche.wikipedia-refus': 'requête refusée par Wikipédia.'
        },

        en: {
            /* Header and menu. */
            'entete.sous-titre': 'Chat with the French State AI',
            'menu.ouvrir': 'Menu',
            'menu.fermer': 'Close the menu',
            'menu.resume': 'Open settings',
            'menu.nouvelle': 'New conversation',
            'menu.outils': 'Tools',
            'menu.historique': 'Conversation history',
            'menu.reglages': 'Settings',
            'menu.partager': 'Share',
            'menu.apropos': 'About',
            'menu.changer-cle': 'Change key',
            'historique.vide': 'No conversation yet.',
            'historique.supprimer': 'Delete',
            'historique.supprimer-aria': 'Delete the conversation: {titre}',

            /* Themes. */
            'theme.light': 'Light theme',
            'theme.dark': 'Dark theme',
            'theme.system': 'System theme',
            'theme.light.aria': 'Light theme. Switch to the dark theme.',
            'theme.dark.aria': 'Dark theme. Switch to the system theme.',
            'theme.system.aria': 'System theme. Switch to the light theme.',

            /* Tools. */
            'outil.discuter': 'Chat',
            'outil.corriger': 'Proofread',
            'outil.reformuler': 'Rephrase',
            'outil.traduire': 'Translate',
            'invite.discuter': 'Ask your question...',
            'invite.reformuler': 'Paste the text to rephrase...',
            'invite.traduire': 'Paste the text to translate...',
            'invite.corriger': 'Paste the text to proofread...',

            /* Translate languages. */
            'langue.choisir': 'Change language',
            'langue.auto': 'Automatic',
            'langue.source': 'Source language',
            'langue.cible': 'Target language',
            'langue.fr': 'French',
            'langue.en': 'English',
            'langue.de': 'German',
            'langue.es': 'Spanish',
            'langue.it': 'Italian',
            'langue.pt': 'Portuguese',
            'langue.nl': 'Dutch',
            'langue.ru': 'Russian',
            'langue.zh': 'Chinese',
            'langue.ja': 'Japanese',
            'langue.ar': 'Arabic',
            'langue.la': 'Latin',

            /* Key screen. */
            'cle.titre': 'Enter your Albert key',
            'cle.label': 'API key',
            'cle.stockee': 'Your key stays in this browser.<br/>It goes through the <a href="https://n8n.incubateur.education.gouv.fr" target="_blank" rel="noopener noreferrer">interministerial incubator</a>, which does not record it.',
            'cle.enregistrer': 'Save the key',
            'cle.demander': 'No key yet? <a href="https://albert.sites.beta.gouv.fr/access/" target="_blank" rel="noopener noreferrer">Request access to Albert</a>, reserved for public servants.',
            'cle.verification': 'Checking the key...',

            /* Input. */
            'chat.aria': 'Conversation',
            'saisie.label': 'Your question',
            'saisie.joindre': 'Attach an image or a text file',
            'saisie.precedente': 'Previous question',
            'saisie.suivante': 'Next question',
            'saisie.envoyer': 'Send',
            'saisie.arreter': 'Stop',
            'saisie.avertissement': 'An AI can be wrong: check its answers.',
            'piece.retirer': 'Remove the file',
            'piece.lecture': '{nom}: reading...',
            'piece.image-collee': 'pasted image',
            'fichier.joint': 'Attached file: {nom}',
            'vous': 'You: ',
            'duree': '{secondes} s',

            /* Settings. */
            'reglages.titre': 'Settings',
            'reglages.conseil': 'Recommended: Large model, temperature 0.2, whole conversation sent.',
            'reglages.modele': 'Model',
            'reglages.alias': 'Alias: {id}',
            'reglages.modele-reel': 'Model: {reel}',
            'reglages.temperature': 'Temperature',
            'reglages.precis': 'Precise',
            'reglages.creatif': 'Creative',
            'reglages.aide-temperature': 'Low: steady, factual answers. High: more varied answers.',
            'reglages.contexte': 'Context',
            'reglages.lecture': 'Read aloud',
            'reglages.voix-en-ligne': 'Allow online voices',
            'reglages.aide-voix': 'Only if no local voice is installed. The text read out then goes to Google, Microsoft...',
            'reglages.recherche': 'Search',
            'reglages.recherche-active': 'Include Internet search',
            'reglages.moteur': 'Engine',
            'reglages.cle-recherche': 'API key',
            'reglages.cx': 'Search engine ID',
            'reglages.aide-recherche': 'A search is run for every question. For Google, create the <a href="https://programmablesearchengine.google.com" target="_blank" rel="noopener noreferrer">engine</a> and its <a href="https://console.cloud.google.com/apis/library/customsearch.googleapis.com" target="_blank" rel="noopener noreferrer">API key</a>. Mojeek is a paid service, priced on request.',
            'reglages.cle': 'API key',
            'reglages.cle-note': 'A key is saved in this browser.',
            'reglages.langue': 'Language',
            'reglages.conseilles': 'Recommended settings',
            'reglages.resume': '{modele}, temperature {temperature}, {contexte}',
            'contexte.sans': 'no context',
            'contexte.complet': 'full context',
            'contexte.pourcent': 'context {pourcent} %',
            'partage.actif': 'When the tab closes, the key and the conversations will be erased.',
            'partage.inactif': 'When the tab closes, the key and the conversations will be kept.',
            'memoire.actif': 'Sent to Albert: the whole conversation.',
            'memoire.inactif': 'Sent to Albert: one question only.',

            /* Models. */
            'modele.type.texte': 'Text',
            'modele.type.texte-images': 'Text and images',
            'modele.openweight-medium': 'A balance of quality and speed.',
            'modele.openweight-large': 'The most capable, for long reasoning. Slower.',
            'modele.openweight-small': 'The fastest, for simple questions.',
            'modele.openweight-code': 'Specialised in programming.',
            'modele.openweight-code-2': 'Programming, very long context.',
            'modele.inconnu': 'Chat model.',

            /* Dialogs. */
            'dialogue.fermer': 'Close',
            'dialogue.oui': 'Yes',
            'dialogue.non': 'No',
            'confirmer-cle.titre': 'Change key?',
            'confirmer-cle.texte': 'The saved key will be erased from this browser. You will have to enter one to carry on.',
            'confirmer-suppression.titre': 'Delete this conversation?',
            'partage.titre': 'Share Albert Go',
            'partage.texte': 'Scan the QR code or copy the address. Your key is not shared: everyone uses their own.',
            'partage.qr': 'QR code of the Albert Go address',
            'partage.adresse': 'Albert Go address',
            'partage.copier': 'Copy',

            /* About. */
            'info.titre': 'About Albert Go',
            'info.intro': 'Albert Go lets you chat with <a href="https://albert.sites.beta.gouv.fr/" target="_blank" rel="noopener noreferrer">Albert</a>, the French State AI run by the DINUM, using your own API key.',
            'info.donnees': 'Your data',
            'info.donnees.effacement': 'By default, your key, your questions and your conversations are erased when the tab closes. You can turn that off in the settings. "Change key", in the menu, erases the key.',
            'info.donnees.relais': 'Your questions go through an interministerial n8n relay, which records nothing, then straight to Albert API, hosted in France.',
            'info.donnees.fichiers': 'An attached text file is read in this browser and sent with your question. An attached image is sent to Albert to extract its text.',
            'info.donnees.traceurs': 'No account, no cookie, no library loaded from a third-party site. Reading aloud uses the voices of the device, and online voices only if you allow them.',
            'info.clavier': 'Keyboard',
            'info.clavier.texte': 'Enter: send. Shift+Enter: new line. Up and down arrows: previous questions.',
            'info.reponses': 'The answers',
            'info.reponses.texte': 'An AI can be wrong or make things up. Check its answers before using them, and do not give it personal data.',
            'info.projet': 'The project',
            'info.projet.texte': 'Built by Olivier Booklage. <a href="https://forge.apps.education.fr/booklageolivier/albert-go" target="_blank" rel="noopener noreferrer">Source code on the Forge des communs numériques éducatifs</a>.',
            'info.version': 'Version: ',
            'version.format': '{commit} of {date}',

            /* Answers. */
            'reponse.copier': 'Copy the answer',
            'reponse.lire': 'Read aloud',
            'reponse.arreter-lecture': 'Stop reading',
            'reponse.recherches': 'Show the searches made',
            'reponse.recherches-wikipedia': 'Show the searches made in Wikipedia',
            'reponse.note-recherche': 'Search: {mots}',

            /* Messages. */
            'toast.adresse-copiee': 'Address copied.',
            'toast.reponse-copiee': 'Answer copied.',
            'toast.conversation-supprimee': 'Conversation deleted.',
            'toast.conversation-longue': 'Conversation too long to be saved. It stays on screen until the tab closes.',
            'toast.memoire-pleine': 'Browser storage full: {nombre} old conversation(s) deleted.',
            'toast.liens': 'Albert does not open links. For a web page, paste its text or attach it as a file.',
            'toast.recherche-indisponible': 'Search is not available with this model.',
            'toast.voix-absente-en-ligne': 'No {langue} voice available in this browser.',
            'toast.voix-absente': 'No {langue} voice installed on this device. Online voices are not used.',
            'etat.reflechit': 'Albert is thinking...',
            'etat.annulee': 'Question cancelled.',
            'etat.attendre-lecture': 'Wait until the file has been read.',
            'etat.lecture-image': 'Albert is reading the image...',
            'etat.recherche': 'Searching for "{mots}"...',

            /* Errors. */
            'erreur.cle-refusee': 'Key refused by Albert. Check it or change it.',
            'erreur.quota': 'Quota reached. Try again in a minute.',
            'erreur.http': 'Error {status}.',
            'erreur.http-detail': 'Error {status}: {detail}',
            'erreur.relais': 'The n8n relay cannot be reached. Check your connection.',
            'erreur.timeout': 'Albert is not answering. Try again.',
            'erreur.origine': 'The n8n relay will not accept the address {origine}. Open ',
            'erreur.consigne': 'The system prompt of the {outil} tool is missing.',
            'erreur.format': 'Format not supported: images and text files only.',
            'erreur.fichier-long': 'File too long: 200 kB at most.',
            'erreur.hors-cadre': 'Open Albert Go in its own tab',

            /* Text sent to the model. */
            'demande.reformuler': 'Rephrase this text:\n\n{texte}',
            'demande.corriger': 'Proofread this text:\n\n{texte}',
            'demande.traduire': 'Translate this text into {cible}:\n\n{texte}',
            'demande.traduire-source': 'Translate this text into {cible} (source language: {source}):\n\n{texte}',
            'demande.fichier': 'Contents of the file "{nom}":\n\n{texte}',
            'demande.image': 'Transcribe faithfully all the text visible in this image, in Markdown. '
                + 'Write formulas in LaTeX between $. If the image holds a figure or a diagram, '
                + 'describe it in a few sentences. Answer nothing else.',
            'recherche.description': 'Searches for information and returns sourced extracts. '
                + 'Call it for a fact to check, a date, a figure, an etymology, a news item or a '
                + 'source to cite, and every time you would otherwise answer from memory on a '
                + 'precise subject. The engine is either Wikipedia or a web engine depending on '
                + 'the setting: what you get is all you have, say so if it is not enough.',
            'recherche.parametre': 'The words to search for.',
            'recherche.source-wikipedia': 'in Wikipedia',
            'recherche.source-web': 'on the web',
            'recherche.rappel': 'You have the recherche_web tool: you can search {source}, '
                + 'and you say so if asked. Use it as soon as an answer needs a precise fact '
                + 'you are not sure you know.',
            'recherche.resultats': 'Search results:\n{extraits}\n\nNow answer the question from these extracts.',
            'recherche.aucun-mot': 'No words to search for.',
            'recherche.aucun-resultat': 'No result.',
            'recherche.impossible': 'Search failed: {message}',
            'recherche.moteur-injoignable': 'engine unreachable ({status}).',
            'recherche.wikipedia-injoignable': 'Wikipedia unreachable ({status}).',
            'recherche.wikipedia-refus': 'request refused by Wikipedia.'
        }
    }
};

/**
 * Raccourci de I18n.t, appelé partout dans l'interface.
 *
 * @param {string} cle - Clé du dictionnaire.
 * @param {Object} [valeurs] - Valeurs des {marqueurs} du texte.
 * @returns {string} Texte traduit.
 */
function t(cle, valeurs) {
    return I18n.t(cle, valeurs);
}

/* Export pour les tests Node ; ignoré dans le navigateur. Les autres
   modules lisent t et I18n comme variables globales. */
if (typeof module !== 'undefined') {
    module.exports = I18n;
    globalThis.t = t;
    globalThis.I18n = I18n;
}
