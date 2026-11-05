import { EN } from './en';

/** Interface languages. Spanish is the source text; other languages translate it (gettext style), so a missing
    translation falls back to Spanish instead of breaking the interface. */
export type Language = 'es' | 'en';
export const LANGUAGES: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];
const DICTIONARIES: Record<Language, Record<string, string> | null> = { es: null, en: EN };

function detect(): Language {
  try {
    const stored = localStorage.getItem('office-language');
    if (stored === 'es' || stored === 'en') return stored;
  } catch {
    /* storage unavailable */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('es')
    ? 'es'
    : 'en';
}
let current: Language = detect();
const listeners = new Set<() => void>();

export const language = () => current;
export const locale = () => (current === 'es' ? 'es' : 'en');
export function setLanguage(next: Language) {
  current = next;
  try {
    localStorage.setItem('office-language', next);
  } catch {
    /* storage unavailable */
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  listeners.forEach((listener) => listener());
}
export const onLanguageChange = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

/** Translate a Spanish source string; `{name}` placeholders take values from `vars`. */
export function t(source: string, vars?: Record<string, string | number>): string {
  const text = DICTIONARIES[current]?.[source] ?? source;
  return vars
    ? text.replace(/\{(\w+)\}/g, (match, key: string) => (key in vars ? String(vars[key]) : match))
    : text;
}
if (typeof document !== 'undefined') document.documentElement.lang = current;
