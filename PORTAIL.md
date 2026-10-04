# Le Larbin chez un portail de jeux

Un portail (CrazyGames, et d'autres sur le même modèle) héberge des jeux web
gratuits et **amène son propre public**. C'est le seul canal qui fait venir des
joueurs sans passer par notre entourage ni par Google.

`npm run build` fabrique le dossier **`portail/`** : une seule page,
`index.html`, autonome. C'est elle qu'on dépose chez le portail.

## Ce que la version portail change

Le jeu est le même. Seul ce que les portails interdisent disparaît :

- **Langue :** celle du navigateur — français pour un navigateur en français,
  anglais pour tous les autres. Pour relire l'une ou l'autre : `?lang=fr`,
  `?lang=en`.
- **Pas de compte** ni de classement des comptes : les portails refusent les
  connexions maison. On joue sous un nom, comme un visiteur.
- **Pas de lien vers notre site** (règles, contact, partage, autre langue).
  Seul reste le lien « Confidentialité », que les portails autorisent.
- **Salon entre amis :** on donne le **code** à quatre lettres, plus de lien
  d'invitation — la page n'a pas d'adresse à nous.
- **Pas d'installation** sur l'écran d'accueil, pas de copie hors ligne.
- Le nom « Trou du cul » (et *Asshole*) n'apparaît pas : public dès 12 ans.
- Les fenêtres larges et basses des portails sont lisibles (cartes réglées sur
  la hauteur), vérifié en 800×450, 821×462, 907×510 et 1216×684.

Le jeu en ligne, les bots, le défi du jour et son classement, les succès, le
didacticiel et la musique sont là. Les parties se jouent sur notre serveur,
avec les joueurs du site : un joueur du portail et un joueur de
larbin.vercel.app peuvent s'asseoir à la même table.

Les visites venues d'un portail se lisent dans les compteurs, colonne
« dont chez un portail ».

## Ce que CrazyGames demande (lu le 3 octobre 2026)

Deux paliers :

- **Basic Launch** — le jeu est mis en ligne tel quel, sans leur module. Pas de
  publicité, donc **pas de revenus**, mais des joueurs. C'est notre cible.
- **Full Launch** — avec leur module (début et fin de partie, publicité entre
  deux parties, compte CrazyGames). C'est là que le partage des revenus
  commence. On n'y travaillera que si le Basic Launch amène du monde.

Ce que leur documentation dit, lu les 3 et 4 octobre 2026 sur
docs.crazygames.com (pages *Requirements* et *FAQ*) — rien ici n'est supposé :

- **Pas d'exclusivité.** « You can publish on CrazyGames even if your game is
  already live on other platforms », et publier ailleurs ne retire pas le droit
  au partage des revenus.
- **Basic Launch :** publicité désactivée, jeu montré à une petite part des
  joueurs, module facultatif. **Full Launch :** après de bons résultats, la
  publicité est activée, le module devient obligatoire.
- **Paiement :** chaque mois, une fois le solde à 100 € au moins.

**Ce que je n'ai pas trouvé**, et qu'il faudra lire dans leurs conditions au
moment de créer le compte, avant d'accepter quoi que ce soit : la part des
revenus reversée, les informations fiscales ou bancaires demandées, la durée
d'engagement et la façon de retirer le jeu.

Leurs conditions pour le premier palier, et où nous en sommes :

| Condition | Chez nous |
|-----------|-----------|
| Anglais | oui, par défaut |
| Chemins relatifs, moins de 50 Mo | une page de 175 Ko, sans autre fichier |
| Chrome, Edge ; souris et tactile | oui |
| Lisible aux tailles de leur cadre | vérifié (voir plus haut) |
| Pas de connexion maison | retirée |
| Pas de publicité à nous | il n'y en a pas |
| Pas de lien vers un autre site jouable | retirés |
| Public dès 12 ans | oui |
| Pas de bouton plein écran maison | il n'y en a pas |

Ce qu'on ne sait pas d'avance : leur relecture juge aussi la qualité et
l'originalité du jeu, et peut refuser. On le saura en essayant.

## Si le portail envoie beaucoup de monde

- **Contre les bots, le défi du jour, les leçons :** tout se joue dans le
  navigateur du joueur. Le serveur peut être saturé ou éteint, ces modes
  marchent quand même (seul le classement du défi a besoin de lui).
- **En ligne :** le serveur (Northflank, offre gratuite : 0,2 processeur
  partagé, 512 Mo) refuse d'ouvrir plus de **300 tables** à la fois, soit
  1 200 joueurs assis. Au-delà, le joueur lit « Trop de tables ouvertes.
  Réessayez dans un moment. » et peut jouer contre les bots en attendant.
- **Ce qui a été mesuré** (26 sept. 2026) : 250 tables, soit 1 000 joueurs
  simulés, tiennent en 11 % d'un cœur et 204 Mo — **sur un PC**. La mémoire du
  serveur suffit donc ; son processeur, plus petit et partagé, n'a pas été
  poussé jusque-là. La limite réelle est sans doute sous les 300 tables : le
  jeu ralentirait avant de refuser.
- **Ce que je n'ai pas vérifié :** les quotas de l'offre gratuite de
  Northflank (trafic mensuel, mise en veille). À relire avant un Full Launch.
- Le Basic Launch ne montre le jeu qu'à une petite part des joueurs du
  portail : la vague de centaines de joueurs d'un coup n'arrive qu'au palier
  suivant, et on aura les compteurs pour la voir venir.

## Déposer le jeu — c'est Mickaël qui le fait

Créer un compte et publier en son nom ne peut pas se déléguer.

1. Ouvrir <https://developer.crazygames.com> et créer un compte développeur
   (je n'ai pas pu voir le formulaire : s'il demande autre chose qu'une adresse
   mail, me le dire avant de remplir).
2. « Submit a game », type **HTML5**.
3. Déposer le fichier `portail/larbin-portail.zip` (ou, s'il demande des
   fichiers, le seul `portail/index.html`).
4. Coller les textes ci-dessous, joindre les images demandées.
5. Envoyer, puis attendre leur relecture (quelques jours à quelques semaines).

S'ils demandent une correction, me transmettre leur message tel quel.

### Les textes à coller

**Nom :** Le Larbin

**Catégorie :** Card (jeux de cartes). **Étiquettes :** card, multiplayer,
president, 2 player / with friends, strategy.

**Description (anglais) :**

> Le Larbin is the President card game — also known as Scum — but faster: a
> trick goes around the table only once, so every card counts. Play higher
> than the player before you or pass, and be the first to empty your hand to
> become the Boss. Finish last and you are the Lackey: next round, your two
> best cards go to the Boss.
>
> Play against bots, open a room for your friends with a four-letter code, or
> sit at a public table with other players. A daily challenge deals the same
> hands to everyone, with a leaderboard of the day. Four short lessons teach
> the game in two minutes.

**Commandes (anglais) :**

> Click or tap the cards you want to play, then **Play**. Click **Pass** to
> skip the trick. To play several cards of the same rank, select them all
> before pressing Play.

**Images :** le portail demande des vignettes à ses dimensions (elles sont
indiquées sur la page de dépôt). Me donner les tailles : je les prépare à
partir de l'image de partage du site.
