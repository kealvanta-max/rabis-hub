"use client";

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import type { Locale } from "@/i18n";
import en from "@/i18n/en";

type Dict = typeof en;

const dictionaries: Record<Locale, () => Promise<Dict>> = {
  en: () => Promise.resolve(en),
  tw: () => import("@/i18n/tw").then(m => m.default),
  fr: () => import("@/i18n/fr").then(m => m.default),
  ha: () => import("@/i18n/ha").then(m => m.default),
  ga: () => import("@/i18n/ga").then(m => m.default),
  ee: () => import("@/i18n/ee").then(m => m.default),
};

interface I18nState {
  locale: Locale;
  t: Dict;
  setLocale: (locale: Locale) => void;
}

const I18nContext = createContext<I18nState>({
  locale: "en",
  t: en,
  setLocale: () => {},
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("en");
  const [dict, setDict] = useState<Dict>(en);

  useEffect(() => {
    const saved = (typeof window !== "undefined" && localStorage.getItem("rabi-lang")) as Locale | null;
    if (saved && dictionaries[saved]) {
      setLocaleState(saved);
      dictionaries[saved]().then(setDict);
    }
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    localStorage.setItem("rabi-lang", newLocale);
    dictionaries[newLocale]().then(setDict);
  }, []);

  return (
    <I18nContext.Provider value={{ locale, t: dict, setLocale }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
