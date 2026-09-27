/**
 * Le jour qu'il est à Paris (AAAA-MM-JJ) : c'est là que vit le jeu, et que
 * minuit tombe — pour les compteurs du serveur comme pour le défi du jour.
 */
export const jourDeParis = (date = new Date()): string =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(date);
