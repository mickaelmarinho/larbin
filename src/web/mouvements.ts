/**
 * Les cartes en mouvement.
 *
 * L'écran se redessine d'un bloc à chaque changement : sans rien d'autre, une
 * carte posée disparaît de la main et réapparaît sur le tapis. Ici, on relève
 * où étaient les choses avant de redessiner, et on les fait glisser de là
 * jusqu'à leur nouvelle place — la carte part vraiment de la main qui la joue,
 * le pli s'en va vers celui qui l'a gagné, la main se resserre.
 *
 * Rien de tout cela ne change le jeu : si le navigateur ne sait pas animer, ou
 * si le joueur a demandé moins de mouvement à son appareil, tout se pose d'un
 * coup, comme avant.
 */

const moinsDeMouvement = typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null;

/** Peut-on animer ? Non, si l'appareil demande le calme ou ne sait pas faire. */
export const enMouvement = (): boolean =>
  typeof Element !== 'undefined' && 'animate' in Element.prototype && !moinsDeMouvement?.matches;

const ELAN = 'cubic-bezier(.2, .85, .3, 1.08)';
const DOUX = 'cubic-bezier(.3, .7, .3, 1)';

/** Où sont les cartes d'une zone, par identifiant — à relever avant de la redessiner. */
export function placesDesCartes(zone: HTMLElement): Map<string, DOMRect> {
  const places = new Map<string, DOMRect>();
  for (const carte of zone.querySelectorAll<HTMLElement>('.carte[data-id]')) {
    places.set(carte.dataset.id!, carte.getBoundingClientRect());
  }
  return places;
}

/** Le déplacement qui ramène `ici` sur `depuis` : de quoi partir de l'ancienne place. */
function ecart(ici: DOMRect, depuis: DOMRect): string {
  const dx = depuis.left + depuis.width / 2 - (ici.left + ici.width / 2);
  const dy = depuis.top + depuis.height / 2 - (ici.top + ici.height / 2);
  return `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)`;
}

/**
 * Une carte arrive sur le tapis depuis `depuis` — sa place dans la main, ou le
 * paquet de l'adversaire qui la joue, plus petit : elle grandit en chemin.
 */
export function poser(carte: HTMLElement, depuis: DOMRect, rang: number): void {
  if (!enMouvement()) return;
  const ici = carte.getBoundingClientRect();
  const echelle = Math.min(1, Math.max(0.3, depuis.height / ici.height));
  carte.animate([
    { transform: `${ecart(ici, depuis)} scale(${echelle.toFixed(2)}) rotate(${rang % 2 ? 7 : -7}deg)`, opacity: echelle < 1 ? 0.5 : 1 },
    { transform: 'none', opacity: 1 },
  ], { duration: 340, delay: rang * 55, easing: ELAN, fill: 'backwards' });
}

/**
 * Les cartes qui quittent le tapis. On en laisse une copie le temps du geste :
 * vers `vers`, quand quelqu'un ramasse le pli ; sur place, quand le coup
 * suivant vient simplement les recouvrir.
 */
export function emporter(cartes: HTMLElement[], vers: DOMRect | null): void {
  if (!enMouvement()) return;
  cartes.forEach((carte, i) => {
    const place = carte.getBoundingClientRect();
    if (place.width === 0) return;
    const copie = carte.cloneNode(true) as HTMLElement;
    copie.removeAttribute('data-id');
    copie.classList.add('fantome');
    // Les cartes d'une série close sont assombries par leur zone : la copie garde leur teinte.
    copie.style.filter = getComputedStyle(carte).filter;
    Object.assign(copie.style, {
      position: 'fixed', left: `${place.left}px`, top: `${place.top}px`,
      width: `${place.width}px`, height: `${place.height}px`, margin: '0', pointerEvents: 'none', zIndex: '4',
    });
    document.body.appendChild(copie);
    const geste = vers
      ? copie.animate([
        { transform: 'none', opacity: 1 },
        { transform: `${ecart(place, vers)} scale(.4) rotate(${i % 2 ? -14 : 14}deg)`, opacity: 0 },
      ], { duration: 420, delay: 60 + i * 30, easing: DOUX, fill: 'forwards' })
      : copie.animate([
        { transform: 'none', opacity: 1 },
        { transform: 'scale(.94)', opacity: 0 },
      ], { duration: 260, easing: DOUX, fill: 'forwards' });
    const retirer = () => copie.remove();
    geste.finished.then(retirer, retirer);
  });
}

/**
 * La main redessinée : les cartes déjà là glissent de leur ancienne place à la
 * nouvelle, et une donne se distribue carte après carte depuis `paquet`.
 */
export function replacerLaMain(zone: HTMLElement, avant: Map<string, DOMRect>, paquet: DOMRect | null): void {
  if (!enMouvement()) return;
  const cartes = [...zone.querySelectorAll<HTMLElement>('.carte[data-id]')];
  const nouvelles = cartes.filter((c) => !avant.has(c.dataset.id!));
  // Une donne : presque toute la main est neuve. Quelques cartes reçues d'un
  // échange ne font pas une distribution.
  const donne = paquet !== null && nouvelles.length >= 4;
  cartes.forEach((carte, i) => {
    const ici = carte.getBoundingClientRect();
    const ancienne = avant.get(carte.dataset.id!);
    if (ancienne) {
      const dx = ancienne.left - ici.left;
      const dy = ancienne.top - ici.top;
      if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
      // « add » : le déplacement s'ajoute au soulèvement d'une carte choisie.
      carte.animate([{ transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px)` }, { transform: 'translate(0, 0)' }],
        { duration: 200, easing: DOUX, composite: 'add' });
      return;
    }
    if (!donne) return;
    carte.animate([
      { transform: `${ecart(ici, paquet)} scale(.5) rotate(${(i % 3 - 1) * 12}deg)`, opacity: 0 },
      { transform: 'none', opacity: 1 },
    ], { duration: 360, delay: i * 45, easing: ELAN, fill: 'backwards' });
  });
}
