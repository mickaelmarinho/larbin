# Pistes de revenus

Écrit le 30 septembre 2026, avant tout travail de monétisation. **Rien n'est
codé** : ce document sert à trancher. L'ordre ne change pas : d'abord des
joueurs, ensuite l'argent. À zéro joueur, aucune de ces pistes ne rapporte
un centime.

Les montants sont des **ordres de grandeur prudents** pour un petit jeu de
cartes gratuit, pas des promesses. On les remplacera par nos vrais chiffres
dès qu'on en aura (les compteurs `/stats` donnent les visiteurs et les
parties).

## Une contrainte à connaître d'abord : l'hébergement

Le site est sur **Vercel, formule gratuite (Hobby)**, réservée à un usage
**non commercial**. D'après les règles de Vercel (*Fair Use Guidelines*, lues
le 30 sept. 2026) :

- **les dons sont autorisés** : « Asking for Donations does not fall under
  commercial usage » ;
- **la publicité et toute vente aux visiteurs sont interdites** en gratuit.
  Il faut alors passer en Pro (environ 20 $ par mois) ou déménager le site.

Le serveur de jeu (Northflank, formule gratuite) a ses propres conditions, à
relire avant toute vente.

## Les pistes

### 1. Un bouton « Soutenir le jeu » (dons) — la première à ouvrir

Un lien discret vers une page de dons (Ko-fi, Liberapay ou équivalent), en bas
de l'accueil et sur l'écran de fin de partie. Il ne débloque rien.

- **Ce que ça rapporte :** peu. Sur ce genre de jeu, une toute petite part des
  joueurs réguliers donne une fois, quelques euros. Pour 100 joueurs réguliers,
  compter de 0 à 15 € par mois.
- **Entretien :** presque nul. Une ligne de code, une page à tenir. Les frais
  de paiement (quelques %) sont prélevés sur les dons.
- **Seuil :** à partir d'environ 50 joueurs réguliers, c'est-à-dire des gens
  qui reviennent chaque semaine. Avant, le bouton ne fait que prendre de la
  place.
- **Coût de départ :** zéro. Permis sur Vercel gratuit. Mickaël ouvre le
  compte de dons à son nom : je ne peux pas créer de comptes.
- **Ce qui gâcherait le jeu :** un rappel qui s'impose (fenêtre qui s'ouvre
  toute seule, relance après chaque partie). Le bouton doit rester à sa place,
  sans jamais interrompre une partie.

### 2. Publier le jeu sur un portail de jeux (CrazyGames, Poki…)

Ces sites accueillent des jeux web gratuits, **amènent leurs propres
joueurs** et reversent une part de la publicité affichée *chez eux*, autour du
jeu. C'est la seule piste qui sert **aussi** à trouver des joueurs.

- **Ce que ça rapporte :** une part des revenus publicitaires du portail,
  proportionnelle aux parties jouées. C'est faible à petit volume, mais le
  portail fournit le public. Leurs conditions précises restent à lire.
- **Entretien :** moyen au départ, faible ensuite. Il faut intégrer leur
  petit module (début et fin de partie, pubs entre deux parties seulement) et
  passer leur relecture. Poki est très sélectif, CrazyGames plus ouvert.
- **Seuil :** aucun. Le portail apporte le volume. Mieux vaut quand même y
  arriver avec un jeu rodé par les premiers retours (voir `RETOURS.md`).
- **Coût de départ :** zéro. La pub s'affiche sur leur site, pas sur
  `larbin.vercel.app`, qui peut donc rester en gratuit. Point à vérifier dans
  leurs conditions.
- **Ce qui gâcherait le jeu :** une pub au milieu d'une manche. Seuls les
  écrans d'entre-deux parties sont acceptables. Il faut aussi que les salons
  entre amis continuent de marcher depuis le portail.

### 3. Un « pack soutien » cosmétique (dos de cartes, tapis, avatars)

Un achat unique (par exemple 3 €) qui débloque des dos de cartes, des tapis et
des avatars en plus. Il ne donne aucun avantage en partie. Les 12 avatars
libres, les tapis actuels et les avatars à gagner par les succès **restent
gratuits** : on ajoute, on ne retire rien.

- **Ce que ça rapporte :** davantage que les dons, parce qu'on reçoit
  quelque chose en échange. On peut compter sur 1 à 2 % des joueurs actifs qui
  l'achètent une fois. Pour 1 000 joueurs actifs par mois, cela fait de 30 à
  60 € la première fois, puis le flux des nouveaux venus.
- **Entretien :** réel.
  - Il faut un paiement (via un vendeur qui gère la TVA européenne pour nous,
    type Paddle ou Lemon Squeezy, contre environ 5 % de frais) et le lien avec
    les comptes, qui existent déjà.
  - Il faut dessiner de nouveaux cosmétiques et gérer le support
    (« j'ai payé et je ne vois rien »).
  - Des ventes régulières demandent aussi un statut déclaré (micro-entreprise)
    côté Mickaël.
- **Seuil :** environ 1 000 joueurs actifs par mois. En dessous, les 20 $
  mensuels de Vercel Pro (ou un déménagement) et l'entretien coûtent plus
  qu'ils ne rapportent.
- **Coût de départ :** pas zéro. La vente oblige à quitter Vercel gratuit.
  C'est pour ça qu'elle vient en troisième.
- **Ce qui gâcherait le jeu :** tout ce qui ressemble à un avantage payant, ou
  des cartes qu'on lit moins bien, ou une incitation insistante. Retirer des
  cosmétiques gratuits pour les rendre payants serait pire encore.

### 4. De la pub sur notre propre site (AdSense…) — déconseillé

- **Ce que ça rapporte :** très peu. Quelques euros pour mille pages vues, en
  France. Pour 3 000 visites par mois, cela fait moins de 10 € par mois.
- **Entretien :** faible techniquement. En revanche, la pub personnalisée
  oblige à afficher un **bandeau de consentement aux cookies**. Or le jeu n'en
  a pas aujourd'hui : c'est un de ses atouts, écrit sur la page
  Confidentialité.
- **Seuil :** plusieurs dizaines de milliers de visites par mois avant de
  couvrir Vercel Pro, obligatoire pour afficher de la pub.
- **Coût de départ :** 20 $ par mois (Vercel Pro), soit un coût tout de
  suite pour un gain faible.
- **Ce qui gâcherait le jeu :** tout le reste. Une pub sur un écran de
  téléphone mange la place des cartes, ralentit la page et fait fuir les
  nouveaux venus, alors que ce sont eux qu'on cherche à garder.

## Ce que je recommande

1. **Maintenant :** rien. On fait venir des joueurs (octobre) et on note
   leurs retours.
2. **Vers 50 joueurs réguliers :** le bouton de dons. Coût nul, permis
   partout, rien à défaire si ça ne donne rien.
3. **Quand les retours seront stabilisés :** tenter un portail, en
   commençant par CrazyGames. C'est un canal d'acquisition qui rapporte un
   peu, sans toucher à notre site.
4. **Vers 1 000 joueurs actifs par mois :** le pack cosmétique, avec le
   passage en Pro payé par les premiers revenus, comme le nom de domaine.
5. **La pub sur notre site :** non, sauf changement d'échelle.

**Règle constante :** jamais de pay-to-win, jamais de pub pendant une manche,
et rien de ce qui est gratuit aujourd'hui ne devient payant.
