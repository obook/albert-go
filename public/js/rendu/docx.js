/*
 * rendu/docx.js
 * Réponse affichée enregistrée en fichier Word (.docx), sans bibliothèque.
 *
 * Complète l'objet Rendu de rendu.js, chargé avant.
 *
 * Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
 * Auteur : O. Booklage
 * Date : Octobre 2026
 * Licence : Licence Ouverte 2.0 (Etalab), SPDX etalab-2.0
 */
'use strict';

Object.assign(Rendu, {
    /**
     * Somme de contrôle CRC-32 d'un fichier du zip.
     *
     * @param {Uint8Array} octets - Contenu.
     * @returns {number} CRC-32, entier non signé.
     */
    crc32(octets) {
        this._crc ??= Array.from({ length: 256 }, (_, n) => {
            for (let k = 0; k < 8; k++) {
                n = n & 1 ? 0xEDB88320 ^ (n >>> 1) : n >>> 1;
            }
            return n >>> 0;
        });
        let crc = 0xFFFFFFFF;
        for (const octet of octets) {
            crc = this._crc[(crc ^ octet) & 0xFF] ^ (crc >>> 8);
        }
        return (crc ^ 0xFFFFFFFF) >>> 0;
    },

    /**
     * Archive zip sans compression.
     *
     * @param {{nom: string, octets: Uint8Array}[]} fichiers - Fichiers, dans l'ordre de l'archive.
     * @returns {Uint8Array} Archive.
     */
    zip(fichiers) {
        /* ponytail: fichiers stockés tels quels ; CompressionStream('deflate-raw') si le poids gêne. */
        const encodeur = new TextEncoder();
        const morceaux = [];
        const repertoire = [];
        let adresse = 0;
        for (const fichier of fichiers) {
            const nom = encodeur.encode(fichier.nom);
            /* Champs communs à l'en-tête local et au répertoire : version 2.0, noms en UTF-8, 1er janvier 1980. */
            const commun = new DataView(new ArrayBuffer(26));
            commun.setUint16(0, 20, true);
            commun.setUint16(2, 0x0800, true);
            commun.setUint16(8, 0x0021, true);
            commun.setUint32(10, this.crc32(fichier.octets), true);
            commun.setUint32(14, fichier.octets.length, true);
            commun.setUint32(18, fichier.octets.length, true);
            commun.setUint16(22, nom.length, true);
            const local = new Uint8Array(30 + nom.length);
            new DataView(local.buffer).setUint32(0, 0x04034b50, true);
            local.set(new Uint8Array(commun.buffer), 4);
            local.set(nom, 30);
            const central = new Uint8Array(46 + nom.length);
            const vue = new DataView(central.buffer);
            vue.setUint32(0, 0x02014b50, true);
            vue.setUint16(4, 20, true);
            central.set(new Uint8Array(commun.buffer), 6);
            vue.setUint32(42, adresse, true);
            central.set(nom, 46);
            morceaux.push(local, fichier.octets);
            repertoire.push(central);
            adresse += local.length + fichier.octets.length;
        }
        const tailleRepertoire = repertoire.reduce((somme, entree) => somme + entree.length, 0);
        const fin = new DataView(new ArrayBuffer(22));
        fin.setUint32(0, 0x06054b50, true);
        fin.setUint16(8, fichiers.length, true);
        fin.setUint16(10, fichiers.length, true);
        fin.setUint32(12, tailleRepertoire, true);
        fin.setUint32(16, adresse, true);
        const archive = new Uint8Array(adresse + tailleRepertoire + 22);
        let position = 0;
        for (const morceau of [...morceaux, ...repertoire, new Uint8Array(fin.buffer)]) {
            archive.set(morceau, position);
            position += morceau.length;
        }
        return archive;
    }
});
