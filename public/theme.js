// Chargé dans <head> pour appliquer le thème mémorisé avant le premier affichage.
try {
    const theme = localStorage.getItem('albert-go.theme');
    if (theme) document.documentElement.dataset.theme = theme;
} catch (e) { /* thème du système */ }
