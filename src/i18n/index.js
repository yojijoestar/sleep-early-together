import en from './en';
import zh from './zh';

export const translations = { en, zh };

export const t = (lang, key) => {
  return translations[lang]?.[key] ?? translations['en'][key] ?? key;
};
