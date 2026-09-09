/**
 * L'arène : fait s'affronter deux stratégies de bot et dit laquelle gagne —
 * ou, plus souvent, qu'on ne peut pas conclure.
 *
 *   node scripts/arene.mjs [parties]
 *
 * Le piège de l'exercice est de mesurer du bruit et d'y croire. Deux garde-fous
 * pour l'éviter :
 *
 *  - **les places tournent.** Le Larbin n'est pas symétrique : celui qui ouvre
 *    la première manche, celui qui coupe, celui qui reçoit les cartes du Larbin
 *    ne jouent pas le même jeu. On fait donc tourner les stratégies autour de
 *    la table, une partie sur deux, pour que chacune passe autant de temps à
 *    chaque place.
 *
 *  - **on affiche l'intervalle de confiance.** Un écart plus petit que la marge
 *    d'erreur n'est pas un progrès, c'est une pièce qu'on relance. Le verdict
 *    le dit en toutes lettres.
 */
import { apply, createGame, viewFor } from '../src/engine/game.ts';
import { botAction } from '../src/engine/bot.ts';
import { botAction as botCandidat } from '../src/engine/bot-candidat.ts';

const PARTIES = Number(process.argv[2]) || 2000;
/**
 * Étalonnage : le témoin contre lui-même. Le banc doit alors conclure « indécis ».
 * S'il désigne un vainqueur, c'est le banc qui est biaisé, pas les bots.
 */
const CALIBRAGE = process.argv.includes('--calibrage');
/**
 * D'où partent les donnes. Deux exécutions à la même graine voient les mêmes
 * mains — mais pas forcément les mêmes parties : les bots tirent la coupe au
 * hasard, et ce hasard-là n'est pas semé. `--graine=N` déplace franchement
 * l'échantillon, pour répliquer une mesure plutôt que la relire.
 */
const GRAINE = Number(process.argv.find((a) => a.startsWith('--graine='))?.slice(9)) || 1000;
/** Plusieurs séries indépendantes valent mieux qu'une longue : voir plus bas. */
const SERIES = Number(process.argv.find((a) => a.startsWith('--series='))?.slice(9)) || 3;
const candidat = CALIBRAGE ? botAction : botCandidat;

/** Deux d'un côté, deux de l'autre : la table reste équilibrée. */
const PLACES = ['a', 'b', 'c', 'd'];

/**
 * Joue une partie entière et rend les points de chacun. `camps` dit quelle
 * stratégie tient quelle place.
 */
function partie(camps, graine) {
  let etat = createGame(PLACES.map((id) => ({ id, name: id, isBot: true })), graine);

  // Une partie mal engagée ne doit pas bloquer le banc : on borne les tours.
  for (let tour = 0; tour < 20000; tour++) {
    if (etat.phase === 'fin-de-partie') break;

    if (etat.phase === 'fin-de-manche') {
      etat = apply(etat, { type: 'manche-suivante' });
      continue;
    }

    const acteur = etat.phase === 'coupe'
      ? etat.players.find((p) => p.role === 'boss').id
      : etat.order[etat.turn];

    const coup = camps[acteur](viewFor(etat, acteur));
    if (!coup) throw new Error(`${acteur} ne sait pas quoi jouer (phase ${etat.phase})`);
    etat = apply(etat, coup);
  }

  return Object.fromEntries(etat.players.map((p) => [p.id, p.points]));
}

/** Marge d'erreur à 95 % sur une proportion. */
function marge(part, n) {
  return 1.96 * Math.sqrt((part * (1 - part)) / n) * 100;
}

/**
 * Une série de parties sur un jeu de donnes donné. Plusieurs séries valent
 * mieux qu'une longue : elles montrent la dispersion réelle, qui s'avère plus
 * large que la marge binomiale ne le laisse croire.
 */
function serie(PARTIES, GRAINE) {
  let victoiresCandidat = 0;
  let pointsCandidat = 0;
  let pointsTemoin = 0;
  let egalites = 0;

  for (let i = 0; i < PARTIES; i++) {
    // Une partie sur deux, les stratégies échangent leurs places.
    const inverse = i % 2 === 1;
    const camps = {};
    // En étalonnage les deux camps sont la même fonction : on retient donc les
    // places, et non l'identité de la stratégie, pour savoir qui est qui.
    const placesCandidat = new Set();
    PLACES.forEach((place, index) => {
      const auCandidat = (index % 2 === 0) !== inverse;
      camps[place] = auCandidat ? candidat : botAction;
      if (auCandidat) placesCandidat.add(place);
    });

    const points = partie(camps, GRAINE + i * 7);

    for (const place of PLACES) {
      if (placesCandidat.has(place)) pointsCandidat += points[place];
      else pointsTemoin += points[place];
    }

    // Le vainqueur de la partie est celui qui a le plus de points.
    const meilleur = Math.max(...Object.values(points));
    const gagnants = PLACES.filter((p) => points[p] === meilleur);
    const camp = new Set(gagnants.map((p) => (placesCandidat.has(p) ? 'candidat' : 'témoin')));
    if (camp.size > 1) egalites += 1;
    else if (camp.has('candidat')) victoiresCandidat += 1;
  }

  return { decisives: PARTIES - egalites, victoiresCandidat, pointsCandidat, pointsTemoin };
}

function main() {
  const entete = CALIBRAGE ? ' — ÉTALONNAGE : le témoin contre lui-même' : '';
  console.log(`\nArène — ${SERIES} × ${PARTIES} parties, places alternées${entete}\n`);

  let decisives = 0;
  let victoires = 0;
  let pointsCandidat = 0;
  let pointsTemoin = 0;

  for (let s = 0; s < SERIES; s++) {
    // Chaque série tire ses donnes ailleurs : ce sont des échantillons
    // indépendants, pas trois lectures du même.
    const r = serie(PARTIES, GRAINE + s * 1_000_003);
    decisives += r.decisives;
    victoires += r.victoiresCandidat;
    pointsCandidat += r.pointsCandidat;
    pointsTemoin += r.pointsTemoin;

    const taux = (r.victoiresCandidat / r.decisives) * 100;
    console.log(`  série ${s + 1} : ${taux.toFixed(1)} % `
      + `± ${marge(taux / 100, r.decisives).toFixed(1)}  (${r.decisives} parties décisives)`);
  }

  const part = victoires / decisives;
  const m = marge(part, decisives);
  const ecart = part * 100 - 50;

  console.log(`\n  Ensemble — ${decisives} parties décisives`);
  console.log(`  taux           : ${(part * 100).toFixed(1)} % ± ${m.toFixed(1)}`);
  console.log(`  points cumulés : candidat ${pointsCandidat} / témoin ${pointsTemoin}`);

  const verdict = Math.abs(ecart) <= m
    ? 'Indécis : l’écart tient dans la marge d’erreur. Ce n’est pas un progrès.'
    : ecart > 0
      ? `Le candidat est meilleur : +${ecart.toFixed(1)} points de pourcentage.`
      : `Le candidat est moins bon : ${ecart.toFixed(1)} points de pourcentage.`;
  console.log(`\n  ${verdict}\n`);
}

main();
