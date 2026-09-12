# Le Larbin

Version en ligne du **Larbin**, variante maison du Président / Trou du cul :
y jouer à quatre ou six, chacun sur son téléphone.

Le jeu est en ligne sur **[larbin.vercel.app](https://larbin.vercel.app)**, et
ses règles sont expliquées sur [/regles](https://larbin.vercel.app/regles) pour
qui arrive de nulle part. La traduction technique — ce que le moteur applique
exactement — reste dans [REGLES.md](REGLES.md).

## Jouer seul, tout de suite

Double-cliquez **`Larbin.html`**. Un seul fichier, aucune installation : il
s'ouvre dans le navigateur et la partie commence contre Gina, Hugo et Lila.
Ce fichier se transmet comme une photo — celui qui le reçoit peut jouer sans
rien installer.

## Jouer à plusieurs

Double-cliquez **`Serveur.cmd`** et laissez la fenêtre ouverte : c'est elle qui
arbitre les parties. Elle affiche deux adresses, celle du PC et celle du réseau
local (`http://192.168.1.22:5177` par exemple).

1. Ouvrez cette adresse, entrez votre nom, **Créer un salon**.
2. Envoyez le lien affiché — ou dictez le code de quatre lettres.
3. Complétez la table avec des bots si vous n'êtes pas assez, puis lancez.

Tout le monde doit être sur le même wifi. Pour jouer à distance, voir plus bas.

Une déconnexion n'est pas grave : le navigateur retient votre place et vous la
rend en rouvrant le lien. Si vous ne revenez pas au bout de 25 secondes, la
table joue pour vous plutôt que d'attendre indéfiniment.

Rester là sans jouer bloquerait tout autant : au bout d'une minute, la table
joue donc aussi pour un joueur présent mais muet. Elle l'avertit dans les
quinze dernières secondes — « la table jouera pour vous dans 12 s » —, car
jouer dans le dos de quelqu'un serait déloyal, même pour sauver la partie.
Entre amis on s'appelle pour réveiller le distrait ; entre inconnus, personne
ne peut le faire.

### Jouer avec des inconnus

**Jouer avec d'autres visiteurs** assoit à une table publique, sans code ni
invitation. Chacun y dispose d'un bouton **Je suis prêt**, et le départ obéit à
une seule règle : le compte à rebours de vingt secondes court tant que **tous
les joueurs assis se sont dits prêts**. Se dédire l'arrête ; l'arrivée de
quelqu'un qui n'a rien promis l'arrête aussi. **Commencer avec des bots** reste
là pour qui sait que le voisin s'est absenté sans rien dire.

Au terme du compte à rebours, des bots prennent les places encore libres. La
table les montre, pour qu'on voie ce qui manque. Ces tables n'ont pas d'hôte :
n'importe quel joueur assis peut lancer la partie ou en relancer une.

**Joueurs à cette table : 4, 5 ou 6.** N'importe qui peut changer ce nombre
avant le départ, et la table montre alors autant de places. À cinq il y a un
Neutre, à six il y en a deux : le jeu n'a pas le même goût. Changer la taille
remet chacun « pas prêt » — on s'était dit prêt pour une autre table.

Le bouton mène d'abord à la **liste des tables publiques** : celles qui
attendent, avec le nombre de joueurs et de prêts, et celles dont la partie est
commencée. On peut rejoindre les premières — et **entrer** dans les secondes, en
prenant la place d'un bot : on hérite de sa main et de ses points, et l'on joue
à la manche en cours. Mieux vaut cela qu'attendre la fin d'une partie.

Seules les tables où quelqu'un est effectivement assis sont montrées, et la
liste ne donne que des comptes : les noms des joueurs ne regardent pas les
passants.

Personne n'y attend donc jamais devant un écran vide, ce qui est la raison
d'être de ce fonctionnement : une salle d'attente classique, à faible
fréquentation, ne montre que son propre désert.

## Jouer à distance

Le jeu se joue sur **https://larbin.vercel.app**. Envoyez ce lien à vos proches,
ou dictez-leur le code du salon.

### Pourquoi deux hébergements

Render endort le service après un quart d'heure sans visite : le premier à
ouvrir le lien attend une trentaine de secondes que la machine se lève. Comme
cette attente a lieu pendant le chargement de la page, aucun code ne peut
l'adoucir — elle se passe avant que le jeu existe.

D'où le partage du travail :

- **la page** est un fichier statique, servi instantanément par un hébergeur qui
  ne dort jamais (Vercel) ;
- **le serveur de parties** tourne sur Render, et la page le réveille dès son
  chargement, pendant que le joueur entre son nom.

L'attente existe toujours, mais plus personne ne la voit. Et si le serveur n'est
pas encore debout au moment de créer un salon, la page le dit au lieu de rester
figée.

La page trouve son serveur toute seule : elle demande `/sante` à sa propre
adresse, et si personne ne répond, elle s'adresse à `HOTE_JEU`
(`src/web/table.ts`). Les deux adresses restent donc jouables — celle de Vercel
comme celle de Render en direct.

### Mettre la page en ligne

`vercel.json` fait le nécessaire : Vercel lance `npm run build` et ne publie que
le dossier `public/`, qui ne contient que la page. Le reste du dépôt n'est pas
exposé.

Sur vercel.com : **Add New → Project**, choisissez le dépôt `larbin`, laissez les
réglages détectés, **Deploy**. Chaque poussée sur `main` republie.

### Refaire le serveur ailleurs

« New → Web Service » chez l'hébergeur, pointé sur le dépôt, type d'instance
**Free**, région **Frankfurt**, contrôle de santé sur `/sante`. Attention, le
parcours manuel de Render ne lit pas le `render.yaml` — il faut cocher Free à la
main, sinon c'est l'offre payante.

Fly.io, Railway, Koyeb ou un petit VPS conviennent aussi — c'est la même image.
En local :

```
docker build -t larbin .
docker run -p 5177:5177 larbin
```

Le serveur lit la variable `PORT` si l'hébergeur en impose une, répond sur
`/sante` pour les contrôles automatiques, et prévient les joueurs avant de
redémarrer.

## Développer

Node 22.6 ou plus récent. Le projet lit le TypeScript directement : rien à
compiler pour le moteur, les tests ni le serveur.

```
npm test        # les règles, les points, les salons
npm run serveur # le serveur de jeu (page + parties)
npm run build   # réassemble Larbin.html
npm run watch   # réassemble à chaque modification
npm run jouer   # le banc d'essai en terminal
```

Seule l'interface passe par un assemblage : esbuild réunit le moteur et
l'affichage, et le tout est inséré dans `Larbin.html`. D'où le fichier unique.

### Éprouver le jeu en ligne

`npm test` couvre les règles et la logique de salon, mais pas le serveur ni les
WebSockets. Trois suites s'en chargent, contre un serveur réellement lancé —
celui de la machine, ou celui en production :

```
npm run serveur                                    # dans une autre fenêtre
node scripts/reseau/e2e-publique.mjs localhost:5177  # prêt, compte à rebours, départ
node scripts/reseau/e2e-tables.mjs localhost:5177    # liste, reprise d'un bot, salon privé
node scripts/reseau/e2e-inactif.mjs localhost:5177   # le joueur muet (une minute d'attente)
node scripts/reseau/un-visiteur.mjs localhost:5177   # s'assoit et reste, pour regarder l'écran
```

Elles fonctionnent aussi sur `larbin.onrender.com`. Deux avertissements dans ce
cas : l'hébergeur met une trentaine de secondes à se réveiller, et une dizaine
de secondes à apprendre qu'une socket s'est fermée — les essais observent donc
au lieu de parier sur un délai. Et pendant un redéploiement, le serveur est
remplacé en cours de route : une suite lancée à ce moment-là échoue sur les
minuteurs, sans que rien ne soit cassé. Relancez-la.

### Toucher au bot

L'intuition se trompe beaucoup sur ce jeu, et une mesure isolée ment volontiers.
Toute modification du bot passe donc par l'arène :

```
node scripts/arene.mjs                  # le candidat contre le bot en place
node scripts/arene.mjs 2000 --series=4  # plus long, plus sûr
node scripts/arene.mjs --calibrage      # le bot contre sa copie : doit être indécis
```

On écrit l'idée dans `src/engine/bot-candidat.ts` — une copie conforme de
`bot.ts` — et l'arène tranche. Elle joue plusieurs séries sur des donnes
indépendantes, fait tourner les places autour de la table, et refuse de conclure
quand l'écart tient dans la marge d'erreur.

Il faut la croire quand elle dit « indécis » : la dispersion entre séries est
presque le double de la marge binomiale, et une seule série ne prouve rien.

Il ne faut pas pour autant la croire sur tout. Elle compare deux bots entre
eux, et un défaut qu'ils partagent ne s'y voit jamais. C'est un joueur qui a
remarqué que les bots finissaient souvent sur un 2 : ils comparaient les cartes
par référence au lieu de leur identifiant, et leur garde-fou ne s'était jamais
déclenché — pas plus que l'un des principes qu'une mesure précédente croyait
avoir validés. L'arène compte désormais les fins sur un 2 : le correctif les a
fait passer de 12 % des manches, par joueur, à zéro, et le bot corrigé remporte
75,8 % ± 1,1 des parties décisives face à l'ancien.

## Où en est le chantier

- [x] **Le moteur de règles** — complet, testé, sans dépendance.
- [x] **Un banc d'essai en terminal.**
- [x] **L'interface** — cartes, éventail, panneaux, pensée téléphone d'abord.
- [x] **Les points** — score par manche, objectif de partie, classement final.
- [x] **Le multijoueur** — salons, invitation par lien, bots d'appoint,
      reconnexion.
- [x] **Trois tapis** — Feutre, Bordeaux, Ardoise. Pur habillage : rien qui
      touche aux règles ni à ce qu'un joueur voit.
- [x] **En ligne** — https://larbin.vercel.app pour la page, instantanée ;
      larbin.onrender.com pour les parties, réveillé en coulisse. Chaque poussée
      sur `main` republie les deux.

## Comment c'est rangé

    src/engine/types.ts      les types partagés
    src/engine/cards.ts      le paquet, les hauteurs, le tri des mains
    src/engine/rng.ts        tirage déterministe (parties rejouables)
    src/engine/game.ts       les règles : distribution, séries, rôles, échanges
    src/engine/bot.ts        l'adversaire artificiel
    src/reseau/protocole.ts  ce que s'échangent le navigateur et le serveur
    src/reseau/salon.ts      une table, ses places, sa partie
    src/reseau/serveur.ts    HTTP + WebSocket, l'arbitre
    src/web/table.ts         la table vue du client : solo ou en ligne
    src/web/app.ts           l'affichage et les gestes
    src/web/themes.ts        les habillages de la table
    src/web/style.css        le tapis, les cartes, les panneaux
    src/cli.ts               le jeu en terminal
    scripts/build.mjs        assemble Larbin.html
    test/                    règles, points, salons
    Dockerfile               l'image de déploiement
    render.yaml              la configuration du serveur chez Render
    vercel.json              la configuration de la page chez Vercel

## Le principe qui tient tout

Le moteur est une pile de fonctions pures. `apply(état, action)` renvoie un
nouvel état sans toucher à l'ancien, et `viewFor(état, joueur)` ne montre à
chacun que sa propre main.

En ligne, `apply` tourne sur le serveur et les clients ne reçoivent jamais que
leur `viewFor`. Un joueur ne peut donc ni voir le jeu des autres, ni jouer à
leur place, ni forcer un coup illégal — le serveur refuse, la console du
navigateur n'y change rien. C'est ce qui a permis au multijoueur de se brancher
sans réécrire les règles.
