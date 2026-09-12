import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { Lang, TranslationKeys } from '../lib/i18n';
import { t as translate, isRTL } from '../lib/i18n';

interface LangContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  rtl: boolean;
}

const LangContext = createContext<LangContextType | undefined>(undefined);

const LANG_KEY = 'putzo_lang';

export function LangProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(() => {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved && ['de', 'ro', 'ar', 'pl', 'en', 'uk', 'tr', 'bg'].includes(saved)) return saved as Lang;
    return 'de';
  });

  const setLang = (newLang: Lang) => {
    setLangState(newLang);
    localStorage.setItem(LANG_KEY, newLang);
  };

  const t = (key: string): string => translate(lang, key as keyof TranslationKeys);

  const rtl = isRTL(lang);

  useEffect(() => {
    document.documentElement.dir = rtl ? 'rtl' : 'ltr';
  }, [rtl]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, rtl }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang() {
  const context = useContext(LangContext);
  if (!context) throw new Error('useLang must be used within LangProvider');
  return context;
}
