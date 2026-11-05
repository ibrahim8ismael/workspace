import { hasReferenceArt } from './referenceArt';

/** Which art draws the office. There is no choice in the interface: the local reference art when it is installed,
    otherwise the project's own art. `?art=original` shows the own art (used for public screenshots). */
export type ArtPack = 'reference' | 'original';
const forced = (() => {
  try {
    return new URLSearchParams(location.search).get('art') === 'original';
  } catch {
    return false;
  }
})();
const current: ArtPack = hasReferenceArt && !forced ? 'reference' : 'original';
export const artPack = () => current;
