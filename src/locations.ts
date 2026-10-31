import cityTimezones from "city-timezones";
import russianCitiesData from "./russian-cities.json";

export interface ResolvedLocation {
  id: string;
  label: string;
  shortLabel: string;
  timeZone: string;
  fixedOffsetMinutes?: number;
  category: "timezone" | "city" | "offset";
  country?: string;
  ianaName: string;
}

interface AliasEntry {
  label: string;
  shortLabel: string;
  timeZone: string;
  fixedOffsetMinutes?: number;
  category: "timezone" | "city" | "offset";
  country?: string;
  keywords: string[];
  pop?: number;
}

interface RussianCityRecord {
  ru: string;
  en: string;
  tz: string;
  pop: number;
}

const russianCities = russianCitiesData as RussianCityRecord[];

// Cache for dynamically geocoded cities from Open-Meteo GeoNames API
const dynamicCityCache = new Map<string, ResolvedLocation[]>();

const TIMEZONE_ABBREVIATIONS: AliasEntry[] = [
  {
    label: "UTC (Coordinated Universal Time)",
    shortLabel: "UTC",
    timeZone: "UTC",
    fixedOffsetMinutes: 0,
    category: "timezone",
    keywords: ["utc", "z", "zulu", "universal", "coordinated universal time"],
  },
  {
    label: "GMT (Greenwich Mean Time)",
    shortLabel: "GMT",
    timeZone: "UTC",
    fixedOffsetMinutes: 0,
    category: "timezone",
    keywords: ["gmt", "greenwich", "greenwich mean time"],
  },
  {
    label: "EST / EDT (US Eastern Time)",
    shortLabel: "ET",
    timeZone: "America/New_York",
    category: "timezone",
    country: "United States",
    keywords: ["est", "edt", "et", "eastern", "eastern time", "us eastern"],
  },
  {
    label: "CST / CDT (US Central Time)",
    shortLabel: "CT",
    timeZone: "America/Chicago",
    category: "timezone",
    country: "United States",
    keywords: ["cst", "cdt", "ct", "central", "central time", "us central"],
  },
  {
    label: "MST / MDT (US Mountain Time)",
    shortLabel: "MT",
    timeZone: "America/Denver",
    category: "timezone",
    country: "United States",
    keywords: ["mst", "mdt", "mt", "mountain", "mountain time", "us mountain"],
  },
  {
    label: "PST / PDT (US Pacific Time)",
    shortLabel: "PT",
    timeZone: "America/Los_Angeles",
    category: "timezone",
    country: "United States",
    keywords: ["pst", "pdt", "pt", "pacific", "pacific time", "us pacific"],
  },
  {
    label: "AKST / AKDT (Alaska Time)",
    shortLabel: "AKT",
    timeZone: "America/Anchorage",
    category: "timezone",
    country: "United States",
    keywords: ["akst", "akdt", "akt", "alaska", "alaska time"],
  },
  {
    label: "HST (Hawaii Standard Time)",
    shortLabel: "HST",
    timeZone: "Pacific/Honolulu",
    category: "timezone",
    country: "United States",
    keywords: ["hst", "hawaii", "honolulu"],
  },
  {
    label: "GMT / BST (UK Time)",
    shortLabel: "BST",
    timeZone: "Europe/London",
    category: "timezone",
    country: "United Kingdom",
    keywords: ["bst", "british summer time", "uk time"],
  },
  {
    label: "WET / WEST (Western European Time)",
    shortLabel: "WET",
    timeZone: "Europe/Lisbon",
    category: "timezone",
    keywords: ["wet", "west", "western european time"],
  },
  {
    label: "CET / CEST (Central European Time)",
    shortLabel: "CET",
    timeZone: "Europe/Berlin",
    category: "timezone",
    keywords: ["cet", "cest", "central european time", "central europe"],
  },
  {
    label: "EET / EEST (Eastern European Time)",
    shortLabel: "EET",
    timeZone: "Europe/Athens",
    category: "timezone",
    keywords: ["eet", "eest", "eastern european time", "eastern europe"],
  },
  {
    label: "MSK (Moscow Standard Time)",
    shortLabel: "MSK",
    timeZone: "Europe/Moscow",
    category: "timezone",
    country: "Russia",
    keywords: ["msk", "moscow time", "мск"],
  },
  {
    label: "SAMT (Samara Time)",
    shortLabel: "SAMT",
    timeZone: "Europe/Samara",
    category: "timezone",
    country: "Russia",
    keywords: ["samt", "samara time", "самарское время"],
  },
  {
    label: "YEKT (Yekaterinburg Time)",
    shortLabel: "YEKT",
    timeZone: "Asia/Yekaterinburg",
    category: "timezone",
    country: "Russia",
    keywords: ["yekt", "yekaterinburg time"],
  },
  {
    label: "OMST (Omsk Time)",
    shortLabel: "OMST",
    timeZone: "Asia/Omsk",
    category: "timezone",
    country: "Russia",
    keywords: ["omst", "omsk time"],
  },
  {
    label: "KRAT (Krasnoyarsk Time)",
    shortLabel: "KRAT",
    timeZone: "Asia/Krasnoyarsk",
    category: "timezone",
    country: "Russia",
    keywords: ["krat", "krasnoyarsk time"],
  },
  {
    label: "IRKT (Irkutsk Time)",
    shortLabel: "IRKT",
    timeZone: "Asia/Irkutsk",
    category: "timezone",
    country: "Russia",
    keywords: ["irkt", "irkutsk time"],
  },
  {
    label: "YAKT (Yakutsk Time)",
    shortLabel: "YAKT",
    timeZone: "Asia/Yakutsk",
    category: "timezone",
    country: "Russia",
    keywords: ["yakt", "yakutsk time"],
  },
  {
    label: "VLAT (Vladivostok Time)",
    shortLabel: "VLAT",
    timeZone: "Asia/Vladivostok",
    category: "timezone",
    country: "Russia",
    keywords: ["vlat", "vladivostok time"],
  },
  {
    label: "TRT (Turkey Time)",
    shortLabel: "TRT",
    timeZone: "Europe/Istanbul",
    category: "timezone",
    country: "Turkey",
    keywords: ["trt", "turkey time"],
  },
  {
    label: "GET (Georgia Standard Time)",
    shortLabel: "GET",
    timeZone: "Asia/Tbilisi",
    category: "timezone",
    country: "Georgia",
    keywords: ["get", "georgia time"],
  },
  {
    label: "AMT (Armenia Time)",
    shortLabel: "AMT",
    timeZone: "Asia/Yerevan",
    category: "timezone",
    country: "Armenia",
    keywords: ["amt", "armenia time"],
  },
  {
    label: "AZT (Azerbaijan Time)",
    shortLabel: "AZT",
    timeZone: "Asia/Baku",
    category: "timezone",
    country: "Azerbaijan",
    keywords: ["azt", "azerbaijan time"],
  },
  {
    label: "GST (Gulf Standard Time)",
    shortLabel: "GST",
    timeZone: "Asia/Dubai",
    category: "timezone",
    country: "United Arab Emirates",
    keywords: ["gst", "gulf", "gulf standard time"],
  },
  {
    label: "IST (India Standard Time)",
    shortLabel: "IST",
    timeZone: "Asia/Kolkata",
    category: "timezone",
    country: "India",
    keywords: ["ist", "india", "india time", "indian standard time"],
  },
  {
    label: "PKT (Pakistan Standard Time)",
    shortLabel: "PKT",
    timeZone: "Asia/Karachi",
    category: "timezone",
    country: "Pakistan",
    keywords: ["pkt", "pakistan time"],
  },
  {
    label: "ICT (Indochina Time)",
    shortLabel: "ICT",
    timeZone: "Asia/Bangkok",
    category: "timezone",
    keywords: ["ict", "indochina time"],
  },
  {
    label: "WIB (Western Indonesian Time)",
    shortLabel: "WIB",
    timeZone: "Asia/Jakarta",
    category: "timezone",
    country: "Indonesia",
    keywords: ["wib", "western indonesian time"],
  },
  {
    label: "WITA (Central Indonesian Time / Bali)",
    shortLabel: "WITA",
    timeZone: "Asia/Makassar",
    category: "timezone",
    country: "Indonesia",
    keywords: ["wita", "central indonesian time"],
  },
  {
    label: "SGT (Singapore Time)",
    shortLabel: "SGT",
    timeZone: "Asia/Singapore",
    category: "timezone",
    country: "Singapore",
    keywords: ["sgt", "singapore time"],
  },
  {
    label: "HKT (Hong Kong Time)",
    shortLabel: "HKT",
    timeZone: "Asia/Hong_Kong",
    category: "timezone",
    country: "Hong Kong",
    keywords: ["hkt", "hong kong time"],
  },
  {
    label: "JST (Japan Standard Time)",
    shortLabel: "JST",
    timeZone: "Asia/Tokyo",
    category: "timezone",
    country: "Japan",
    keywords: ["jst", "japan", "japan time", "japan standard time"],
  },
  {
    label: "KST (Korea Standard Time)",
    shortLabel: "KST",
    timeZone: "Asia/Seoul",
    category: "timezone",
    country: "South Korea",
    keywords: ["kst", "korea", "korea time", "korea standard time"],
  },
  {
    label: "AWST (Australian Western Time)",
    shortLabel: "AWST",
    timeZone: "Australia/Perth",
    category: "timezone",
    country: "Australia",
    keywords: ["awst", "perth time"],
  },
  {
    label: "ACST / ACDT (Australian Central Time)",
    shortLabel: "ACST",
    timeZone: "Australia/Adelaide",
    category: "timezone",
    country: "Australia",
    keywords: ["acst", "acdt", "adelaide time"],
  },
  {
    label: "AEST / AEDT (Australian Eastern Time)",
    shortLabel: "AEST",
    timeZone: "Australia/Sydney",
    category: "timezone",
    country: "Australia",
    keywords: ["aest", "aedt", "australian eastern time", "sydney time"],
  },
  {
    label: "NZST / NZDT (New Zealand Time)",
    shortLabel: "NZT",
    timeZone: "Pacific/Auckland",
    category: "timezone",
    country: "New Zealand",
    keywords: ["nzst", "nzdt", "nzt", "new zealand", "new zealand time"],
  },
  {
    label: "BRT (Brasília Time)",
    shortLabel: "BRT",
    timeZone: "America/Sao_Paulo",
    category: "timezone",
    country: "Brazil",
    keywords: ["brt", "brasilia time", "brazil time"],
  },
  {
    label: "ART (Argentina Time)",
    shortLabel: "ART",
    timeZone: "America/Argentina/Buenos_Aires",
    category: "timezone",
    country: "Argentina",
    keywords: ["art", "argentina time"],
  },
];

const CURATED_CITIES: AliasEntry[] = [
  {
    label: "Togliatti, Russia",
    shortLabel: "Togliatti",
    timeZone: "Europe/Samara",
    category: "city",
    country: "Russia",
    keywords: ["togliatti", "tolyatti", "toljatti", "tol'yatti", "тольятти", "тлт", "tlt"],
    pop: 700000,
  },
  {
    label: "Anapa, Russia (Анапа)",
    shortLabel: "Anapa",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["anapa", "анапа", "aaq"],
    pop: 90000,
  },
  {
    label: "Tver, Russia (Тверь)",
    shortLabel: "Tver",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["tver", "tver'", "тверь"],
    pop: 420000,
  },
  {
    label: "Samara, Russia",
    shortLabel: "Samara",
    timeZone: "Europe/Samara",
    category: "city",
    country: "Russia",
    keywords: ["samara", "самара", "kuf"],
    pop: 1150000,
  },
  {
    label: "Moscow, Russia",
    shortLabel: "Moscow",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["moscow", "moskva", "москва", "svo", "dme", "vko"],
    pop: 12600000,
  },
  {
    label: "St. Petersburg, Russia",
    shortLabel: "St. Petersburg",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: [
      "saint petersburg",
      "st petersburg",
      "st. petersburg",
      "petersburg",
      "spb",
      "piter",
      "санкт-петербург",
      "петербург",
      "питер",
      "спб",
      "led",
    ],
    pop: 5380000,
  },
  {
    label: "Yekaterinburg, Russia",
    shortLabel: "Yekaterinburg",
    timeZone: "Asia/Yekaterinburg",
    category: "city",
    country: "Russia",
    keywords: ["yekaterinburg", "ekaterinburg", "екатеринбург", "екб", "svx"],
    pop: 1500000,
  },
  {
    label: "Novosibirsk, Russia",
    shortLabel: "Novosibirsk",
    timeZone: "Asia/Novosibirsk",
    category: "city",
    country: "Russia",
    keywords: ["novosibirsk", "новосибирск", "нск", "ovb"],
    pop: 1620000,
  },
  {
    label: "Kazan, Russia",
    shortLabel: "Kazan",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["kazan", "казань", "kzn"],
    pop: 1250000,
  },
  {
    label: "Nizhny Novgorod, Russia",
    shortLabel: "Nizhny Novgorod",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["nizhny novgorod", "nizhnii novgorod", "нижний новгород", "нн", "goj"],
    pop: 1250000,
  },
  {
    label: "Sochi, Russia",
    shortLabel: "Sochi",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["sochi", "сочи", "aer", "adler", "адлер"],
    pop: 440000,
  },
  {
    label: "Gelendzhik, Russia",
    shortLabel: "Gelendzhik",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["gelendzhik", "геленджик", "gdz"],
    pop: 80000,
  },
  {
    label: "Krasnodar, Russia",
    shortLabel: "Krasnodar",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["krasnodar", "краснодар", "krr"],
    pop: 1000000,
  },
  {
    label: "Rostov-on-Don, Russia",
    shortLabel: "Rostov-on-Don",
    timeZone: "Europe/Moscow",
    category: "city",
    country: "Russia",
    keywords: ["rostov", "rostov-on-don", "rostov na donu", "ростов", "ростов-на-дону", "rov"],
    pop: 1130000,
  },
  {
    label: "Kaliningrad, Russia",
    shortLabel: "Kaliningrad",
    timeZone: "Europe/Kaliningrad",
    category: "city",
    country: "Russia",
    keywords: ["kaliningrad", "калининград", "kgd"],
    pop: 490000,
  },
  {
    label: "Vladivostok, Russia",
    shortLabel: "Vladivostok",
    timeZone: "Asia/Vladivostok",
    category: "city",
    country: "Russia",
    keywords: ["vladivostok", "владивосток", "vvo"],
    pop: 600000,
  },
  {
    label: "Almaty, Kazakhstan",
    shortLabel: "Almaty",
    timeZone: "Asia/Almaty",
    category: "city",
    country: "Kazakhstan",
    keywords: ["almaty", "alma-ata", "алматы", "алма-ата", "ala"],
  },
  {
    label: "Astana, Kazakhstan",
    shortLabel: "Astana",
    timeZone: "Asia/Almaty",
    category: "city",
    country: "Kazakhstan",
    keywords: ["astana", "nur-sultan", "астана", "нур-султан", "nqz", "tse"],
  },
  {
    label: "Tbilisi, Georgia",
    shortLabel: "Tbilisi",
    timeZone: "Asia/Tbilisi",
    category: "city",
    country: "Georgia",
    keywords: ["tbilisi", "тбилиси", "tbs", "batumi", "батуми"],
  },
  {
    label: "Yerevan, Armenia",
    shortLabel: "Yerevan",
    timeZone: "Asia/Yerevan",
    category: "city",
    country: "Armenia",
    keywords: ["yerevan", "ереван", "evn"],
  },
  {
    label: "Baku, Azerbaijan",
    shortLabel: "Baku",
    timeZone: "Asia/Baku",
    category: "city",
    country: "Azerbaijan",
    keywords: ["baku", "баку", "gyd"],
  },
  {
    label: "Tashkent, Uzbekistan",
    shortLabel: "Tashkent",
    timeZone: "Asia/Tashkent",
    category: "city",
    country: "Uzbekistan",
    keywords: ["tashkent", "ташкент", "tas", "samarkand", "самарканд"],
  },
  {
    label: "Bishkek, Kyrgyzstan",
    shortLabel: "Bishkek",
    timeZone: "Asia/Bishkek",
    category: "city",
    country: "Kyrgyzstan",
    keywords: ["bishkek", "бишкек", "fru"],
  },
  {
    label: "Minsk, Belarus",
    shortLabel: "Minsk",
    timeZone: "Europe/Minsk",
    category: "city",
    country: "Belarus",
    keywords: ["minsk", "минск", "msq", "brest", "брест", "gomel", "гомель", "grodno", "гродно", "vitebsk", "витебск"],
  },
  {
    label: "Kyiv, Ukraine",
    shortLabel: "Kyiv",
    timeZone: "Europe/Kyiv",
    category: "city",
    country: "Ukraine",
    keywords: ["kyiv", "kiev", "киев", "київ", "kbp", "odessa", "odesa", "одесса", "lviv", "львов", "kharkiv", "харьков"],
  },
  {
    label: "Belgrade, Serbia",
    shortLabel: "Belgrade",
    timeZone: "Europe/Belgrade",
    category: "city",
    country: "Serbia",
    keywords: ["belgrade", "beograd", "белград", "beg", "novi sad", "нови-сад"],
  },
  {
    label: "Limassol, Cyprus",
    shortLabel: "Limassol",
    timeZone: "Asia/Nicosia",
    category: "city",
    country: "Cyprus",
    keywords: ["limassol", "лимассол", "nicosia", "никосия", "larnaca", "ларнака", "paphos", "пафос", "cyprus", "кипр", "lca", "pfo"],
  },
  {
    label: "Istanbul, Turkey",
    shortLabel: "Istanbul",
    timeZone: "Europe/Istanbul",
    category: "city",
    country: "Turkey",
    keywords: ["istanbul", "стамбул", "antalya", "анталья", "ankara", "анкара", "alanya", "аланья", "bodrum", "бодрум", "saw"],
  },
  {
    label: "Dubai, UAE",
    shortLabel: "Dubai",
    timeZone: "Asia/Dubai",
    category: "city",
    country: "United Arab Emirates",
    keywords: ["dubai", "дубай", "dxb", "abu dhabi", "абу-даби", "auh", "sharjah", "шарджа", "uae", "оаэ"],
  },
  {
    label: "Tel Aviv, Israel",
    shortLabel: "Tel Aviv",
    timeZone: "Asia/Jerusalem",
    category: "city",
    country: "Israel",
    keywords: ["tel aviv", "тель-авив", "tlv", "jerusalem", "иерусалим", "haifa", "хайфа", "israel", "израиль"],
  },
  {
    label: "London, United Kingdom",
    shortLabel: "London",
    timeZone: "Europe/London",
    category: "city",
    country: "United Kingdom",
    keywords: ["london", "лондон", "lhr", "lgw", "uk", "united kingdom", "britain", "england"],
  },
  {
    label: "Berlin, Germany",
    shortLabel: "Berlin",
    timeZone: "Europe/Berlin",
    category: "city",
    country: "Germany",
    keywords: ["berlin", "берлин", "ber", "munich", "мюнхен", "muc", "frankfurt", "франкфурт", "fra", "germany", "германия"],
  },
  {
    label: "Paris, France",
    shortLabel: "Paris",
    timeZone: "Europe/Paris",
    category: "city",
    country: "France",
    keywords: ["paris", "париж", "cdg", "ory", "nice", "ницца", "france", "франция"],
  },
  {
    label: "Amsterdam, Netherlands",
    shortLabel: "Amsterdam",
    timeZone: "Europe/Amsterdam",
    category: "city",
    country: "Netherlands",
    keywords: ["amsterdam", "амстердам", "ams", "netherlands", "нидерланды"],
  },
  {
    label: "Zurich, Switzerland",
    shortLabel: "Zurich",
    timeZone: "Europe/Zurich",
    category: "city",
    country: "Switzerland",
    keywords: ["zurich", "zürich", "цюрих", "zrh", "geneva", "женева", "gva", "switzerland", "швейцария"],
  },
  {
    label: "Madrid, Spain",
    shortLabel: "Madrid",
    timeZone: "Europe/Madrid",
    category: "city",
    country: "Spain",
    keywords: ["madrid", "мадрид", "mad", "barcelona", "барселона", "bcn", "valencia", "валенсия", "spain", "испания"],
  },
  {
    label: "Lisbon, Portugal",
    shortLabel: "Lisbon",
    timeZone: "Europe/Lisbon",
    category: "city",
    country: "Portugal",
    keywords: ["lisbon", "лиссабон", "lis", "porto", "порту", "portugal", "португалия"],
  },
  {
    label: "Rome, Italy",
    shortLabel: "Rome",
    timeZone: "Europe/Rome",
    category: "city",
    country: "Italy",
    keywords: ["rome", "рим", "fco", "milan", "милан", "mxp", "italy", "италия"],
  },
  {
    label: "Warsaw, Poland",
    shortLabel: "Warsaw",
    timeZone: "Europe/Warsaw",
    category: "city",
    country: "Poland",
    keywords: ["warsaw", "варшава", "waw", "krakow", "краков", "poland", "польша"],
  },
  {
    label: "Prague, Czechia",
    shortLabel: "Prague",
    timeZone: "Europe/Prague",
    category: "city",
    country: "Czechia",
    keywords: ["prague", "прага", "prg", "czechia", "чехия"],
  },
  {
    label: "Vienna, Austria",
    shortLabel: "Vienna",
    timeZone: "Europe/Vienna",
    category: "city",
    country: "Austria",
    keywords: ["vienna", "вена", "vie", "austria", "австрия"],
  },
  {
    label: "New York, USA",
    shortLabel: "New York",
    timeZone: "America/New_York",
    category: "city",
    country: "United States",
    keywords: ["new york", "nyc", "ny", "нью-йорк", "jfk", "ewr", "lga", "manhattan"],
  },
  {
    label: "San Francisco, USA",
    shortLabel: "San Francisco",
    timeZone: "America/Los_Angeles",
    category: "city",
    country: "United States",
    keywords: ["san francisco", "sf", "sfo", "bay area", "silicon valley", "сан-франциско", "palo alto", "mountain view"],
  },
  {
    label: "Los Angeles, USA",
    shortLabel: "Los Angeles",
    timeZone: "America/Los_Angeles",
    category: "city",
    country: "United States",
    keywords: ["los angeles", "la", "lax", "лос-анджелес", "california", "калифорния"],
  },
  {
    label: "Seattle, USA",
    shortLabel: "Seattle",
    timeZone: "America/Los_Angeles",
    category: "city",
    country: "United States",
    keywords: ["seattle", "sea", "сиэтл"],
  },
  {
    label: "Chicago, USA",
    shortLabel: "Chicago",
    timeZone: "America/Chicago",
    category: "city",
    country: "United States",
    keywords: ["chicago", "ord", "чикаго"],
  },
  {
    label: "Austin, USA",
    shortLabel: "Austin",
    timeZone: "America/Chicago",
    category: "city",
    country: "United States",
    keywords: ["austin", "aus", "остин", "texas", "техас", "dallas", "houston"],
  },
  {
    label: "Boston, USA",
    shortLabel: "Boston",
    timeZone: "America/New_York",
    category: "city",
    country: "United States",
    keywords: ["boston", "bos", "бостон"],
  },
  {
    label: "Miami, USA",
    shortLabel: "Miami",
    timeZone: "America/New_York",
    category: "city",
    country: "United States",
    keywords: ["miami", "mia", "майами"],
  },
  {
    label: "Toronto, Canada",
    shortLabel: "Toronto",
    timeZone: "America/Toronto",
    category: "city",
    country: "Canada",
    keywords: ["toronto", "yyz", "торонто"],
  },
  {
    label: "Vancouver, Canada",
    shortLabel: "Vancouver",
    timeZone: "America/Vancouver",
    category: "city",
    country: "Canada",
    keywords: ["vancouver", "yvr", "ванкувер"],
  },
  {
    label: "Singapore",
    shortLabel: "Singapore",
    timeZone: "Asia/Singapore",
    category: "city",
    country: "Singapore",
    keywords: ["singapore", "сингапур", "sin"],
  },
  {
    label: "Hong Kong",
    shortLabel: "Hong Kong",
    timeZone: "Asia/Hong_Kong",
    category: "city",
    country: "Hong Kong",
    keywords: ["hong kong", "гонконг", "hkg"],
  },
  {
    label: "Tokyo, Japan",
    shortLabel: "Tokyo",
    timeZone: "Asia/Tokyo",
    category: "city",
    country: "Japan",
    keywords: ["tokyo", "токио", "hnd", "nrt"],
  },
  {
    label: "Seoul, South Korea",
    shortLabel: "Seoul",
    timeZone: "Asia/Seoul",
    category: "city",
    country: "South Korea",
    keywords: ["seoul", "сеул", "icn"],
  },
  {
    label: "Shanghai, China",
    shortLabel: "Shanghai",
    timeZone: "Asia/Shanghai",
    category: "city",
    country: "China",
    keywords: ["shanghai", "шанхай", "pvg", "beijing", "пекин", "pek", "shenzhen", "шэньчжэнь", "china", "китай"],
  },
  {
    label: "Bangkok, Thailand",
    shortLabel: "Bangkok",
    timeZone: "Asia/Bangkok",
    category: "city",
    country: "Thailand",
    keywords: ["bangkok", "бангкок", "bkk", "phuket", "пхукет", "hkt", "pattaya", "паттайя", "samui", "самуи", "thailand", "таиланд"],
  },
  {
    label: "Bali, Indonesia",
    shortLabel: "Bali",
    timeZone: "Asia/Makassar",
    category: "city",
    country: "Indonesia",
    keywords: ["bali", "бали", "denpasar", "dps"],
  },
  {
    label: "Jakarta, Indonesia",
    shortLabel: "Jakarta",
    timeZone: "Asia/Jakarta",
    category: "city",
    country: "Indonesia",
    keywords: ["jakarta", "джакарта", "cgk"],
  },
  {
    label: "Mumbai, India",
    shortLabel: "Mumbai",
    timeZone: "Asia/Kolkata",
    category: "city",
    country: "India",
    keywords: ["mumbai", "мумбаи", "bom", "bangalore", "bengaluru", "бангалор", "blr", "delhi", "new delhi", "дели", "del", "goa", "гоа"],
  },
  {
    label: "Sydney, Australia",
    shortLabel: "Sydney",
    timeZone: "Australia/Sydney",
    category: "city",
    country: "Australia",
    keywords: ["sydney", "сидней", "syd", "melbourne", "мельбурн", "mel"],
  },
  {
    label: "Auckland, New Zealand",
    shortLabel: "Auckland",
    timeZone: "Pacific/Auckland",
    category: "city",
    country: "New Zealand",
    keywords: ["auckland", "окленд", "akl"],
  },
  {
    label: "São Paulo, Brazil",
    shortLabel: "São Paulo",
    timeZone: "America/Sao_Paulo",
    category: "city",
    country: "Brazil",
    keywords: ["sao paulo", "são paulo", "сан-паулу", "gru", "rio de janeiro", "рио-де-жанейро"],
  },
  {
    label: "Buenos Aires, Argentina",
    shortLabel: "Buenos Aires",
    timeZone: "America/Argentina/Buenos_Aires",
    category: "city",
    country: "Argentina",
    keywords: ["buenos aires", "буэнос-айрес", "eze"],
  },
  {
    label: "Mexico City, Mexico",
    shortLabel: "Mexico City",
    timeZone: "America/Mexico_City",
    category: "city",
    country: "Mexico",
    keywords: ["mexico city", "мехико", "mex", "cdmx"],
  },
];

function toResolved(entry: AliasEntry): ResolvedLocation {
  return {
    id: `${entry.category}:${entry.shortLabel}:${entry.timeZone}:${entry.fixedOffsetMinutes ?? ""}`,
    label: entry.label,
    shortLabel: entry.shortLabel,
    timeZone: entry.timeZone,
    fixedOffsetMinutes: entry.fixedOffsetMinutes,
    category: entry.category,
    country: entry.country,
    ianaName: entry.timeZone,
  };
}

/**
 * Checks if a timezone string is valid in the current JS runtime.
 */
export function isValidIanaTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Parses explicit UTC/GMT offset strings like "UTC+4", "UTC-05:00", "GMT+3:30", "+06:00".
 */
export function parseExplicitOffset(raw: string): ResolvedLocation | null {
  const trimmed = raw.trim();
  const match = /^(?:(utc|gmt)\s*)?([+-])(\d{1,2})(?::?(\d{2}))?$/i.exec(trimmed);
  if (!match) return null;

  const hasPrefix = Boolean(match[1]);
  const hasColon = trimmed.includes(":");
  if (!hasPrefix && !hasColon) {
    return null;
  }

  const sign = match[2] === "+" ? 1 : -1;
  const hours = parseInt(match[3], 10);
  const minutes = match[4] ? parseInt(match[4], 10) : 0;
  if (hours > 14 || minutes >= 60) return null;

  const totalMinutes = sign * (hours * 60 + minutes);
  const formattedSign = totalMinutes >= 0 ? "+" : "-";
  const absMins = Math.abs(totalMinutes);
  const hh = String(Math.floor(absMins / 60)).padStart(2, "0");
  const mm = String(absMins % 60).padStart(2, "0");
  const shortLabel = `UTC${formattedSign}${hh}:${mm}`;

  return {
    id: `offset:${shortLabel}`,
    label: `${shortLabel} (Fixed Offset)`,
    shortLabel,
    timeZone: "UTC",
    fixedOffsetMinutes: totalMinutes,
    category: "offset",
    ianaName: shortLabel,
  };
}

/**
 * Strips leading/trailing filler words like "time in", "current time in", "time at", "time", "in", "at".
 */
export function cleanLocationQuery(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:what\s+time\s+is\s+it\s+in|current\s+time\s+in|time\s+in|time\s+at|время\s+в|время\s+на|in|at|в|во)\s+/i, "")
    .replace(/\s+(?:current\s+time|time|timezone|time\s+zone|время)$/i, "")
    .trim();
}

function normalizeCityKey(str: string): string {
  return str
    .toLowerCase()
    .replace(/['’`-]/g, " ")
    .replace(/ё/g, "е")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Resolves a single location/timezone token into the best matching ResolvedLocation (or multiple candidates for search).
 */
export function resolveLocations(rawQuery: string, limit = 5): ResolvedLocation[] {
  const cleaned = cleanLocationQuery(rawQuery);
  if (!cleaned) return [];

  const lower = cleaned.toLowerCase();
  const norm = normalizeCityKey(cleaned);

  // 0. Check "local" / "my time" / "here" / "me"
  if (["local", "my time", "my timezone", "here", "me", "home"].includes(lower)) {
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return [
      {
        id: `local:${localTz}`,
        label: `Local Time (${localTz})`,
        shortLabel: "Local",
        timeZone: localTz,
        category: "timezone",
        ianaName: localTz,
      },
    ];
  }

  // 1. Check explicit offset like UTC+4, GMT-5, UTC+05:30
  const explicitOffset = parseExplicitOffset(cleaned);
  if (explicitOffset) {
    return [explicitOffset];
  }

  const results: ResolvedLocation[] = [];
  const seenIds = new Set<string>();

  const pushUnique = (loc: ResolvedLocation) => {
    const dedupeKey = `${loc.shortLabel.toLowerCase()}|${loc.timeZone}|${loc.fixedOffsetMinutes ?? ""}`;
    if (!seenIds.has(dedupeKey) && isValidIanaTimeZone(loc.timeZone)) {
      seenIds.add(dedupeKey);
      results.push(loc);
    }
  };

  // 2. Exact match in TIMEZONE_ABBREVIATIONS or CURATED_CITIES
  for (const entry of TIMEZONE_ABBREVIATIONS) {
    if (entry.keywords.includes(lower) || entry.shortLabel.toLowerCase() === lower) {
      pushUnique(toResolved(entry));
    }
  }
  for (const entry of CURATED_CITIES) {
    if (entry.keywords.includes(lower) || entry.shortLabel.toLowerCase() === lower) {
      pushUnique(toResolved(entry));
    }
  }

  // 3. Exact match in bundled Russian Cities (1,134 cities in both Cyrillic & Latin)
  for (const rc of russianCities) {
    if (normalizeCityKey(rc.ru) === norm || normalizeCityKey(rc.en) === norm) {
      const isCyrillicQuery = /[а-яё]/i.test(cleaned);
      const displayCity = isCyrillicQuery ? `${rc.ru} (${rc.en})` : `${rc.en} (${rc.ru})`;
      pushUnique({
        id: `ru-city:${rc.en}:${rc.tz}`,
        label: `${displayCity}, Russia`,
        shortLabel: isCyrillicQuery ? rc.ru : rc.en,
        timeZone: rc.tz,
        category: "city",
        country: "Russia",
        ianaName: rc.tz,
      });
    }
  }

  // 4. Direct IANA timezone match (e.g. "Europe/Samara" or "America/New_York")
  if (cleaned.includes("/") && isValidIanaTimeZone(cleaned)) {
    const parts = cleaned.split("/");
    const cityPart = parts[parts.length - 1].replace(/_/g, " ");
    pushUnique({
      id: `iana:${cleaned}`,
      label: `${cityPart} (${cleaned})`,
      shortLabel: cityPart,
      timeZone: cleaned,
      category: "timezone",
      ianaName: cleaned,
    });
  }

  // 5. Exact city match from city-timezones database (7,329 global cities)
  const exactCities = cityTimezones.lookupViaCity(cleaned);
  if (exactCities && exactCities.length > 0) {
    const sorted = [...exactCities].sort((a, b) => (b.pop || 0) - (a.pop || 0));
    for (const c of sorted) {
      if (c.timezone) {
        pushUnique({
          id: `city:${c.city}:${c.country}:${c.timezone}`,
          label: `${c.city}, ${c.country}`,
          shortLabel: c.city,
          timeZone: c.timezone,
          category: "city",
          country: c.country,
          ianaName: c.timezone,
        });
      }
      if (results.length >= limit) break;
    }
  }

  // 6. Check dynamic geocoding cache (Open-Meteo GeoNames results)
  const cachedDynamic = dynamicCityCache.get(norm);
  if (cachedDynamic) {
    for (const loc of cachedDynamic) {
      pushUnique(loc);
    }
  }

  if (results.length > 0 && limit === 1) {
    return results.slice(0, 1);
  }

  // 7. Prefix / substring match across Curated, Russian Cities, and Global Cities (only when query >= 2 chars)
  if (norm.length >= 2) {
    for (const entry of [...TIMEZONE_ABBREVIATIONS, ...CURATED_CITIES]) {
      if (
        entry.label.toLowerCase().includes(lower) ||
        entry.keywords.some((k) => k.startsWith(lower) || (lower.length >= 4 && k.includes(lower)))
      ) {
        pushUnique(toResolved(entry));
      }
    }

    // Prefix matches in Russian cities sorted by population
    const ruPrefixMatches = russianCities
      .filter((rc) => {
        const ruNorm = normalizeCityKey(rc.ru);
        const enNorm = normalizeCityKey(rc.en);
        return ruNorm.startsWith(norm) || enNorm.startsWith(norm) || (norm.length >= 4 && (ruNorm.includes(norm) || enNorm.includes(norm)));
      })
      .sort((a, b) => (b.pop || 0) - (a.pop || 0));

    const isCyrillicQuery = /[а-яё]/i.test(cleaned);
    for (const rc of ruPrefixMatches.slice(0, limit)) {
      const displayCity = isCyrillicQuery ? `${rc.ru} (${rc.en})` : `${rc.en} (${rc.ru})`;
      pushUnique({
        id: `ru-city:${rc.en}:${rc.tz}`,
        label: `${displayCity}, Russia`,
        shortLabel: isCyrillicQuery ? rc.ru : rc.en,
        timeZone: rc.tz,
        category: "city",
        country: "Russia",
        ianaName: rc.tz,
      });
    }

    // Prefix match on city name in city-timezones first (before falling back to province match)
    const cityMapping = cityTimezones.cityMapping || [];
    const cityPrefixMatches = cityMapping
      .filter((c) => {
        const cName = (c.city || "").toLowerCase();
        const cAscii = (c.city_ascii || "").toLowerCase();
        return cName.startsWith(lower) || cAscii.startsWith(lower);
      })
      .sort((a, b) => (b.pop || 0) - (a.pop || 0));

    for (const c of cityPrefixMatches.slice(0, limit)) {
      if (c.timezone) {
        pushUnique({
          id: `city:${c.city}:${c.country}:${c.timezone}`,
          label: `${c.city}, ${c.country}`,
          shortLabel: c.city,
          timeZone: c.timezone,
          category: "city",
          country: c.country,
          ianaName: c.timezone,
        });
      }
      if (results.length >= limit) break;
    }

    if (results.length === 0) {
      const partialCities = cityTimezones.findFromCityStateProvince(cleaned);
      if (partialCities && partialCities.length > 0) {
        const sorted = [...partialCities].sort((a, b) => (b.pop || 0) - (a.pop || 0));
        for (const c of sorted) {
          if (c.timezone) {
            pushUnique({
              id: `city:${c.city}:${c.country}:${c.timezone}`,
              label: `${c.city}, ${c.country}`,
              shortLabel: c.city,
              timeZone: c.timezone,
              category: "city",
              country: c.country,
              ianaName: c.timezone,
            });
          }
          if (results.length >= limit) break;
        }
      }
    }
  }

  return results.slice(0, limit);
}

/**
 * Resolves the single best matching location for a query token.
 */
export function resolveBestLocation(rawQuery: string): ResolvedLocation | null {
  const matches = resolveLocations(rawQuery, 1);
  return matches.length > 0 ? matches[0] : null;
}

interface OpenMeteoResult {
  id: number;
  name: string;
  country?: string;
  admin1?: string;
  timezone?: string;
  population?: number;
}

/**
 * Queries Open-Meteo's free GeoNames API (11M+ locations in all languages, no API key required)
 * and caches the result so any city/town on Earth can be resolved dynamically.
 */
export async function geocodeCityOnline(rawCityQuery: string): Promise<ResolvedLocation[]> {
  const cleaned = cleanLocationQuery(rawCityQuery);
  if (!cleaned || cleaned.length < 2) return [];

  const norm = normalizeCityKey(cleaned);
  if (dynamicCityCache.has(norm)) {
    return dynamicCityCache.get(norm)!;
  }

  const lang = /[а-яё]/i.test(cleaned) ? "ru" : "en";
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cleaned)}&count=5&language=${lang}&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = (await res.json()) as { results?: OpenMeteoResult[] };
    const list: ResolvedLocation[] = [];

    for (const item of data.results || []) {
      if (item.timezone && isValidIanaTimeZone(item.timezone)) {
        const region = item.country ? (item.admin1 ? `${item.admin1}, ${item.country}` : item.country) : "";
        list.push({
          id: `geo:${item.id}:${item.timezone}`,
          label: region ? `${item.name}, ${region}` : item.name,
          shortLabel: item.name,
          timeZone: item.timezone,
          category: "city",
          country: item.country,
          ianaName: item.timezone,
        });
      }
    }

    dynamicCityCache.set(norm, list);
    for (const loc of list) {
      const locNorm = normalizeCityKey(loc.shortLabel);
      if (!dynamicCityCache.has(locNorm)) {
        dynamicCityCache.set(locNorm, [loc]);
      }
    }
    return list;
  } catch {
    return [];
  }
}
