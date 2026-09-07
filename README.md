# Le Larbin

Version en ligne du **Larbin**, variante maison du Président / Trou du cul.
Projet plaisir : y jouer à quatre ou six entre proches, chacun sur son téléphone.

Les règles appliquées sont détaillées dans [REGLES.md](REGLES.md).

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

Tout le monde doit être sur le même wifi. Pour jouer à distance, il faudra
héberger le serveur quelque part : c'est la prochaine étape.

Une déconnexion n'est pas grave : le navigateur retient votre place et vous la
rend en rouvrant le lien. Si vous ne revenez pas au bout de 25 secondes, la
table joue pour vous plutôt que d'attendre indéfiniment.

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

## Où en est le chantier

- [x] **Le moteur de règles** — complet, testé, sans dépendance.
- [x] **Un banc d'essai en terminal.**
- [x] **L'interface** — cartes, éventail, panneaux, pensée téléphone d'abord.
- [x] **Les points** — score par manche, objectif de partie, classement final.
- [x] **Le multijoueur** — salons, invitation par lien, bots d'appoint,
      reconnexion. Sur le réseau local pour l'instant.
- [ ] **La mise en ligne** — pour jouer sans être sous le même toit.

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
    src/web/style.css        le tapis, les cartes, les panneaux
    src/cli.ts               le jeu en terminal
    scripts/build.mjs        assemble Larbin.html
    test/                    règles, points, salons

## Le principe qui tient tout

Le moteur est une pile de fonctions pures. `apply(état, action)` renvoie un
nouvel état sans toucher à l'ancien, et `viewFor(état, joueur)` ne montre à
chacun que sa propre main.

En ligne, `apply` tourne sur le serveur et les clients ne reçoivent jamais que
leur `viewFor`. Un joueur ne peut donc ni voir le jeu des autres, ni jouer à
leur place, ni forcer un coup illégal — le serveur refuse, la console du
navigateur n'y change rien. C'est ce qui a permis au multijoueur de se brancher
sans réécrire les règles.
