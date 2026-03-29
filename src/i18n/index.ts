export type Locale = "en" | "tw" | "fr" | "ha" | "ga" | "ee";

export interface LocaleInfo {
  code: Locale;
  name: string;
  flag: string;
}

export const locales: LocaleInfo[] = [
  { code: "en", name: "English", flag: "🇬🇧" },
  { code: "tw", name: "Twi", flag: "🇬🇭" },
  { code: "fr", name: "Français", flag: "🇫🇷" },
  { code: "ha", name: "Hausa", flag: "🇬🇭" },
  { code: "ga", name: "Ga", flag: "🇬🇭" },
  { code: "ee", name: "Eʋegbe", flag: "🇬🇭" },
];

export type TranslationKeys = typeof import("./en").default;
