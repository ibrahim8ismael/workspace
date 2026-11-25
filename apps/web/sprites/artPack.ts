import { hasReferenceArt } from './referenceArt';

/** The office renderer can preview the project's art, the local reference art, or the repo's office pack. */
export type ArtPack = 'reference' | 'original' | 'repo-office';
const requestedPack = (() => {
  try {
    return new URLSearchParams(location.search).get('art');
  } catch {
    return null;
  }
})();
const current: ArtPack =
  requestedPack === 'repo-office'
    ? 'repo-office'
    : hasReferenceArt && requestedPack !== 'original'
      ? 'reference'
      : 'original';
export const artPack = () => current;
