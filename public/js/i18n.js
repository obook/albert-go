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
    LANGUES: ['fr', 'en', 'es', 'de'],

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
     * Date et heure au format court de la langue affichée.
     *
     * @param {Date|number} date - Date à écrire.
     * @returns {string} Date et heure, par exemple "22/09/2026 19:40".
     */
    dateHeure(date) {
        return new Intl.DateTimeFormat(this.langue, { dateStyle: 'short', timeStyle: 'short' }).format(date);
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
            'module.discuter': 'Chat',
            'module.corriger': 'Ortho',
            'module.reformuler': 'Style',
            'module.traduire': 'Trad',
            'invite.discuter': 'Poser votre question...',
            'invite.reformuler': 'Collez le texte à reformuler...',
            'invite.traduire': 'Collez le texte à traduire...',
            'invite.corriger': 'Collez le texte à corriger...',
            'outil.rediger': 'Rédiger',
            'module.rediger': 'Rédac',
            'invite.rediger': 'Madame, Monsieur... puis vos idées principales, une par ligne.',
            'notes.label': 'Notes du courrier',

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
            'reglages.carte-reponse': 'IA',
            'reglages.carte-application': 'Application',
            'reglages.carte-donnees': 'Données',
            'reglages.modele': 'Modèle',
            'reglages.alias': 'Alias : {id}',
            'reglages.modele-reel': 'Modèle : {reel}',
            'reglages.temperature': 'Température',
            'reglages.precis': 'Précis',
            'reglages.creatif': 'Créatif',
            'reglages.aide-temperature': 'Bas : réponses stables et factuelles. Haut : réponses originales, mais le modèle invente davantage.',
            'reglages.contexte': 'Contexte',
            'reglages.lecture': 'Lecture à voix haute',
            'reglages.voix-en-ligne': 'Autoriser les voix en ligne',
            'reglages.aide-voix': 'Appelé si aucune voix n\'est installée dans la langue à lire. Un moteur de voix externe peut collecter et exploiter les données personnelles de la conversation. Renseignez-vous avant d\'activer cette option.',
            'reglages.recherche': 'Recherche',
            'reglages.recherche-active': 'Brancher l\'IA sur :',
            'reglages.moteur': 'Moteur de recherche',
            'moteur.wikipedia': 'Encyclopédie généraliste',
            'moteur.data-gouv': 'Données publiques françaises',
            'moteur.hal': 'Publications de la recherche française',
            'moteur.internet-archive': 'Archives du web, livres et documents',
            'moteur.open-library': 'Livres et éditions',
            'moteur.openalex': 'Publications scientifiques du monde entier',
            'moteur.vikidia': 'Encyclopédie pour les 8-13 ans',
            'moteur.google': 'Tout le web, clé nécessaire, service en fin de vie',
            'moteur.mojeek': 'Tout le web, index indépendant, clé payante',
            'reglages.cle-recherche': 'Clé API',
            'reglages.cx': 'ID du moteur de recherche',
            'reglages.aide-recherche': 'Un moteur de recherche externe peut collecter et exploiter les données de la conversation. Renseignez-vous avant d\'activer cette option.',
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
            'reponse.copier-code': 'Copier le code',
            'reponse.telecharger-figure': 'Télécharger la figure (SVG)',
            'reponse.telecharger-png': 'Télécharger l\'image (PNG)',
            'reponse.erreur-diagramme': 'Diagramme non affiché, erreur de Mermaid : ',
            'reponse.lire': 'Lire à voix haute',
            'reponse.arreter-lecture': 'Arrêter la lecture',
            'reponse.recherches': 'Voir les recherches {nom}',
            'reponse.note-recherche': 'Recherche : {mots}',
            'reponse.sources': 'Pages consultées : ',

            /* Messages. */
            'toast.adresse-copiee': 'Adresse copiée.',
            'toast.reponse-copiee': 'Réponse copiée.',
            'toast.code-copie': 'Code copié.',
            'toast.copie-refusee': 'Copie refusée par le navigateur.',
            'toast.partage-impossible': 'Changement impossible : les données ne tiennent pas dans le nouveau stockage.',
            'toast.conversation-supprimee': 'Conversation supprimée.',
            'toast.conversation-longue': 'Conversation trop longue pour être enregistrée. Elle reste affichée jusqu\'à la fermeture de l\'onglet.',
            'toast.memoire-pleine': 'Mémoire du navigateur pleine : {nombre} ancienne(s) conversation(s) supprimée(s).',
            'toast.liens': 'Albert n\'ouvre pas les liens. Pour une page web, collez son texte ou joignez-le en fichier.',
            'toast.recherche-indisponible': 'Recherche indisponible avec ce modèle.',
            'toast.voix-absente-en-ligne': 'Aucune voix en {langue} disponible dans ce navigateur.',
            'toast.voix-absente': 'Aucune voix en {langue} installée sur cet appareil. Les voix en ligne ne sont pas utilisées.',
            'etat.reflechit': 'Albert réfléchit...',
            'etat.redige': 'Albert rédige...',
            'etat.proposition': 'Proposition',
            'etat.relit': 'Albert relit...',
            'reponse.revoir': 'Revoir : reconstruire et vérifier',
            'anomalies.titre': 'Points à vérifier',
            'etat.annulee': 'Question annulée.',
            'etat.attendre-lecture': 'Attendez la fin de la lecture du fichier.',
            'etat.lecture-image': 'Lecture de l\'image par Albert...',
            'etat.recherche': 'Recherche de « {mots} »...',

            /* Erreurs. */
            'erreur.cle-refusee': 'Clé refusée par Albert. Vérifiez-la ou changez-la.',
            'erreur.quota': 'Quota atteint. Réessayez dans une minute.',
            'erreur.reponse-illisible': 'Réponse illisible d\'Albert. Réessayez.',
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
            'demande.rediger': 'Rédige un courrier à partir de ces notes :\n\n{texte}',
            'demande.revoir': 'Notes :\n{notes}\n\nCourrier à revoir :\n{proposition}\n\nCalendrier (le premier jour est aujourd\'hui) :\n{calendrier}',
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
                + 'sur un sujet précis. Le moteur est {nom} : ce que tu reçois est tout ce dont '
                + 'tu disposes, dis-le si cela ne suffit pas.',
            'recherche.parametre': 'Les mots à chercher.',
            'recherche.description-catalogue': 'Ce moteur est un catalogue : il ne rend un résultat que si tous les mots cherchés y figurent. Cherche donc avec deux ou trois mots-clés, jamais avec une phrase.',
            'recherche.source-base': 'dans {nom}',
            'recherche.source-web': 'sur le web',
            'recherche.rappel': 'Tu disposes de l\'outil recherche_web : tu peux chercher {source}, '
                + 'et tu le dis si on te le demande. Sers-t\'en dès qu\'une réponse demande un fait précis '
                + 'que tu n\'es pas certain de connaître.',
            'recherche.resultats': 'Résultats de recherche :\n{extraits}\n\nRéponds maintenant à la question à partir de ces extraits. Cite chaque fait avec le numéro de sa source entre crochets, par exemple [1].',
            'recherche.aucun-mot': 'Aucun mot à chercher.',
            'recherche.aucun-resultat': 'Aucun résultat.',
            'recherche.impossible': 'Recherche impossible : {message}',
            'recherche.moteur-injoignable': '{nom} injoignable ({status}).',
            'recherche.moteur-refus': 'requête refusée par {nom}.'
        },

        es: {
            /* Cabecera y menu. */
            'menu.ouvrir': 'Menú',
            'menu.fermer': 'Cerrar el menú',
            'menu.resume': 'Abrir los ajustes',
            'menu.nouvelle': 'Nueva conversación',
            'menu.outils': 'Herramientas',
            'menu.historique': 'Historial de conversaciones',
            'menu.reglages': 'Ajustes',
            'menu.partager': 'Compartir',
            'menu.apropos': 'Acerca de',
            'menu.changer-cle': 'Cambiar de clave',
            'historique.vide': 'Ninguna conversación por ahora.',
            'historique.supprimer': 'Eliminar',
            'historique.supprimer-aria': 'Eliminar la conversación: {titre}',

            /* Temas. */
            'theme.light': 'Tema claro',
            'theme.dark': 'Tema oscuro',
            'theme.system': 'Tema del sistema',
            'theme.light.aria': 'Tema claro. Pasar al tema oscuro.',
            'theme.dark.aria': 'Tema oscuro. Pasar al tema del sistema.',
            'theme.system.aria': 'Tema del sistema. Pasar al tema claro.',

            /* Herramientas. */
            'outil.discuter': 'Charlar',
            'outil.corriger': 'Corregir',
            'outil.reformuler': 'Reformular',
            'outil.traduire': 'Traducir',
            'module.discuter': 'Chat',
            'module.corriger': 'Ortog',
            'module.reformuler': 'Estilo',
            'module.traduire': 'Trad',
            'invite.discuter': 'Haga su pregunta...',
            'invite.reformuler': 'Pegue el texto que reformular...',
            'invite.traduire': 'Pegue el texto que traducir...',
            'invite.corriger': 'Pegue el texto que corregir...',
            'outil.rediger': 'Redactar',
            'module.rediger': 'Carta',
            'invite.rediger': 'Estimada señora... y luego sus ideas principales, una por línea.',
            'notes.label': 'Notas de la carta',

            /* Idiomas de Traducir. */
            'langue.choisir': 'Cambiar de idioma',
            'langue.auto': 'Automático',
            'langue.source': 'Idioma de origen',
            'langue.cible': 'Idioma de destino',
            'langue.fr': 'Francés',
            'langue.en': 'Inglés',
            'langue.de': 'Alemán',
            'langue.es': 'Español',
            'langue.it': 'Italiano',
            'langue.pt': 'Portugués',
            'langue.nl': 'Neerlandés',
            'langue.ru': 'Ruso',
            'langue.zh': 'Chino',
            'langue.ja': 'Japonés',
            'langue.ar': 'Árabe',
            'langue.la': 'Latín',

            /* Pantalla de la clave. */
            'cle.titre': 'Introduzca su clave Albert',
            'cle.label': 'Clave API',
            'cle.stockee': 'Su clave se queda en este navegador.<br/>Pasa por la <a href="https://n8n.incubateur.education.gouv.fr" target="_blank" rel="noopener noreferrer">incubadora interministerial</a>, que no la guarda.',
            'cle.enregistrer': 'Guardar la clave',
            'cle.demander': '¿Todavía sin clave? <a href="https://albert.sites.beta.gouv.fr/access/" target="_blank" rel="noopener noreferrer">Solicitar acceso a Albert</a>, reservado a los empleados públicos.',
            'cle.verification': 'Comprobando la clave...',

            /* Entrada. */
            'chat.aria': 'Conversación',
            'saisie.label': 'Su pregunta',
            'saisie.joindre': 'Adjuntar una imagen o un archivo de texto',
            'saisie.precedente': 'Pregunta anterior',
            'saisie.suivante': 'Pregunta siguiente',
            'saisie.envoyer': 'Enviar',
            'saisie.arreter': 'Detener',
            'saisie.avertissement': 'Una IA puede equivocarse: compruebe sus respuestas.',
            'piece.retirer': 'Quitar el archivo',
            'piece.lecture': '{nom}: leyendo...',
            'piece.image-collee': 'imagen pegada',
            'fichier.joint': 'Archivo adjunto: {nom}',
            'vous': 'Usted: ',
            'duree': '{secondes} s',

            /* Ajustes. */
            'reglages.titre': 'Ajustes',
            'reglages.conseil': 'Recomendado: modelo Large, temperatura 0,2, toda la conversación enviada.',
            'reglages.carte-reponse': 'IA',
            'reglages.carte-application': 'Aplicación',
            'reglages.carte-donnees': 'Datos',
            'reglages.modele': 'Modelo',
            'reglages.alias': 'Alias: {id}',
            'reglages.modele-reel': 'Modelo: {reel}',
            'reglages.temperature': 'Temperatura',
            'reglages.precis': 'Preciso',
            'reglages.creatif': 'Creativo',
            'reglages.aide-temperature': 'Baja: respuestas estables y factuales. Alta: respuestas originales, pero el modelo inventa más.',
            'reglages.contexte': 'Contexto',
            'reglages.lecture': 'Lectura en voz alta',
            'reglages.voix-en-ligne': 'Permitir las voces en línea',
            'reglages.aide-voix': 'Se usa si no hay ninguna voz instalada en el idioma que hay que leer. Un motor de voz externo puede recopilar y explotar los datos personales de la conversación. Infórmese antes de activar esta opción.',
            'reglages.recherche': 'Búsqueda',
            'reglages.recherche-active': 'Conectar la IA a:',
            'reglages.moteur': 'Motor de búsqueda',
            'moteur.wikipedia': 'Enciclopedia generalista',
            'moteur.data-gouv': 'Datos públicos franceses',
            'moteur.hal': 'Publicaciones de la investigación francesa',
            'moteur.internet-archive': 'Archivos de la web, libros y documentos',
            'moteur.open-library': 'Libros y ediciones',
            'moteur.openalex': 'Publicaciones científicas del mundo entero',
            'moteur.vikidia': 'Enciclopedia para niños de 8 a 13 años',
            'moteur.google': 'Toda la web, se necesita una clave, servicio en fin de vida',
            'moteur.mojeek': 'Toda la web, índice independiente, clave de pago',
            'reglages.cle-recherche': 'Clave API',
            'reglages.cx': 'ID del buscador',
            'reglages.aide-recherche': 'Un buscador externo puede recopilar y explotar los datos de la conversación. Infórmese antes de activar esta opción.',
            'reglages.cle-note': 'Hay una clave guardada en este navegador.',
            'reglages.langue': 'Idioma',
            'reglages.conseilles': 'Ajustes recomendados',
            'reglages.resume': '{modele}, temperatura {temperature}, {contexte}',
            'contexte.sans': 'sin contexto',
            'contexte.complet': 'contexto completo',
            'contexte.pourcent': 'contexto {pourcent} %',
            'partage.actif': 'Al cerrar la pestaña, la clave y las conversaciones se borrarán.',
            'partage.inactif': 'Al cerrar la pestaña, la clave y las conversaciones se conservarán.',
            'memoire.actif': 'Enviado a Albert: toda la conversación.',
            'memoire.inactif': 'Enviado a Albert: una sola pregunta.',

            /* Modelos. */
            'modele.type.texte': 'Texto',
            'modele.type.texte-images': 'Texto e imágenes',
            'modele.openweight-medium': 'Equilibrio entre calidad y rapidez.',
            'modele.openweight-large': 'El más capaz, para razonamientos largos. Más lento.',
            'modele.openweight-small': 'El más rápido, para preguntas sencillas.',
            'modele.openweight-code': 'Especializado en programación.',
            'modele.openweight-code-2': 'Programación, contexto muy largo.',
            'modele.inconnu': 'Modelo de conversación.',

            /* Cuadros de diálogo. */
            'dialogue.fermer': 'Cerrar',
            'dialogue.oui': 'Sí',
            'dialogue.non': 'No',
            'confirmer-cle.titre': '¿Cambiar de clave?',
            'confirmer-cle.texte': 'La clave guardada se borrará de este navegador. Habrá que introducir otra para continuar.',
            'confirmer-suppression.titre': '¿Eliminar esta conversación?',
            'partage.titre': 'Compartir Albert Go',
            'partage.texte': 'Escanee el código QR o copie la dirección. Su clave no se comparte: cada cual usa la suya.',
            'partage.qr': 'Código QR de la dirección de Albert Go',
            'partage.adresse': 'Dirección de Albert Go',
            'partage.copier': 'Copiar',

            /* Acerca de. */
            'info.titre': 'Acerca de Albert Go',
            'info.intro': 'Albert Go permite charlar con <a href="https://albert.sites.beta.gouv.fr/" target="_blank" rel="noopener noreferrer">Albert</a>, la IA del Estado francés dirigida por la DINUM, con su propia clave API.',
            'info.donnees': 'Sus datos',
            'info.donnees.effacement': 'Por defecto, su clave, sus preguntas y sus conversaciones se borran al cerrar la pestaña. Puede desactivar esta opción en los ajustes. "Cambiar de clave", en el menú, borra la clave.',
            'info.donnees.relais': 'Sus preguntas pasan por un relé n8n interministerial, que no guarda nada, y van luego directamente a Albert API, alojado en Francia.',
            'info.donnees.fichiers': 'Un archivo de texto adjunto se lee en este navegador y se envía con su pregunta. Una imagen adjunta se envía a Albert para extraer su texto.',
            'info.donnees.traceurs': 'Ninguna cuenta, ninguna cookie, ninguna biblioteca cargada desde un sitio ajeno. La lectura en voz alta usa las voces del aparato, y las voces en línea solo si usted las permite.',
            'info.clavier': 'Teclado',
            'info.clavier.texte': 'Intro: enviar. Mayús+Intro: nueva línea. Flechas arriba y abajo: preguntas anteriores.',
            'info.reponses': 'Las respuestas',
            'info.reponses.texte': 'La IA puede equivocarse o inventar. Compruebe sus respuestas antes de usarlas, y no le confíe datos personales.',
            'info.projet': 'El proyecto',
            'info.projet.texte': 'Hecho por Olivier Booklage. <a href="https://forge.apps.education.fr/booklageolivier/albert-go" target="_blank" rel="noopener noreferrer">Código fuente en la Forge des communs numériques éducatifs</a>.',
            'info.version': 'Versión: ',
            'version.format': '{commit} del {date}',

            /* Respuestas. */
            'reponse.copier': 'Copiar la respuesta',
            'reponse.copier-code': 'Copiar el código',
            'reponse.telecharger-figure': 'Descargar la figura (SVG)',
            'reponse.telecharger-png': 'Descargar la imagen (PNG)',
            'reponse.erreur-diagramme': 'Diagrama no mostrado, error de Mermaid: ',
            'reponse.lire': 'Leer en voz alta',
            'reponse.arreter-lecture': 'Detener la lectura',
            'reponse.recherches': 'Ver las búsquedas {nom}',
            'reponse.note-recherche': 'Búsqueda: {mots}',
            'reponse.sources': 'Páginas consultadas: ',

            /* Mensajes. */
            'toast.adresse-copiee': 'Dirección copiada.',
            'toast.reponse-copiee': 'Respuesta copiada.',
            'toast.code-copie': 'Código copiado.',
            'toast.copie-refusee': 'El navegador ha rechazado la copia.',
            'toast.partage-impossible': 'Cambio imposible: los datos no caben en el nuevo almacenamiento.',
            'toast.conversation-supprimee': 'Conversación eliminada.',
            'toast.conversation-longue': 'Conversación demasiado larga para guardarla. Se queda en pantalla hasta cerrar la pestaña.',
            'toast.memoire-pleine': 'Memoria del navegador llena: {nombre} conversación(es) antigua(s) eliminada(s).',
            'toast.liens': 'Albert no abre los enlaces. Para una página web, pegue su texto o adjúntelo como archivo.',
            'toast.recherche-indisponible': 'La búsqueda no está disponible con este modelo.',
            'toast.voix-absente-en-ligne': 'Ninguna voz en {langue} disponible en este navegador.',
            'toast.voix-absente': 'Ninguna voz en {langue} instalada en este aparato. Las voces en línea no se usan.',
            'etat.reflechit': 'Albert está pensando...',
            'etat.redige': 'Albert está redactando...',
            'etat.proposition': 'Propuesta',
            'etat.relit': 'Albert está revisando...',
            'reponse.revoir': 'Revisar: reconstruir y comprobar',
            'anomalies.titre': 'Puntos que comprobar',
            'etat.annulee': 'Pregunta cancelada.',
            'etat.attendre-lecture': 'Espere a que termine la lectura del archivo.',
            'etat.lecture-image': 'Albert está leyendo la imagen...',
            'etat.recherche': 'Buscando "{mots}"...',

            /* Errores. */
            'erreur.cle-refusee': 'Clave rechazada por Albert. Compruébela o cámbiela.',
            'erreur.quota': 'Cuota alcanzada. Inténtelo dentro de un minuto.',
            'erreur.reponse-illisible': 'Respuesta ilegible de Albert. Inténtelo de nuevo.',
            'erreur.http': 'Error {status}.',
            'erreur.http-detail': 'Error {status}: {detail}',
            'erreur.relais': 'No se puede contactar con el relé n8n. Compruebe la conexión.',
            'erreur.timeout': 'Albert no responde. Inténtelo de nuevo.',
            'erreur.origine': 'El relé n8n no aceptará la dirección {origine}. Abra ',
            'erreur.consigne': 'Falta la consigna de la herramienta {outil}.',
            'erreur.format': 'Formato no admitido: solo imágenes y archivos de texto.',
            'erreur.fichier-long': 'Archivo demasiado largo: 200 kB como máximo.',
            'erreur.hors-cadre': 'Abrir Albert Go en su propia pestaña',

            /* Textos enviados al modelo. */
            'demande.reformuler': 'Reformula este texto:\n\n{texte}',
            'demande.rediger': 'Redacta una carta a partir de estas notas:\n\n{texte}',
            'demande.revoir': 'Notas:\n{notes}\n\nCarta que revisar:\n{proposition}\n\nCalendario (el primer día es hoy):\n{calendrier}',
            'demande.corriger': 'Corrige este texto:\n\n{texte}',
            'demande.traduire': 'Traduce este texto al {cible}:\n\n{texte}',
            'demande.traduire-source': 'Traduce este texto al {cible} (idioma de origen: {source}):\n\n{texte}',
            'demande.fichier': 'Contenido del archivo "{nom}":\n\n{texte}',
            'demande.image': 'Transcribe fielmente todo el texto visible en esta imagen, en Markdown. '
                + 'Escribe las fórmulas en LaTeX entre $. Si la imagen contiene una figura o un esquema, '
                + 'descríbelo en unas frases. No respondas nada más.',
            'recherche.description': 'Busca información y devuelve extractos con su fuente. '
                + 'Llámala para un dato que comprobar, una fecha, una cifra, una etimología, '
                + 'una noticia o una fuente que citar, y cada vez que responderías de memoria '
                + 'sobre un tema preciso. El buscador es {nom}: lo que recibes es todo lo que '
                + 'tienes, dilo si no basta.',
            'recherche.parametre': 'Las palabras que buscar.',
            'recherche.description-catalogue': 'Este buscador es un catálogo: solo devuelve un resultado si todas las palabras buscadas aparecen en él. Busca pues con dos o tres palabras clave, nunca con una frase.',
            'recherche.source-base': 'en {nom}',
            'recherche.source-web': 'en la web',
            'recherche.rappel': 'Dispones de la herramienta recherche_web: puedes buscar {source}, '
                + 'y lo dices si te lo preguntan. Úsala en cuanto una respuesta necesite un dato preciso '
                + 'que no estés seguro de saber.',
            'recherche.resultats': 'Resultados de búsqueda:\n{extraits}\n\nResponde ahora a la pregunta a partir de estos extractos. Cita cada dato con el número de su fuente entre corchetes, por ejemplo [1].',
            'recherche.aucun-mot': 'Ninguna palabra que buscar.',
            'recherche.aucun-resultat': 'Ningún resultado.',
            'recherche.impossible': 'Búsqueda imposible: {message}',
            'recherche.moteur-injoignable': '{nom} inalcanzable ({status}).',
            'recherche.moteur-refus': 'petición rechazada por {nom}.'
        },

        en: {
            /* Header and menu. */
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
            'module.discuter': 'Chat',
            'module.corriger': 'Proof',
            'module.reformuler': 'Style',
            'module.traduire': 'Trans',
            'invite.discuter': 'Ask your question...',
            'invite.reformuler': 'Paste the text to rephrase...',
            'invite.traduire': 'Paste the text to translate...',
            'invite.corriger': 'Paste the text to proofread...',
            'outil.rediger': 'Write',
            'module.rediger': 'Letter',
            'invite.rediger': 'Dear Mrs Smith... then your main ideas, one per line.',
            'notes.label': 'Letter notes',

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
            'reglages.carte-reponse': 'AI',
            'reglages.carte-application': 'App',
            'reglages.carte-donnees': 'Data',
            'reglages.modele': 'Model',
            'reglages.alias': 'Alias: {id}',
            'reglages.modele-reel': 'Model: {reel}',
            'reglages.temperature': 'Temperature',
            'reglages.precis': 'Precise',
            'reglages.creatif': 'Creative',
            'reglages.aide-temperature': 'Low: steady, factual answers. High: original answers, but the model makes things up more often.',
            'reglages.contexte': 'Context',
            'reglages.lecture': 'Read aloud',
            'reglages.voix-en-ligne': 'Allow online voices',
            'reglages.aide-voix': 'Used if no voice is installed for the language to be read. An external voice engine may collect and use the personal data of the conversation. Find out more before turning this option on.',
            'reglages.recherche': 'Search',
            'reglages.recherche-active': 'Plug the AI into:',
            'reglages.moteur': 'Search engine',
            'moteur.wikipedia': 'General encyclopedia',
            'moteur.data-gouv': 'French public data',
            'moteur.hal': 'French research publications',
            'moteur.internet-archive': 'Web archives, books and documents',
            'moteur.open-library': 'Books and editions',
            'moteur.openalex': 'Scientific publications worldwide',
            'moteur.vikidia': 'Encyclopedia for ages 8 to 13',
            'moteur.google': 'The whole web, key required, service being retired',
            'moteur.mojeek': 'The whole web, independent index, paid key',
            'reglages.cle-recherche': 'API key',
            'reglages.cx': 'Search engine ID',
            'reglages.aide-recherche': 'An external search engine may collect and use the data of the conversation. Find out more before turning this option on.',
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
            'reponse.copier-code': 'Copy the code',
            'reponse.telecharger-figure': 'Download the figure (SVG)',
            'reponse.telecharger-png': 'Download the image (PNG)',
            'reponse.erreur-diagramme': 'Diagram not shown, Mermaid error: ',
            'reponse.lire': 'Read aloud',
            'reponse.arreter-lecture': 'Stop reading',
            'reponse.recherches': 'Show the searches {nom}',
            'reponse.note-recherche': 'Search: {mots}',
            'reponse.sources': 'Pages consulted: ',

            /* Messages. */
            'toast.adresse-copiee': 'Address copied.',
            'toast.reponse-copiee': 'Answer copied.',
            'toast.code-copie': 'Code copied.',
            'toast.copie-refusee': 'The browser refused the copy.',
            'toast.partage-impossible': 'Change not possible: the data does not fit in the new storage.',
            'toast.conversation-supprimee': 'Conversation deleted.',
            'toast.conversation-longue': 'Conversation too long to be saved. It stays on screen until the tab closes.',
            'toast.memoire-pleine': 'Browser storage full: {nombre} old conversation(s) deleted.',
            'toast.liens': 'Albert does not open links. For a web page, paste its text or attach it as a file.',
            'toast.recherche-indisponible': 'Search is not available with this model.',
            'toast.voix-absente-en-ligne': 'No {langue} voice available in this browser.',
            'toast.voix-absente': 'No {langue} voice installed on this device. Online voices are not used.',
            'etat.reflechit': 'Albert is thinking...',
            'etat.redige': 'Albert is writing...',
            'etat.proposition': 'Draft',
            'etat.relit': 'Albert is reviewing...',
            'reponse.revoir': 'Review: rebuild and check',
            'anomalies.titre': 'Points to check',
            'etat.annulee': 'Question cancelled.',
            'etat.attendre-lecture': 'Wait until the file has been read.',
            'etat.lecture-image': 'Albert is reading the image...',
            'etat.recherche': 'Searching for "{mots}"...',

            /* Errors. */
            'erreur.cle-refusee': 'Key refused by Albert. Check it or change it.',
            'erreur.quota': 'Quota reached. Try again in a minute.',
            'erreur.reponse-illisible': 'Unreadable answer from Albert. Try again.',
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
            'demande.rediger': 'Write a letter from these notes:\n\n{texte}',
            'demande.revoir': 'Notes:\n{notes}\n\nLetter to review:\n{proposition}\n\nCalendar (the first day is today):\n{calendrier}',
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
                + 'precise subject. The engine is {nom}: what you get is all you have, say so '
                + 'if it is not enough.',
            'recherche.parametre': 'The words to search for.',
            'recherche.description-catalogue': 'This engine is a catalogue: it returns a result only if every word searched for appears in it. So search with two or three keywords, never with a sentence.',
            'recherche.source-base': 'in {nom}',
            'recherche.source-web': 'on the web',
            'recherche.rappel': 'You have the recherche_web tool: you can search {source}, '
                + 'and you say so if asked. Use it as soon as an answer needs a precise fact '
                + 'you are not sure you know.',
            'recherche.resultats': 'Search results:\n{extraits}\n\nNow answer the question from these extracts. Cite each fact with the number of its source in brackets, for example [1].',
            'recherche.aucun-mot': 'No words to search for.',
            'recherche.aucun-resultat': 'No result.',
            'recherche.impossible': 'Search failed: {message}',
            'recherche.moteur-injoignable': '{nom} unreachable ({status}).',
            'recherche.moteur-refus': 'request refused by {nom}.'
        },

        de: {
            /* Kopfzeile und Menü. */
            'menu.ouvrir': 'Menü',
            'menu.fermer': 'Menü schließen',
            'menu.resume': 'Einstellungen öffnen',
            'menu.nouvelle': 'Neues Gespräch',
            'menu.outils': 'Werkzeuge',
            'menu.historique': 'Gesprächsverlauf',
            'menu.reglages': 'Einstellungen',
            'menu.partager': 'Teilen',
            'menu.apropos': 'Über',
            'menu.changer-cle': 'Schlüssel wechseln',
            'historique.vide': 'Noch kein Gespräch.',
            'historique.supprimer': 'Löschen',
            'historique.supprimer-aria': 'Gespräch löschen: {titre}',

            /* Themen. */
            'theme.light': 'Helles Thema',
            'theme.dark': 'Dunkles Thema',
            'theme.system': 'Thema des Systems',
            'theme.light.aria': 'Helles Thema. Zum dunklen Thema wechseln.',
            'theme.dark.aria': 'Dunkles Thema. Zum Thema des Systems wechseln.',
            'theme.system.aria': 'Thema des Systems. Zum hellen Thema wechseln.',

            /* Werkzeuge. */
            'outil.discuter': 'Chatten',
            'outil.corriger': 'Korrigieren',
            'outil.reformuler': 'Umformulieren',
            'outil.traduire': 'Übersetzen',
            'module.discuter': 'Chat',
            'module.corriger': 'Ortho',
            'module.reformuler': 'Stil',
            'module.traduire': 'Übers',
            'invite.discuter': 'Stellen Sie Ihre Frage...',
            'invite.reformuler': 'Fügen Sie den umzuformulierenden Text ein...',
            'invite.traduire': 'Fügen Sie den zu übersetzenden Text ein...',
            'invite.corriger': 'Fügen Sie den zu korrigierenden Text ein...',
            'outil.rediger': 'Verfassen',
            'module.rediger': 'Brief',
            'invite.rediger': 'Sehr geehrte Frau Müller... dann Ihre Hauptgedanken, einer pro Zeile.',
            'notes.label': 'Notizen zum Brief',

            /* Sprachen von Übersetzen. */
            'langue.choisir': 'Sprache wechseln',
            'langue.auto': 'Automatisch',
            'langue.source': 'Ausgangssprache',
            'langue.cible': 'Zielsprache',
            'langue.fr': 'Französisch',
            'langue.en': 'Englisch',
            'langue.de': 'Deutsch',
            'langue.es': 'Spanisch',
            'langue.it': 'Italienisch',
            'langue.pt': 'Portugiesisch',
            'langue.nl': 'Niederländisch',
            'langue.ru': 'Russisch',
            'langue.zh': 'Chinesisch',
            'langue.ja': 'Japanisch',
            'langue.ar': 'Arabisch',
            'langue.la': 'Latein',

            /* Schlüsselbildschirm. */
            'cle.titre': 'Geben Sie Ihren Albert-Schlüssel ein',
            'cle.label': 'API-Schlüssel',
            'cle.stockee': 'Ihr Schlüssel bleibt in diesem Browser.<br/>Er läuft über den <a href="https://n8n.incubateur.education.gouv.fr" target="_blank" rel="noopener noreferrer">interministeriellen Inkubator</a>, der ihn nicht speichert.',
            'cle.enregistrer': 'Schlüssel speichern',
            'cle.demander': 'Noch keinen Schlüssel? <a href="https://albert.sites.beta.gouv.fr/access/" target="_blank" rel="noopener noreferrer">Zugang zu Albert beantragen</a>, nur für Beschäftigte des öffentlichen Dienstes.',
            'cle.verification': 'Schlüssel wird geprüft...',

            /* Eingabe. */
            'chat.aria': 'Gespräch',
            'saisie.label': 'Ihre Frage',
            'saisie.joindre': 'Ein Bild oder eine Textdatei anhängen',
            'saisie.precedente': 'Vorherige Frage',
            'saisie.suivante': 'Nächste Frage',
            'saisie.envoyer': 'Senden',
            'saisie.arreter': 'Anhalten',
            'saisie.avertissement': 'Eine KI kann sich irren: prüfen Sie ihre Antworten.',
            'piece.retirer': 'Datei entfernen',
            'piece.lecture': '{nom}: wird gelesen...',
            'piece.image-collee': 'eingefügtes Bild',
            'fichier.joint': 'Angehängte Datei: {nom}',
            'vous': 'Sie: ',
            'duree': '{secondes} s',

            /* Einstellungen. */
            'reglages.titre': 'Einstellungen',
            'reglages.conseil': 'Empfohlen: Modell Large, Temperatur 0,2, ganzes Gespräch gesendet.',
            'reglages.carte-reponse': 'KI',
            'reglages.carte-application': 'App',
            'reglages.carte-donnees': 'Daten',
            'reglages.modele': 'Modell',
            'reglages.alias': 'Alias: {id}',
            'reglages.modele-reel': 'Modell: {reel}',
            'reglages.temperature': 'Temperatur',
            'reglages.precis': 'Genau',
            'reglages.creatif': 'Kreativ',
            'reglages.aide-temperature': 'Niedrig: stabile, sachliche Antworten. Hoch: originelle Antworten, aber das Modell erfindet mehr.',
            'reglages.contexte': 'Kontext',
            'reglages.lecture': 'Vorlesen',
            'reglages.voix-en-ligne': 'Online-Stimmen erlauben',
            'reglages.aide-voix': 'Wird verwendet, wenn für die vorzulesende Sprache keine Stimme installiert ist. Eine externe Sprachausgabe kann die personenbezogenen Daten der Unterhaltung sammeln und verwerten. Informieren Sie sich, bevor Sie diese Option aktivieren.',
            'reglages.recherche': 'Suche',
            'reglages.recherche-active': 'Die KI verbinden mit:',
            'reglages.moteur': 'Suchmaschine',
            'moteur.wikipedia': 'Allgemeine Enzyklopädie',
            'moteur.data-gouv': 'Französische offene Daten',
            'moteur.hal': 'Französische Forschungspublikationen',
            'moteur.internet-archive': 'Webarchive, Bücher und Dokumente',
            'moteur.open-library': 'Bücher und Ausgaben',
            'moteur.openalex': 'Wissenschaftliche Publikationen weltweit',
            'moteur.vikidia': 'Enzyklopädie für 8- bis 13-Jährige',
            'moteur.google': 'Das gesamte Web, Schlüssel erforderlich, Dienst wird eingestellt',
            'moteur.mojeek': 'Das gesamte Web, unabhängiger Index, kostenpflichtiger Schlüssel',
            'reglages.cle-recherche': 'API-Schlüssel',
            'reglages.cx': 'ID der Suchmaschine',
            'reglages.aide-recherche': 'Eine externe Suchmaschine kann die Daten der Unterhaltung sammeln und verwerten. Informieren Sie sich, bevor Sie diese Option aktivieren.',
            'reglages.cle-note': 'In diesem Browser ist ein Schlüssel gespeichert.',
            'reglages.langue': 'Sprache',
            'reglages.conseilles': 'Empfohlene Einstellungen',
            'reglages.resume': '{modele}, Temperatur {temperature}, {contexte}',
            'contexte.sans': 'ohne Kontext',
            'contexte.complet': 'voller Kontext',
            'contexte.pourcent': 'Kontext {pourcent} %',
            'partage.actif': 'Beim Schließen des Tabs werden Schlüssel und Gespräche gelöscht.',
            'partage.inactif': 'Beim Schließen des Tabs bleiben Schlüssel und Gespräche erhalten.',
            'memoire.actif': 'An Albert gesendet: das ganze Gespräch.',
            'memoire.inactif': 'An Albert gesendet: nur eine Frage.',

            /* Modelle. */
            'modele.type.texte': 'Text',
            'modele.type.texte-images': 'Text und Bilder',
            'modele.openweight-medium': 'Ausgewogen zwischen Qualität und Tempo.',
            'modele.openweight-large': 'Das fähigste, für lange Überlegungen. Langsamer.',
            'modele.openweight-small': 'Das schnellste, für einfache Fragen.',
            'modele.openweight-code': 'Auf Programmierung spezialisiert.',
            'modele.openweight-code-2': 'Programmierung, sehr langer Kontext.',
            'modele.inconnu': 'Gesprächsmodell.',

            /* Dialoge. */
            'dialogue.fermer': 'Schließen',
            'dialogue.oui': 'Ja',
            'dialogue.non': 'Nein',
            'confirmer-cle.titre': 'Schlüssel wechseln?',
            'confirmer-cle.texte': 'Der gespeicherte Schlüssel wird aus diesem Browser gelöscht. Zum Weitermachen ist ein neuer nötig.',
            'confirmer-suppression.titre': 'Dieses Gespräch löschen?',
            'partage.titre': 'Albert Go teilen',
            'partage.texte': 'Scannen Sie den QR-Code oder kopieren Sie die Adresse. Ihr Schlüssel wird nicht geteilt: jeder nutzt seinen eigenen.',
            'partage.qr': 'QR-Code der Adresse von Albert Go',
            'partage.adresse': 'Adresse von Albert Go',
            'partage.copier': 'Kopieren',

            /* Über. */
            'info.titre': 'Über Albert Go',
            'info.intro': 'Mit Albert Go chatten Sie mit <a href="https://albert.sites.beta.gouv.fr/" target="_blank" rel="noopener noreferrer">Albert</a>, der KI des französischen Staates unter der DINUM, mit Ihrem eigenen API-Schlüssel.',
            'info.donnees': 'Ihre Daten',
            'info.donnees.effacement': 'Standardmäßig werden Ihr Schlüssel, Ihre Fragen und Ihre Gespräche beim Schließen des Tabs gelöscht. Sie können das in den Einstellungen abschalten. "Schlüssel wechseln" im Menü löscht den Schlüssel.',
            'info.donnees.relais': 'Ihre Fragen laufen über ein interministerielles n8n-Relais, das nichts speichert, und gehen dann direkt an Albert API, gehostet in Frankreich.',
            'info.donnees.fichiers': 'Eine angehängte Textdatei wird in diesem Browser gelesen und mit Ihrer Frage gesendet. Ein angehängtes Bild geht an Albert, um seinen Text zu gewinnen.',
            'info.donnees.traceurs': 'Kein Konto, kein Cookie, keine Bibliothek von einer fremden Seite. Das Vorlesen nutzt die Stimmen des Geräts, Online-Stimmen nur mit Ihrer Erlaubnis.',
            'info.clavier': 'Tastatur',
            'info.clavier.texte': 'Eingabe: senden. Umschalt+Eingabe: neue Zeile. Pfeil auf und ab: vorherige Fragen.',
            'info.reponses': 'Die Antworten',
            'info.reponses.texte': 'Die KI kann sich irren oder erfinden. Prüfen Sie ihre Antworten, bevor Sie sie nutzen, und geben Sie ihr keine personenbezogenen Daten.',
            'info.projet': 'Das Projekt',
            'info.projet.texte': 'Gemacht von Olivier Booklage. <a href="https://forge.apps.education.fr/booklageolivier/albert-go" target="_blank" rel="noopener noreferrer">Quellcode auf der Forge des communs numériques éducatifs</a>.',
            'info.version': 'Version: ',
            'version.format': '{commit} vom {date}',

            /* Antworten. */
            'reponse.copier': 'Antwort kopieren',
            'reponse.copier-code': 'Code kopieren',
            'reponse.telecharger-figure': 'Abbildung herunterladen (SVG)',
            'reponse.telecharger-png': 'Bild herunterladen (PNG)',
            'reponse.erreur-diagramme': 'Diagramm nicht angezeigt, Mermaid-Fehler: ',
            'reponse.lire': 'Vorlesen',
            'reponse.arreter-lecture': 'Vorlesen anhalten',
            'reponse.recherches': 'Die Suchen {nom} anzeigen',
            'reponse.note-recherche': 'Suche: {mots}',
            'reponse.sources': 'Aufgerufene Seiten: ',

            /* Meldungen. */
            'toast.adresse-copiee': 'Adresse kopiert.',
            'toast.reponse-copiee': 'Antwort kopiert.',
            'toast.code-copie': 'Code kopiert.',
            'toast.copie-refusee': 'Der Browser hat das Kopieren abgelehnt.',
            'toast.partage-impossible': 'Wechsel nicht möglich: die Daten passen nicht in den neuen Speicher.',
            'toast.conversation-supprimee': 'Gespräch gelöscht.',
            'toast.conversation-longue': 'Gespräch zu lang zum Speichern. Es bleibt am Bildschirm, bis der Tab geschlossen wird.',
            'toast.memoire-pleine': 'Browserspeicher voll: {nombre} alte(s) Gespräch(e) gelöscht.',
            'toast.liens': 'Albert öffnet keine Links. Bei einer Webseite den Text einfügen oder als Datei anhängen.',
            'toast.recherche-indisponible': 'Suche mit diesem Modell nicht verfügbar.',
            'toast.voix-absente-en-ligne': 'Keine Stimme für {langue} in diesem Browser verfügbar.',
            'toast.voix-absente': 'Keine Stimme für {langue} auf diesem Gerät installiert. Online-Stimmen werden nicht genutzt.',
            'etat.reflechit': 'Albert denkt nach...',
            'etat.redige': 'Albert schreibt...',
            'etat.proposition': 'Vorschlag',
            'etat.relit': 'Albert prüft...',
            'reponse.revoir': 'Überarbeiten: neu aufbauen und prüfen',
            'anomalies.titre': 'Zu prüfende Punkte',
            'etat.annulee': 'Frage abgebrochen.',
            'etat.attendre-lecture': 'Warten Sie, bis die Datei gelesen ist.',
            'etat.lecture-image': 'Albert liest das Bild...',
            'etat.recherche': 'Suche nach "{mots}"...',

            /* Fehler. */
            'erreur.cle-refusee': 'Schlüssel von Albert abgelehnt. Prüfen oder wechseln Sie ihn.',
            'erreur.quota': 'Kontingent erreicht. Versuchen Sie es in einer Minute erneut.',
            'erreur.reponse-illisible': 'Unlesbare Antwort von Albert. Versuchen Sie es erneut.',
            'erreur.http': 'Fehler {status}.',
            'erreur.http-detail': 'Fehler {status}: {detail}',
            'erreur.relais': 'Das n8n-Relais ist nicht erreichbar. Prüfen Sie die Verbindung.',
            'erreur.timeout': 'Albert antwortet nicht. Versuchen Sie es erneut.',
            'erreur.origine': 'Das n8n-Relais akzeptiert die Adresse {origine} nicht. Öffnen Sie ',
            'erreur.consigne': 'Die Systemanweisung des Werkzeugs {outil} fehlt.',
            'erreur.format': 'Format nicht unterstützt: nur Bilder und Textdateien.',
            'erreur.fichier-long': 'Datei zu lang: höchstens 200 kB.',
            'erreur.hors-cadre': 'Albert Go in einem eigenen Tab öffnen',

            /* An das Modell gesendete Texte. */
            'demande.reformuler': 'Formuliere diesen Text um:\n\n{texte}',
            'demande.rediger': 'Verfasse einen Brief aus diesen Notizen:\n\n{texte}',
            'demande.revoir': 'Notizen:\n{notes}\n\nZu überarbeitender Brief:\n{proposition}\n\nKalender (der erste Tag ist heute):\n{calendrier}',
            'demande.corriger': 'Korrigiere diesen Text:\n\n{texte}',
            'demande.traduire': 'Übersetze diesen Text ins {cible}:\n\n{texte}',
            'demande.traduire-source': 'Übersetze diesen Text ins {cible} (Ausgangssprache: {source}):\n\n{texte}',
            'demande.fichier': 'Inhalt der Datei "{nom}":\n\n{texte}',
            'demande.image': 'Übertrage getreu den gesamten sichtbaren Text dieses Bildes, in Markdown. '
                + 'Schreibe Formeln in LaTeX zwischen $. Enthält das Bild eine Abbildung oder ein Schema, '
                + 'beschreibe es in wenigen Sätzen. Antworte sonst nichts.',
            'recherche.description': 'Sucht eine Information und liefert Auszüge mit Quelle. '
                + 'Aufzurufen für einen zu prüfenden Fakt, ein Datum, eine Zahl, eine Etymologie, '
                + 'eine Nachricht oder eine zu zitierende Quelle, und jedes Mal, wenn du sonst aus '
                + 'dem Gedächtnis zu einem genauen Thema antworten würdest. Die Suchmaschine ist '
                + '{nom}: was du bekommst, ist alles, was du hast, sage es, wenn das nicht reicht.',
            'recherche.parametre': 'Die zu suchenden Wörter.',
            'recherche.description-catalogue': 'Diese Suchmaschine ist ein Katalog: Sie liefert nur dann ein Ergebnis, wenn alle gesuchten Wörter darin vorkommen. Suche also mit zwei oder drei Stichwörtern, nie mit einem Satz.',
            'recherche.source-base': 'in {nom}',
            'recherche.source-web': 'im Web',
            'recherche.rappel': 'Du verfügst über das Werkzeug recherche_web: du kannst {source} suchen, '
                + 'und du sagst es, wenn man dich fragt. Nutze es, sobald eine Antwort einen genauen Fakt '
                + 'braucht, den du nicht sicher kennst.',
            'recherche.resultats': 'Suchergebnisse:\n{extraits}\n\nBeantworte die Frage jetzt anhand dieser Auszüge. Belege jede Angabe mit der Nummer ihrer Quelle in eckigen Klammern, zum Beispiel [1].',
            'recherche.aucun-mot': 'Keine Wörter zum Suchen.',
            'recherche.aucun-resultat': 'Kein Ergebnis.',
            'recherche.impossible': 'Suche fehlgeschlagen: {message}',
            'recherche.moteur-injoignable': '{nom} nicht erreichbar ({status}).',
            'recherche.moteur-refus': 'Anfrage von {nom} abgelehnt.'
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
