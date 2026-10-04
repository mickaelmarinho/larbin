/**
 * Le module de CrazyGames, vu du jeu.
 *
 * Chez ce portail, c'est lui qui fabrique les liens d'invitation, qui sait
 * quand un ami veut rejoindre un salon, et à qui l'on dit qu'une partie
 * commence ou s'arrête. Sa bibliothèque est chargée par la page du portail
 * (voir scripts/page-portail.mjs) ; ici, on ne fait que lui parler — et tout
 * devient muet si elle manque ou refuse de démarrer : le jeu ne dépend jamais
 * d'elle.
 */
import { SUR_PORTAIL } from './portail.ts';

interface Invitation { [cle: string]: string | number | undefined }

interface ModuleJeu {
  gameplayStart(): void;
  gameplayStop(): void;
  inviteLink(params: Invitation): string;
  inviteParams: Invitation | null;
  isInstantMultiplayer?: boolean;
  updateRoom(etat: { roomId?: string; isJoinable?: boolean; inviteParams?: Invitation }): void;
  leftRoom(): void;
  addJoinRoomListener(ecouteur: (params: Invitation) => void): void;
}

interface Bibliotheque {
  init(): Promise<void>;
  environment: 'local' | 'crazygames' | 'disabled';
  game: ModuleJeu;
}

let jeu: ModuleJeu | null = null;
let demarrage: Promise<boolean> | null = null;

/** Lance le module une fois ; vrai s'il répond. Hors du portail, toujours faux. */
export function portailPret(): Promise<boolean> {
  demarrage ??= (async () => {
    if (!SUR_PORTAIL) return false;
    try {
      const sdk = (window as { CrazyGames?: { SDK?: Bibliotheque } }).CrazyGames?.SDK;
      if (!sdk) return false;
      await sdk.init();
      // Ailleurs que chez lui ou en essai local, chacun de ses appels échoue.
      if (sdk.environment === 'disabled') return false;
      jeu = sdk.game;
      return true;
    } catch {
      return false;
    }
  })();
  return demarrage;
}

/** Un appel au module ne doit jamais faire tomber le jeu. */
function tenter<T>(appel: (m: ModuleJeu) => T): T | null {
  if (!jeu) return null;
  try {
    return appel(jeu);
  } catch {
    return null;
  }
}

/** Ce qu'une invitation transporte : le code du salon, quatre lettres. */
export const codeDeLInvitation = (params: Invitation | null | undefined): string | null => {
  const code = String(params?.salon ?? '').trim().toUpperCase();
  return /^[A-Z0-9]{4}$/.test(code) ? code : null;
};

let enJeu = false;

/** On joue, ou on ne joue plus : le portail ne veut l'entendre qu'aux changements. */
export function direSiOnJoue(oui: boolean): void {
  if (oui === enJeu || !jeu) return;
  enJeu = oui;
  tenter((m) => (oui ? m.gameplayStart() : m.gameplayStop()));
}

let salonDit = '';

/** Le salon privé où l'on est assis, et s'il reste de la place pour un ami ; null : aucun. */
export function direLeSalon(salon: { code: string; joignable: boolean } | null): void {
  if (!jeu) return;
  const etat = salon ? `${salon.code}|${salon.joignable}` : '';
  if (etat === salonDit) return;
  salonDit = etat;
  if (!salon) {
    tenter((m) => m.leftRoom());
    return;
  }
  tenter((m) => m.updateRoom({
    roomId: salon.code,
    isJoinable: salon.joignable,
    inviteParams: { salon: salon.code },
  }));
}

const liens = new Map<string, string>();

/**
 * Le lien à envoyer aux amis pour ce salon, ou null si le module ne répond pas.
 * Le salon se redessine souvent : on ne demande le lien qu'une fois par code.
 */
export function lienDInvitation(code: string): string | null {
  const connu = liens.get(code);
  if (connu) return connu;
  const lien = tenter((m) => m.inviteLink({ salon: code })) || null;
  if (lien) liens.set(code, lien);
  return lien;
}

/** Le salon où une invitation nous attend, si le joueur est arrivé par un lien. */
export const invitationRecue = (): string | null => codeDeLInvitation(tenter((m) => m.inviteParams));

/** Le joueur a demandé au portail une partie entre amis, tout de suite. */
export const multijoueurImmediat = (): boolean => tenter((m) => m.isInstantMultiplayer === true) ?? false;

/** Un ami nous appelle dans son salon pendant qu'on est déjà dans le jeu. */
export function ecouterLesInvitations(rejoindre: (code: string) => void): void {
  tenter((m) => m.addJoinRoomListener((params) => {
    const code = codeDeLInvitation(params);
    if (code) rejoindre(code);
  }));
}
