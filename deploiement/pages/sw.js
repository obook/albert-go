// Une ancienne version en ligne gardait l'application en cache : ce service worker l'efface,
// se retire et recharge les onglets ouverts sur la version publiée.
'use strict';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (evenement) => evenement.waitUntil((async () => {
    await caches.delete('albert-go');
    await self.registration.unregister();
    for (const client of await self.clients.matchAll({ type: 'window' })) {
        client.navigate(client.url).catch(() => {});
    }
})()));
