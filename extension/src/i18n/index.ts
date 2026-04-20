const translations: Record<string, Record<string, string>> = {
  earned_today: {
    en: "Earned today",
    pt: "Ganho hoje",
    es: "Ganado hoy",
    zh: "今日收益",
    ar: "الأرباح اليوم",
    hi: "आज की कमाई",
    fr: "Gagné aujourd'hui",
    ru: "Заработано сегодня",
    ja: "本日の収益",
    de: "Heute verdient",
  },
  calls_today: {
    en: "API calls today",
    pt: "Chamadas hoje",
    es: "Llamadas hoy",
    zh: "今日调用次数",
    ar: "استدعاءات API اليوم",
    hi: "आज की API कॉल्स",
    fr: "Appels API aujourd'hui",
    ru: "Вызовов API сегодня",
    ja: "本日のAPIコール数",
    de: "API-Aufrufe heute",
  },
};

export function t(key: string, lang: string): string {
  return translations[key]?.[lang] ?? translations[key]?.["en"] ?? key;
}
