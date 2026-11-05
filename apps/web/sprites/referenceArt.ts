import type { PixelSprite } from './pixel';

/** The reference office art is a local-only transcription kept in `src/sprites/reference/` (ignored by git, never
    published). When it is present this office uses it; a fresh clone without it uses the project's own art. */
const modules = import.meta.glob<Record<string, Record<string, PixelSprite>>>('./reference/*.ts', {
  eager: true,
});
const pick = (file: string, name: string) =>
  (Object.entries(modules).find(([path]) => path.endsWith(`/${file}.ts`))?.[1]?.[name] ??
    {}) as Record<string, PixelSprite>;
export const REFERENCE_OBJECTS = pick('referenceObjects', 'REFERENCE_OBJECTS');
export const REFERENCE_FLOORS = pick('referenceFloors', 'REFERENCE_FLOORS');
export const REFERENCE_FOREGROUNDS = pick('referenceForegrounds', 'REFERENCE_FOREGROUNDS');
export const hasReferenceArt = Object.keys(REFERENCE_OBJECTS).length > 0;
