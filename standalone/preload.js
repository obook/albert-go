// Zoom à la molette, langue du correcteur et ouverture du .env, transmis à main.js.
//
// Projet : Albert Go, https://github.com/obook/albert-go
// Licence : GPL-3.0-or-later
'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// Boîte "Aucune clé API" de la page (app.js) : ouvre le .env dans l'éditeur du système.
contextBridge.exposeInMainWorld('Application', { ouvrirEnv: () => ipcRenderer.send('ouvrir-env') });

window.addEventListener('wheel', (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    ipcRenderer.send('zoom-delta', e.deltaY < 0 ? 1 : -1);
}, { passive: false });

// <html lang>, posé par i18n.js.
window.addEventListener('DOMContentLoaded', () => {
    const html = document.documentElement;
    const envoyer = () => ipcRenderer.send('langue', html.lang);
    envoyer();
    new MutationObserver(envoyer).observe(html, { attributes: true, attributeFilter: ['lang'] });
});
