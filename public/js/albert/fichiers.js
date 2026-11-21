/*
 * albert/fichiers.js
 * Lecture des fichiers joints : image lue par le modèle de vision, enregistrement
 * transcrit, son converti en WAV, formules d'un .odt ou d'un .docx remises en texte.
 *
 * piece-jointe.js ouvre le fichier et appelle ces fonctions pour en tirer un texte,
 * envoyé avec la question ou gardé dans la bibliothèque.
 * Complète l'objet Albert d'albert.js, chargé avant lui.
 *
 * Projet : Albert Go, https://github.com/obook/albert-go
 * Auteur : O. Booklage
 * Date : Novembre 2026
 * Licence : GPL-3.0-or-later
 */
'use strict';

Object.assign(Albert, {
    /* Modèle qui lit les images (annuaire BidouIAge, 1er août 2026). */
    MODELE_VISION: 'openweight-medium',

    /** Modèle de transcription audio (whisper). */
    MODELE_AUDIO: 'openweight-audio',

    /**
     * Fait lire une image par le modèle de vision.
     *
     * @param {string} dataUrl - Image en data URL (JPEG).
     * @param {AbortSignal} annulation - Signal pour abandonner la lecture.
     * @returns {Promise<string>} Texte trouvé dans l'image.
     */
    transcrire(dataUrl, annulation) {
        return this.repondre({
            model: this.MODELE_VISION,
            temperature: 0,
            messages: [{ role: 'user', content: [
                { type: 'text', text: t('demande.image') },
                { type: 'image_url', image_url: { url: dataUrl } }
            ] }]
        }, annulation).then(r => r.texte);
    },

    /**
     * Texte des segments de diarized_json : un tour de parole par ligne s'il y a plusieurs voix.
     *
     * Le champ text de la réponse colle alors les phrases sans espace : on repart des segments.
     *
     * @param {Array<{speaker: ?string, text: string}>} [segments] - Segments de la réponse.
     * @returns {string} Vide sans segments ; d'un seul bloc pour une voix ou un locuteur inconnu.
     */
    texteParLocuteur(segments) {
        if (!Array.isArray(segments)) {
            return '';
        }
        const locuteurs = [...new Set(segments.map(s => s.speaker))];
        if (locuteurs.length < 2 || segments.some(s => !s.speaker)) {
            return segments.map(s => s.text.trim()).join(' ');
        }
        const tours = [];
        for (const { speaker, text } of segments) {
            const dernier = tours.at(-1);
            if (dernier && dernier.speaker === speaker) {
                dernier.texte += ' ' + text.trim();
            } else {
                tours.push({ speaker, texte: text.trim() });
            }
        }
        return tours.map(tour => t('audio.tour', { n: locuteurs.indexOf(tour.speaker) + 1, texte: tour.texte })).join('\n');
    },

    /**
     * Fait transcrire un enregistrement par le modèle audio.
     *
     * @param {Blob} audio - Enregistrement MP3 ou WAV.
     * @param {string} nom - Nom du fichier, avec son extension.
     * @param {AbortSignal} annulation - Signal pour abandonner la lecture.
     * @returns {Promise<string>} Texte entendu, par locuteur s'il y a plusieurs voix.
     * @throws {Error} Si Albert refuse l'enregistrement.
     */
    async transcrireAudio(audio, nom, annulation) {
        const formulaire = new FormData();
        formulaire.append('file', audio, nom);
        formulaire.append('model', this.MODELE_AUDIO);
        formulaire.append('response_format', 'diarized_json');
        const res = await fetch(this.BASE + '/audio/transcriptions', {
            method: 'POST',
            headers: this.entetes(),
            body: formulaire,
            signal: AbortSignal.any([annulation, AbortSignal.timeout(this.DELAI_MS)])
        });
        const corps = await res.json().catch(() => null);
        if (!res.ok) {
            throw new Error(this.messageErreur(res.status, corps));
        }
        if (!corps || typeof corps.text !== 'string') {
            throw new Error(t('erreur.reponse-illisible'));
        }
        return this.texteParLocuteur(corps.segments) || corps.text;
    },

    /**
     * Fichier WAV (PCM 16 bits, mono) à partir d'échantillons entre -1 et 1.
     *
     * @param {Float32Array} echantillons - Son mono.
     * @param {number} taux - Fréquence d'échantillonnage, en hertz.
     * @returns {ArrayBuffer} Contenu du fichier.
     */
    wav(echantillons, taux) {
        const vue = new DataView(new ArrayBuffer(44 + echantillons.length * 2));
        const texte = (position, mot) => [...mot].forEach((c, i) => vue.setUint8(position + i, c.charCodeAt(0)));
        texte(0, 'RIFF');
        vue.setUint32(4, 36 + echantillons.length * 2, true);
        texte(8, 'WAVEfmt ');
        vue.setUint32(16, 16, true);
        /* Format 1 (PCM), 1 canal, taux, octets par seconde, octets par échantillon, bits. */
        vue.setUint16(20, 1, true);
        vue.setUint16(22, 1, true);
        vue.setUint32(24, taux, true);
        vue.setUint32(28, taux * 2, true);
        vue.setUint16(32, 2, true);
        vue.setUint16(34, 16, true);
        texte(36, 'data');
        vue.setUint32(40, echantillons.length * 2, true);
        echantillons.forEach((x, i) => vue.setInt16(44 + i * 2, Math.max(-1, Math.min(1, x)) * 0x7fff, true));
        return vue.buffer;
    },

    /**
     * Texte d'un objet formule d'un .odt, à remettre dans le texte du document.
     *
     * @param {string} xml - Contenu de l'objet : MathML et annotations.
     * @returns {string} "$...$" si la source LaTeX y est, "[formule : ...]" pour l'écriture de LibreOffice, '' sinon.
     */
    formuleOdt(xml) {
        const lire = (encodage) => {
            const trouve = new RegExp('<annotation[^>]*encoding="' + encodage + '"[^>]*>([^<]*)</annotation>').exec(xml);
            return trouve ? trouve[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&').trim() : '';
        };
        /* ponytail: l'écriture StarMath de LibreOffice passe telle quelle ; la convertir en LaTeX si le modèle la lit mal. */
        const tex = lire('application/x-tex');
        const starmath = lire('StarMath 5.0');
        if (tex) {
            return '$' + tex + '$';
        }
        if (starmath) {
            return '[formule : ' + starmath + ']';
        }
        return '';
    },

    /**
     * Équation Word en texte : fractions, puissances, indices et racines restent lisibles.
     *
     * @param {Node} noeud - m:oMath ou l'un de ses descendants.
     * @returns {string} Texte de l'équation.
     */
    texteOmml(noeud) {
        let texte = '';
        for (const enfant of noeud.childNodes) {
            const nom = enfant.localName || '';
            const partie = (balise) => {
                const trouve = [...enfant.childNodes].find((c) => c.localName === balise);
                return trouve ? this.texteOmml(trouve) : '';
            };
            if (nom === 't') {
                texte += enfant.textContent;
            } else if (nom === 'f') {
                texte += '(' + partie('num') + ')/(' + partie('den') + ')';
            } else if (nom === 'sSup') {
                texte += partie('e') + '^(' + partie('sup') + ')';
            } else if (nom === 'sSub') {
                texte += partie('e') + '_(' + partie('sub') + ')';
            } else if (nom === 'sSubSup') {
                texte += partie('e') + '_(' + partie('sub') + ')^(' + partie('sup') + ')';
            } else if (nom === 'rad') {
                texte += 'racine(' + partie('e') + ')';
            } else if (enfant.nodeType === 1 && !nom.endsWith('Pr')) {
                /* Les propriétés (fPr, rPr...) ne portent pas de texte. */
                texte += this.texteOmml(enfant);
            }
        }
        return texte;
    }
});
