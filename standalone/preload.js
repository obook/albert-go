// Zoom à la molette et langue du correcteur, transmis à main.js.
//
// Projet : Albert Go, https://forge.apps.education.fr/booklageolivier/albert-go
// Licence : GPL-3.0-or-later
'use strict';

const { ipcRenderer } = require('electron');

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
