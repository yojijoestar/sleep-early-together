import React, { createContext, useContext, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { t } from '../i18n';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState('en');

  const toggleLanguage = async () => {
    const next = lang === 'en' ? 'zh' : 'en';
    setLang(next);
    await AsyncStorage.setItem('lang', next);
  };

  // Load saved language on mount
  React.useEffect(() => {
    AsyncStorage.getItem('lang').then((saved) => {
      if (saved) setLang(saved);
    });
  }, []);

  return (
    <LanguageContext.Provider value={{ lang, toggleLanguage, t: (key) => t(lang, key) }}>
      {children}
    </LanguageContext.Provider>
  );
}

export const useLang = () => useContext(LanguageContext);
