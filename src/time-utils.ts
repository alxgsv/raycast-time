import {
  ResolvedLocation,
  resolveBestLocation,
  resolveLocations,
  cleanLocationQuery,
} from "./locations";

export interface WallClockParts {
  year: number;
  month: number; // 1-12
  day: number; // 1-31
  hour: number; // 0-23
  minute: number; // 0-59
  second: number; // 0-59
  weekdayShort: string;
}

export interface SmartResultItem {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  accessories: Array<{
    text?: string;
    tag?: { value: string; color?: string };
    tooltip?: string;
  }>;
  copyValue: string;
  secondaryCopyValue?: string;
  secondaryCopyLabel?: string;
  targetDate: Date;
  location?: ResolvedLocation;
  sourceLocation?: ResolvedLocation;
  markdownDetail: string;
  icon: string;
}

const MONTH_NAME_TO_NUMBER: Record<string, number> = {
  jan: 1,
  january: 1,
  янв: 1,
  январь: 1,
  января: 1,
  feb: 2,
  february: 2,
  фев: 2,
  февраль: 2,
  февраля: 2,
  mar: 3,
  march: 3,
  мар: 3,
  март: 3,
  марта: 3,
  apr: 4,
  april: 4,
  апр: 4,
  апрель: 4,
  апреля: 4,
  may: 5,
  май: 5,
  мая: 5,
  jun: 6,
  june: 6,
  июн: 6,
  июнь: 6,
  июня: 6,
  jul: 7,
  july: 7,
  июл: 7,
  июль: 7,
  июля: 7,
  aug: 8,
  august: 8,
  авг: 8,
  август: 8,
  августа: 8,
  sep: 9,
  sept: 9,
  september: 9,
  сен: 9,
  сент: 9,
  сентябрь: 9,
  сентября: 9,
  oct: 10,
  october: 10,
  окт: 10,
  октябрь: 10,
  октября: 10,
  nov: 11,
  november: 11,
  ноя: 11,
  нояб: 11,
  ноябрь: 11,
  ноября: 11,
  dec: 12,
  december: 12,
  дек: 12,
  декабрь: 12,
  декабря: 12,
};

const MONTH_PATTERN = Object.keys(MONTH_NAME_TO_NUMBER)
  .sort((a, b) => b.length - a.length)
  .join("|");

/**
 * Returns the user's current system timezone as a ResolvedLocation,
 * or accepts an override for deterministic unit testing.
 */
export function getLocalLocation(overrideTimeZone?: string): ResolvedLocation {
  const tz = overrideTimeZone || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const parts = tz.split("/");
  const cityPart = parts[parts.length - 1].replace(/_/g, " ");
  return {
    id: `local:${tz}`,
    label: `Local (${tz})`,
    shortLabel: cityPart || "Local",
    timeZone: tz,
    category: "timezone",
    ianaName: tz,
  };
}

/**
 * Extracts wall-clock date/time components for a Date in a given ResolvedLocation.
 */
export function getWallClockParts(date: Date, location: ResolvedLocation): WallClockParts {
  if (location.fixedOffsetMinutes !== undefined) {
    const shifted = new Date(date.getTime() + location.fixedOffsetMinutes * 60_000);
    const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      weekdayShort: weekdays[shifted.getUTCDay()],
    };
  }

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: location.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });

  const parts = formatter.formatToParts(date);
  const map: Record<string, string> = {};
  for (const p of parts) {
    if (p.type !== "literal") {
      map[p.type] = p.value;
    }
  }

  let hour = parseInt(map.hour || "0", 10);
  if (hour === 24) hour = 0;

  return {
    year: parseInt(map.year || "1970", 10),
    month: parseInt(map.month || "1", 10),
    day: parseInt(map.day || "1", 10),
    hour,
    minute: parseInt(map.minute || "0", 10),
    second: parseInt(map.second || "0", 10),
    weekdayShort: map.weekday || "",
  };
}

/**
 * Returns the UTC offset in minutes (e.g. +360 for UTC+6, -240 for UTC-4) for a Location at a given Date.
 */
export function getOffsetMinutes(date: Date, location: ResolvedLocation): number {
  if (location.fixedOffsetMinutes !== undefined) {
    return location.fixedOffsetMinutes;
  }
  const parts = getWallClockParts(date, location);
  const asUtcMs = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  const truncatedDateMs = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtcMs - truncatedDateMs) / 60_000);
}

/**
 * Formats an offset in minutes as "UTC+06:00" or "UTC-04:00" (or compact "UTC+6").
 */
export function formatUtcOffset(offsetMinutes: number, compact = false): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const mins = abs % 60;
  if (compact) {
    if (offsetMinutes === 0) return "UTC±0";
    return mins === 0 ? `UTC${sign}${hours}` : `UTC${sign}${hours}:${String(mins).padStart(2, "0")}`;
  }
  return `UTC${sign}${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

/**
 * Formats the relative difference between target timezone and local timezone.
 */
export function formatZoneDifference(
  targetOffsetMins: number,
  localOffsetMins: number
): { short: string; detailed: string; diffMinutes: number } {
  const diffMinutes = targetOffsetMins - localOffsetMins;
  if (diffMinutes === 0) {
    return { short: "Same time", detailed: "Same timezone offset as you", diffMinutes: 0 };
  }

  const sign = diffMinutes > 0 ? "+" : "-";
  const abs = Math.abs(diffMinutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;

  const durationStr = h > 0 && m > 0 ? `${h}h ${m}m` : h > 0 ? `${h}h` : `${m}m`;
  const short = `${sign}${durationStr}`;
  const direction = diffMinutes > 0 ? "ahead of you" : "behind you";

  return {
    short,
    detailed: `${durationStr} ${direction} (${short})`,
    diffMinutes,
  };
}

/**
 * Formats relative time from `now` to `targetDate` (e.g. "in 3h 15m", "2h 10m ago", "now").
 */
export function formatRelativeFromNow(targetDate: Date, now: Date): string {
  const diffMs = targetDate.getTime() - now.getTime();
  const absSec = Math.round(Math.abs(diffMs) / 1000);

  if (absSec < 30) {
    return "now";
  }

  const totalMinutes = Math.round(absSec / 60);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0 && days < 7) parts.push(`${minutes}m`);

  const joined = parts.join(" ") || "<1m";
  return diffMs > 0 ? `in ${joined}` : `${joined} ago`;
}

/**
 * Formats an exact countdown duration (including seconds when < 1 hour).
 */
export function formatExactCountdown(targetDate: Date, now: Date): string {
  const diffMs = targetDate.getTime() - now.getTime();
  const isFuture = diffMs >= 0;
  const totalSeconds = Math.max(0, Math.round(Math.abs(diffMs) / 1000));

  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (days === 0 && hours === 0 && seconds > 0) parts.push(`${seconds}s`);
  if (parts.length === 0) parts.push("0s");

  const text = parts.join(" ");
  return isFuture ? `in ${text}` : `${text} ago`;
}

/**
 * Formats a Date in a given ResolvedLocation.
 * Always outputs 24-hour HH:MM format.
 */
export function formatDateTimeInLocation(
  date: Date,
  location: ResolvedLocation
): {
  time24: string;
  primaryTime: string;
  dateShort: string;
  dateFull: string;
  isoString: string;
} {
  const parts = getWallClockParts(date, location);
  const offsetMins = getOffsetMinutes(date, location);

  const hh24 = String(parts.hour).padStart(2, "0");
  const mm = String(parts.minute).padStart(2, "0");
  const ss = String(parts.second).padStart(2, "0");
  const time24 = `${hh24}:${mm}`;

  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const monthName = months[parts.month - 1] || "";
  const dateShort = `${parts.weekdayShort}, ${monthName} ${parts.day}`;
  const dateFull = `${parts.weekdayShort}, ${monthName} ${parts.day}, ${parts.year}`;

  const sign = offsetMins >= 0 ? "+" : "-";
  const absOff = Math.abs(offsetMins);
  const offH = String(Math.floor(absOff / 60)).padStart(2, "0");
  const offM = String(absOff % 60).padStart(2, "0");
  const isoSuffix = offsetMins === 0 ? "Z" : `${sign}${offH}:${offM}`;
  const isoString = `${parts.year}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}T${hh24}:${mm}:${ss}${isoSuffix}`;

  return {
    time24,
    primaryTime: time24,
    dateShort,
    dateFull,
    isoString,
  };
}

/**
 * Creates a Date corresponding to a specific wall-clock time (hour, minute, second)
 * on the current date (plus optional `dayDelta` or `explicitDate`) in `location`.
 */
export function createDateInLocation(
  refDate: Date,
  location: ResolvedLocation,
  hour: number,
  minute: number,
  second = 0,
  dayDelta = 0,
  explicitDate?: { year: number; month: number; day: number }
): Date {
  const refParts = getWallClockParts(refDate, location);
  const year = explicitDate?.year ?? refParts.year;
  const month = explicitDate?.month ?? refParts.month;
  const day = (explicitDate?.day ?? refParts.day) + dayDelta;

  const initialOffset = getOffsetMinutes(refDate, location);
  const utcGuessMs = Date.UTC(year, month - 1, day, hour, minute, second) - initialOffset * 60_000;
  const guessDate = new Date(utcGuessMs);

  const refinedOffset = getOffsetMinutes(guessDate, location);
  return new Date(Date.UTC(year, month - 1, day, hour, minute, second) - refinedOffset * 60_000);
}

/**
 * Compares the calendar day in `location` at `date` vs `refDate`
 * and returns "Today", "Tomorrow", "Yesterday", or the short date.
 */
export function getDayLabel(date: Date, location: ResolvedLocation, refDate: Date): string {
  const targetParts = getWallClockParts(date, location);
  const refParts = getWallClockParts(refDate, location);

  const targetDayMs = Date.UTC(targetParts.year, targetParts.month - 1, targetParts.day);
  const refDayMs = Date.UTC(refParts.year, refParts.month - 1, refParts.day);
  const diffDays = Math.round((targetDayMs - refDayMs) / 86_400_000);

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${targetParts.weekdayShort}, ${months[targetParts.month - 1]} ${targetParts.day}`;
}

export interface ParsedTimeOfDay {
  hour: number;
  minute: number;
  second: number;
  dayDelta: number;
  explicitDate?: {
    year: number;
    month: number;
    day: number;
  };
}

function inferYear(month: number, day: number, refDate: Date): number {
  const refYear = refDate.getFullYear();
  const candidateMs = Date.UTC(refYear, month - 1, day, 12, 0, 0);
  // If the date is more than 60 days in the past relative to refDate, assume next year
  if (candidateMs < refDate.getTime() - 60 * 86_400_000) {
    return refYear + 1;
  }
  return refYear;
}

/**
 * Extracts an explicit calendar date from a string if present, returning both `explicitDate` and the remaining text.
 * Supports:
 * - "7 november", "7th of november", "7 nov 2026", "7 ноября"
 * - "november 7", "nov 7th", "november 7, 2026"
 * - "2026-11-07"
 * - "07.11", "07.11.2026"
 */
export function extractExplicitDate(
  rawText: string,
  refDate: Date = new Date()
): { explicitDate?: { year: number; month: number; day: number }; remainingText: string } {
  let text = rawText.trim();

  // 1. ISO date: YYYY-MM-DD
  const isoMatch = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10);
    const month = parseInt(isoMatch[2], 10);
    const day = parseInt(isoMatch[3], 10);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      text = (text.slice(0, isoMatch.index) + " " + text.slice(isoMatch.index + isoMatch[0].length)).trim();
      return { explicitDate: { year, month, day }, remainingText: text };
    }
  }

  // 2. Dot-separated date: DD.MM(.YYYY)?
  const dotMatch = /\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/.exec(text);
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10);
    const month = parseInt(dotMatch[2], 10);
    const year = dotMatch[3] ? parseInt(dotMatch[3], 10) : inferYear(month, day, refDate);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      text = (text.slice(0, dotMatch.index) + " " + text.slice(dotMatch.index + dotMatch[0].length)).trim();
      return { explicitDate: { year, month, day }, remainingText: text };
    }
  }

  // 3. "<day> (of )?<monthName>( <year>)?" e.g. "7 november", "7th nov", "7 ноября"
  const dayFirstRegex = new RegExp(
    `(?:^|\\s)(?:on\\s+)?(\\d{1,2})(?:st|nd|rd|th|-го|-е)?\\s+(?:of\\s+)?(${MONTH_PATTERN})(?:[.,]?\\s*(\\d{4}))?(?=\\s|$)`,
    "i"
  );
  const dayFirstMatch = dayFirstRegex.exec(text);
  if (dayFirstMatch) {
    const day = parseInt(dayFirstMatch[1], 10);
    const monthKey = dayFirstMatch[2].toLowerCase();
    const month = MONTH_NAME_TO_NUMBER[monthKey];
    if (month && day >= 1 && day <= 31) {
      const year = dayFirstMatch[3] ? parseInt(dayFirstMatch[3], 10) : inferYear(month, day, refDate);
      text = (text.slice(0, dayFirstMatch.index) + " " + text.slice(dayFirstMatch.index + dayFirstMatch[0].length)).trim();
      return { explicitDate: { year, month, day }, remainingText: text };
    }
  }

  // 4. "<monthName> <day>(, <year>)?" e.g. "november 7", "nov 7th", "ноябрь 7"
  const monthFirstRegex = new RegExp(
    `(?:^|\\s)(?:on\\s+)?(${MONTH_PATTERN})\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:[.,]?\\s*(\\d{4}))?(?=\\s|$)`,
    "i"
  );
  const monthFirstMatch = monthFirstRegex.exec(text);
  if (monthFirstMatch) {
    const monthKey = monthFirstMatch[1].toLowerCase();
    const day = parseInt(monthFirstMatch[2], 10);
    const month = MONTH_NAME_TO_NUMBER[monthKey];
    if (month && day >= 1 && day <= 31) {
      const year = monthFirstMatch[3] ? parseInt(monthFirstMatch[3], 10) : inferYear(month, day, refDate);
      text = (text.slice(0, monthFirstMatch.index) + " " + text.slice(monthFirstMatch.index + monthFirstMatch[0].length)).trim();
      return { explicitDate: { year, month, day }, remainingText: text };
    }
  }

  return { remainingText: text };
}

/**
 * Parses a time/date expression like:
 * - "9am", "9:00", "09:30pm", "18:45", "noon", "midnight"
 * - "tomorrow 11:00", "yesterday 9am"
 * - "7 november 11:00", "nov 7 9am", "11:00 7 november", "7 ноября 11:00", "07.11 11:00"
 */
export function parseTimeToken(raw: string, refDate: Date = new Date()): ParsedTimeOfDay | null {
  let text = raw.trim().toLowerCase();
  if (!text) return null;

  let dayDelta = 0;

  if (/\b(?:tomorrow|tmrw|tmr|завтра)\b/.test(text)) {
    dayDelta = 1;
    text = text.replace(/\b(?:tomorrow|tmrw|tmr|завтра)\b/g, " ").trim();
  } else if (/\b(?:yesterday|вчера)\b/.test(text)) {
    dayDelta = -1;
    text = text.replace(/\b(?:yesterday|вчера)\b/g, " ").trim();
  } else if (/\b(?:today|сегодня)\b/.test(text)) {
    text = text.replace(/\b(?:today|сегодня)\b/g, " ").trim();
  }

  const { explicitDate, remainingText } = extractExplicitDate(text, refDate);
  text = remainingText
    .replace(/^(?:at|в|во|on)\s+/i, "")
    .replace(/\s+(?:at|в|во|on)\s+/gi, " ")
    .trim();

  // If only an explicit date was provided (e.g. "7 november" without time), default to 09:00
  if (explicitDate && !text) {
    return { hour: 9, minute: 0, second: 0, dayDelta: 0, explicitDate };
  }

  if (text === "noon" || text === "12noon" || text === "полдень") {
    return { hour: 12, minute: 0, second: 0, dayDelta, explicitDate };
  }
  if (text === "midnight" || text === "полночь") {
    return { hour: 0, minute: 0, second: 0, dayDelta, explicitDate };
  }

  // Match HH:MM(:SS)? (am|pm)? OR H(am|pm)
  const match = /^(\d{1,2})(?:[:.](\d{2})(?:[:.](\d{2}))?)?\s*(am|pm|a\.m\.|p\.m\.|a|p)?$/i.exec(text);
  if (!match) return null;

  const hasColon = text.includes(":") || text.includes(".");
  const hasMeridiem = Boolean(match[4]);

  if (!hasColon && !hasMeridiem) return null;

  let hour = parseInt(match[1], 10);
  const minute = match[2] ? parseInt(match[2], 10) : 0;
  const second = match[3] ? parseInt(match[3], 10) : 0;
  const meridiem = match[4]?.toLowerCase().replace(/\./g, "");

  if (minute >= 60 || second >= 60) return null;

  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    const isPm = meridiem.startsWith("p");
    if (isPm && hour < 12) hour += 12;
    if (!isPm && hour === 12) hour = 0;
  } else {
    if (hour > 24) return null;
    if (hour === 24) hour = 0;
  }

  return { hour, minute, second, dayDelta, explicitDate };
}

/**
 * Builds rich Markdown detail for a conversion or location card.
 * All times are strictly 24-hour HH:MM.
 */
function buildMarkdownDetail(params: {
  heading: string;
  targetDate: Date;
  now: Date;
  localLocation: ResolvedLocation;
  primaryLocation: ResolvedLocation;
  secondaryLocation?: ResolvedLocation;
}): string {
  const { heading, targetDate, now, localLocation, primaryLocation, secondaryLocation } = params;
  const primaryFmt = formatDateTimeInLocation(targetDate, primaryLocation);
  const localFmt = formatDateTimeInLocation(targetDate, localLocation);
  const utcLoc = resolveBestLocation("UTC")!;
  const utcFmt = formatDateTimeInLocation(targetDate, utcLoc);

  const primaryOffset = getOffsetMinutes(targetDate, primaryLocation);
  const localOffset = getOffsetMinutes(targetDate, localLocation);
  const diff = formatZoneDifference(primaryOffset, localOffset);
  const relNow = formatRelativeFromNow(targetDate, now);
  const unixSec = Math.floor(targetDate.getTime() / 1000);

  const lines: string[] = [
    `# ${heading}`,
    "",
    `| Location | Time (24h) | Date | Offset |`,
    `| :--- | :--- | :--- | :--- |`,
    `| **${primaryLocation.label}** | **${primaryFmt.time24}** | ${primaryFmt.dateFull} | \`${formatUtcOffset(primaryOffset)}\` |`,
  ];

  if (secondaryLocation && secondaryLocation.id !== primaryLocation.id) {
    const secFmt = formatDateTimeInLocation(targetDate, secondaryLocation);
    const secOff = getOffsetMinutes(targetDate, secondaryLocation);
    lines.push(
      `| **${secondaryLocation.label}** | **${secFmt.time24}** | ${secFmt.dateFull} | \`${formatUtcOffset(secOff)}\` |`
    );
  }

  if (primaryLocation.id !== localLocation.id && (!secondaryLocation || secondaryLocation.id !== localLocation.id)) {
    lines.push(
      `| **Your Time (${localLocation.shortLabel})** | **${localFmt.time24}** | ${localFmt.dateFull} | \`${formatUtcOffset(localOffset)}\` |`
    );
  }

  if (primaryLocation.timeZone !== "UTC" || primaryLocation.fixedOffsetMinutes !== 0) {
    lines.push(`| **UTC** | **${utcFmt.time24}** | ${utcFmt.dateFull} | \`UTC+00:00\` |`);
  }

  lines.push(
    "",
    "---",
    `- **Difference to your timezone:** ${diff.detailed}`,
    `- **Relative to now:** ${relNow}`,
    `- **ISO 8601:** \`${primaryFmt.isoString}\``,
    `- **Unix Timestamp:** \`${unixSec}\` (\`${targetDate.getTime()}\` ms)`,
    `- **Discord Timestamp:** \`<t:${unixSec}:F>\` / \`<t:${unixSec}:R>\``
  );

  return lines.join("\n");
}

/**
 * Builds a SmartResultItem showing the current time in a specific ResolvedLocation.
 */
export function buildLocationCurrentTimeItem(
  location: ResolvedLocation,
  now: Date,
  localLocation: ResolvedLocation,
  section = "Location & Timezone"
): SmartResultItem {
  const fmt = formatDateTimeInLocation(now, location);
  const localFmt = formatDateTimeInLocation(now, localLocation);
  const locOffset = getOffsetMinutes(now, location);
  const localOffset = getOffsetMinutes(now, localLocation);
  const diff = formatZoneDifference(locOffset, localOffset);
  const dayLabel = getDayLabel(now, location, now);

  const utcTag = formatUtcOffset(locOffset, true);

  return {
    id: `loc-now:${location.id}`,
    section,
    title: `${fmt.time24}  —  ${location.label}`,
    subtitle: `${fmt.dateFull}`,
    accessories: [
      {
        tag: {
          value: diff.short,
          color: diff.diffMinutes === 0 ? "green" : diff.diffMinutes > 0 ? "blue" : "orange",
        },
        tooltip: diff.detailed,
      },
      {
        text: `${location.ianaName === location.shortLabel ? utcTag : `${location.ianaName} · ${utcTag}`}`,
        tooltip: `Your local time: ${localFmt.time24} (${formatUtcOffset(localOffset, true)})`,
      },
    ],
    copyValue: `${fmt.time24} (${location.shortLabel}, ${utcTag})`,
    secondaryCopyValue: fmt.isoString,
    secondaryCopyLabel: "Copy ISO 8601 String",
    targetDate: now,
    location,
    markdownDetail: buildMarkdownDetail({
      heading: `${fmt.time24} in ${location.label} (${dayLabel})`,
      targetDate: now,
      now,
      localLocation,
      primaryLocation: location,
    }),
    icon: location.category === "city" ? "globe" : "clock",
  };
}

/**
 * Builds a SmartResultItem converting a specific time from `sourceLocation` to `targetLocation`.
 */
export function buildConversionItem(params: {
  sourceLocation: ResolvedLocation;
  targetLocation: ResolvedLocation;
  localLocation: ResolvedLocation;
  targetDate: Date;
  now: Date;
  section: string;
  idSuffix?: string;
}): SmartResultItem {
  const { sourceLocation, targetLocation, localLocation, targetDate, now, section, idSuffix = "" } = params;

  const srcFmt = formatDateTimeInLocation(targetDate, sourceLocation);
  const tgtFmt = formatDateTimeInLocation(targetDate, targetLocation);
  const srcOffset = getOffsetMinutes(targetDate, sourceLocation);
  const tgtOffset = getOffsetMinutes(targetDate, targetLocation);

  const srcToTgtDiff = formatZoneDifference(tgtOffset, srcOffset);
  const localOffset = getOffsetMinutes(targetDate, localLocation);
  const srcToLocalDiff = formatZoneDifference(srcOffset, localOffset);

  const relFromNow = formatRelativeFromNow(targetDate, now);
  const tgtDay = getDayLabel(targetDate, targetLocation, now);
  const srcDay = getDayLabel(targetDate, sourceLocation, now);

  const isTargetLocal = targetLocation.id === localLocation.id;
  const targetLabelDisplay = isTargetLocal ? `Your Time (${localLocation.shortLabel})` : targetLocation.label;

  return {
    id: `conv:${sourceLocation.id}->${targetLocation.id}:${targetDate.getTime()}${idSuffix}`,
    section,
    title: `${tgtFmt.time24} (${tgtDay}) in ${targetLabelDisplay}`,
    subtitle: `When ${sourceLocation.shortLabel} is ${srcFmt.time24} (${srcDay}) · ${tgtFmt.dateFull}`,
    accessories: [
      {
        tag: {
          value: relFromNow,
          color: targetDate.getTime() >= now.getTime() ? "green" : "secondary",
        },
        tooltip: `Relative to current time: ${relFromNow}`,
      },
      {
        tag: {
          value: isTargetLocal ? `Zone diff: ${srcToLocalDiff.short}` : `${srcToTgtDiff.short}`,
          color: "blue",
        },
        tooltip: isTargetLocal
          ? `${sourceLocation.shortLabel} (${formatUtcOffset(srcOffset, true)}) is ${srcToLocalDiff.detailed}`
          : `Difference between ${sourceLocation.shortLabel} and ${targetLocation.shortLabel}`,
      },
    ],
    copyValue: `${tgtFmt.time24} ${targetLocation.shortLabel} (${tgtFmt.dateShort})`,
    secondaryCopyValue: tgtFmt.isoString,
    secondaryCopyLabel: "Copy Converted ISO 8601",
    targetDate,
    location: targetLocation,
    sourceLocation,
    markdownDetail: buildMarkdownDetail({
      heading: `${sourceLocation.shortLabel} ${srcFmt.time24} → ${targetLabelDisplay} ${tgtFmt.time24}`,
      targetDate,
      now,
      localLocation,
      primaryLocation: targetLocation,
      secondaryLocation: sourceLocation,
    }),
    icon: "switch",
  };
}

/**
 * Parses relative time math expressions like:
 * - "in 45m", "in 2 hours", "in 1d 4h"
 * - "+3h 20m", "-45m"
 * - "2 hours ago", "3 days from now"
 * - "tomorrow 15:00", "yesterday 9am", "next friday 15:00"
 */
export function parseRelativeMathQuery(rawQuery: string, now: Date, localLocation: ResolvedLocation): { date: Date; label: string } | null {
  const text = rawQuery.trim().toLowerCase();

  // 1. Pattern: "in 2h 30m", "+3h 15m", "-45m", "2 hours ago", "45 mins from now"
  const relMatch =
    /^(?:(in|\+|-)\s*)?((?:\d+\s*(?:d|days?|h|hr|hrs|hours?|m|min|mins|minutes?|s|sec|secs|seconds?|w|weeks?|ч|мин|дн)\s*,?\s*(?:and\s*)?)+)(?:\s*(ago|from\s+now|later|назад))?$/i.exec(
      text
    );
  if (relMatch) {
    const prefix = relMatch[1];
    const body = relMatch[2];
    const suffix = relMatch[3];

    if (!prefix && !suffix) return null;

    let direction = 1;
    if (prefix === "-" || (suffix && /^(?:ago|назад)$/i.test(suffix))) {
      direction = -1;
    }

    const tokenRegex = /(\d+)\s*(w|weeks?|d|days?|дн|h|hr|hrs|hours?|ч|m|min|mins|minutes?|мин|s|sec|secs|seconds?)/gi;
    let totalMs = 0;
    let matchedAny = false;
    let m: RegExpExecArray | null;
    while ((m = tokenRegex.exec(body)) !== null) {
      matchedAny = true;
      const val = parseInt(m[1], 10);
      const unit = m[2].toLowerCase();
      if (unit.startsWith("w")) totalMs += val * 7 * 86_400_000;
      else if (unit.startsWith("d") || unit.startsWith("д")) totalMs += val * 86_400_000;
      else if (unit.startsWith("h") || unit.startsWith("ч")) totalMs += val * 3_600_000;
      else if (unit.startsWith("m") || unit.startsWith("м")) totalMs += val * 60_000;
      else if (unit.startsWith("s")) totalMs += val * 1_000;
    }

    if (matchedAny && totalMs > 0) {
      const targetDate = new Date(now.getTime() + direction * totalMs);
      return {
        date: targetDate,
        label: direction > 0 ? `Now + ${body.trim()}` : `Now - ${body.trim()}`,
      };
    }
  }

  // 2. Pattern: "tomorrow", "yesterday", "tomorrow 15:00", "yesterday 9am"
  if (/^(?:tomorrow|tmrw|завтра|yesterday|вчера)(?:\s+.+)?$/i.test(text)) {
    const isTomorrow = /^(?:tomorrow|tmrw|завтра)/i.test(text);
    const dayDelta = isTomorrow ? 1 : -1;
    const remainder = text.replace(/^(?:tomorrow|tmrw|завтра|yesterday|вчера)\s*/i, "").trim();
    if (!remainder) {
      const parts = getWallClockParts(now, localLocation);
      const d = createDateInLocation(now, localLocation, parts.hour, parts.minute, parts.second, dayDelta);
      return { date: d, label: isTomorrow ? "Tomorrow (same time)" : "Yesterday (same time)" };
    }
    const parsedTime = parseTimeToken(remainder, now);
    if (parsedTime) {
      const d = createDateInLocation(
        now,
        localLocation,
        parsedTime.hour,
        parsedTime.minute,
        parsedTime.second,
        dayDelta,
        parsedTime.explicitDate
      );
      return { date: d, label: `${isTomorrow ? "Tomorrow" : "Yesterday"}` };
    }
  }

  // 3. Pattern: "(next )?(monday|tuesday|...)( 15:00)?"
  const weekdayMatch = /^(?:(next|this)\s+)?(monday|mon|tuesday|tue|wednesday|wed|thursday|thu|friday|fri|saturday|sat|sunday|sun)(?:\s+(.+))?$/i.exec(
    text
  );
  if (weekdayMatch) {
    const modifier = weekdayMatch[1]?.toLowerCase();
    const dayName = weekdayMatch[2].toLowerCase().slice(0, 3);
    const timePart = weekdayMatch[3]?.trim();

    const dayIndexMap: Record<string, number> = {
      sun: 0,
      mon: 1,
      tue: 2,
      wed: 3,
      thu: 4,
      fri: 5,
      sat: 6,
    };
    const targetDow = dayIndexMap[dayName];
    const nowParts = getWallClockParts(now, localLocation);
    const currentDow = dayIndexMap[nowParts.weekdayShort.toLowerCase().slice(0, 3)] ?? now.getDay();

    let daysAhead = (targetDow - currentDow + 7) % 7;
    if (daysAhead === 0 || modifier === "next") {
      if (daysAhead === 0) daysAhead = 7;
    }

    let hour = 9;
    let minute = 0;
    let second = 0;
    if (timePart) {
      const parsedTime = parseTimeToken(timePart, now);
      if (!parsedTime) return null;
      hour = parsedTime.hour;
      minute = parsedTime.minute;
      second = parsedTime.second;
    } else {
      hour = nowParts.hour;
      minute = nowParts.minute;
      second = nowParts.second;
    }

    const d = createDateInLocation(now, localLocation, hour, minute, second, daysAhead);
    return {
      date: d,
      label: `${weekdayMatch[2][0].toUpperCase()}${weekdayMatch[2].slice(1)}`,
    };
  }

  return null;
}

/**
 * Parses a "Location + Time/Date" or "Time/Date + Location" or "SourceLocation Time/Date in TargetLocation" query.
 */
export function parseTimeConversionQuery(
  rawQuery: string,
  now: Date,
  localLocation: ResolvedLocation
): SmartResultItem[] {
  const trimmed = rawQuery.trim();
  if (!trimmed) return [];

  const separatorRegex = /^(.+?)\s+(?:in|to|as|->|→)\s+(.+)$/i;
  const sepMatch = separatorRegex.exec(trimmed);

  if (sepMatch) {
    const leftSide = sepMatch[1].trim();
    const rightSide = sepMatch[2].trim();

    if (/^(?:what\s+time\s+is\s+it|current\s+time|time|время)$/i.test(leftSide)) {
      return [];
    }
    if (/^now$/i.test(leftSide)) {
      const targetLoc = resolveBestLocation(rightSide);
      if (targetLoc) {
        return [buildLocationCurrentTimeItem(targetLoc, now, localLocation, "Time Conversion")];
      }
    }

    const targetLoc = resolveBestLocation(rightSide);
    if (targetLoc) {
      const justTime = parseTimeToken(leftSide, now);
      if (justTime) {
        const dateFromLocal = createDateInLocation(
          now,
          localLocation,
          justTime.hour,
          justTime.minute,
          justTime.second,
          justTime.dayDelta,
          justTime.explicitDate
        );
        const dateFromTarget = createDateInLocation(
          now,
          targetLoc,
          justTime.hour,
          justTime.minute,
          justTime.second,
          justTime.dayDelta,
          justTime.explicitDate
        );

        const items: SmartResultItem[] = [
          buildConversionItem({
            sourceLocation: localLocation,
            targetLocation: targetLoc,
            localLocation,
            targetDate: dateFromLocal,
            now,
            section: `Convert Local Time → ${targetLoc.shortLabel}`,
            idSuffix: ":local-to-target",
          }),
        ];

        if (targetLoc.id !== localLocation.id) {
          items.push(
            buildConversionItem({
              sourceLocation: targetLoc,
              targetLocation: localLocation,
              localLocation,
              targetDate: dateFromTarget,
              now,
              section: `When ${targetLoc.shortLabel} is at this time → Your Time`,
              idSuffix: ":target-to-local",
            })
          );
        }

        return items;
      }

      const srcAndTime = splitLocationAndTime(leftSide, now);
      if (srcAndTime) {
        const { location: sourceLoc, time: parsedTime } = srcAndTime;
        const targetDate = createDateInLocation(
          now,
          sourceLoc,
          parsedTime.hour,
          parsedTime.minute,
          parsedTime.second,
          parsedTime.dayDelta,
          parsedTime.explicitDate
        );
        const items: SmartResultItem[] = [
          buildConversionItem({
            sourceLocation: sourceLoc,
            targetLocation: targetLoc,
            localLocation,
            targetDate,
            now,
            section: `${sourceLoc.shortLabel} → ${targetLoc.shortLabel}`,
          }),
        ];

        if (targetLoc.id !== localLocation.id && sourceLoc.id !== localLocation.id) {
          items.push(
            buildConversionItem({
              sourceLocation: sourceLoc,
              targetLocation: localLocation,
              localLocation,
              targetDate,
              now,
              section: `In Your Local Timezone (${localLocation.shortLabel})`,
              idSuffix: ":also-local",
            })
          );
        }
        return items;
      }
    }
  }

  // Case without separator: "<Location> <Date/Time>" or "<Date/Time> <Location>"
  const split = splitLocationAndTime(trimmed, now);
  if (split) {
    const { location: sourceLoc, time: parsedTime } = split;
    const targetDate = createDateInLocation(
      now,
      sourceLoc,
      parsedTime.hour,
      parsedTime.minute,
      parsedTime.second,
      parsedTime.dayDelta,
      parsedTime.explicitDate
    );

    const items: SmartResultItem[] = [
      buildConversionItem({
        sourceLocation: sourceLoc,
        targetLocation: localLocation,
        localLocation,
        targetDate,
        now,
        section: `${sourceLoc.shortLabel} → Your Time (${localLocation.shortLabel})`,
      }),
    ];

    // If no explicit date or dayDelta was given and today's time has already passed, also show tomorrow's occurrence
    if (!parsedTime.explicitDate && parsedTime.dayDelta === 0 && targetDate.getTime() < now.getTime() - 60_000) {
      const nextOccurrenceDate = createDateInLocation(
        now,
        sourceLoc,
        parsedTime.hour,
        parsedTime.minute,
        parsedTime.second,
        1
      );
      items.push(
        buildConversionItem({
          sourceLocation: sourceLoc,
          targetLocation: localLocation,
          localLocation,
          targetDate: nextOccurrenceDate,
          now,
          section: `${sourceLoc.shortLabel} → Your Time (${localLocation.shortLabel})`,
          idSuffix: ":next-day",
        })
      );
    }

    if (sourceLoc.id !== localLocation.id) {
      const inverseDate = createDateInLocation(
        now,
        localLocation,
        parsedTime.hour,
        parsedTime.minute,
        parsedTime.second,
        parsedTime.dayDelta,
        parsedTime.explicitDate
      );
      items.push(
        buildConversionItem({
          sourceLocation: localLocation,
          targetLocation: sourceLoc,
          localLocation,
          targetDate: inverseDate,
          now,
          section: `Reverse: Your Time → ${sourceLoc.shortLabel}`,
          idSuffix: ":reverse",
        })
      );
    }

    return items;
  }

  return [];
}

/**
 * Splits a string like "Togliatti 7 november 11:00", "UTC 9am", "7 november 11:00 Togliatti", "San Francisco 5:30 pm"
 * into `{ location, time }`.
 */
export function splitLocationAndTime(
  raw: string,
  refDate: Date = new Date()
): { location: ResolvedLocation; time: ParsedTimeOfDay } | null {
  const tokens = raw.trim().split(/\s+/);
  if (tokens.length < 2) return null;

  // Pattern 1: [Location tokens...] [Date/Time tokens...] (e.g. "Togliatti 7 november 11:00", "San Francisco 9:00 am")
  for (let i = 1; i < tokens.length; i++) {
    const locCandidate = tokens.slice(0, i).join(" ");
    const timeCandidate = tokens.slice(i).join(" ");
    const parsedTime = parseTimeToken(timeCandidate, refDate);
    if (parsedTime) {
      const loc = resolveBestLocation(locCandidate);
      if (loc) {
        return { location: loc, time: parsedTime };
      }
    }
  }

  // Pattern 2: [Date/Time tokens...] [Location tokens...] (e.g. "7 november 11:00 Togliatti", "9am UTC")
  for (let i = tokens.length - 1; i >= 1; i--) {
    const timeCandidate = tokens.slice(0, i).join(" ");
    const locCandidate = tokens.slice(i).join(" ");
    const parsedTime = parseTimeToken(timeCandidate, refDate);
    if (parsedTime) {
      const loc = resolveBestLocation(locCandidate);
      if (loc) {
        return { location: loc, time: parsedTime };
      }
    }
  }

  return null;
}

/**
 * Extracts a potential city/location query string from user input so that if offline lookup finds nothing,
 * the UI can trigger an online GeoNames lookup for that city name (even in queries like "<City> 7 november 11:00").
 */
export function extractCityCandidateForGeocoding(rawQuery: string, refDate: Date = new Date()): string | null {
  const trimmed = rawQuery.trim();
  if (!trimmed || trimmed.length < 2) return null;

  const tokens = trimmed.split(/\s+/);
  if (tokens.length >= 2) {
    for (let i = 1; i < tokens.length; i++) {
      const locCandidate = tokens.slice(0, i).join(" ");
      const timeCandidate = tokens.slice(i).join(" ");
      if (parseTimeToken(timeCandidate, refDate)) {
        return cleanLocationQuery(locCandidate);
      }
    }
    for (let i = tokens.length - 1; i >= 1; i--) {
      const timeCandidate = tokens.slice(0, i).join(" ");
      const locCandidate = tokens.slice(i).join(" ");
      if (parseTimeToken(timeCandidate, refDate)) {
        return cleanLocationQuery(locCandidate);
      }
    }
  }

  const cleaned = cleanLocationQuery(trimmed);
  if (cleaned && !/^\d+$/.test(cleaned)) {
    return cleaned;
  }
  return null;
}

/**
 * Parses "until <target>" countdown queries:
 * - "until 18:00", "until 9am"
 * - "until UTC 9am", "until Togliatti 7 november 11:00"
 * - "until 7 november 11:00"
 * - "until 2026-12-31"
 */
export function parseUntilQuery(
  rawQuery: string,
  now: Date,
  localLocation: ResolvedLocation
): SmartResultItem[] {
  const match = /^(?:until|till|time\s+until|countdown\s+to|до)\s+(.+)$/i.exec(rawQuery.trim());
  if (!match) return [];

  const targetExpr = match[1].trim();
  let targetDate: Date | null = null;
  let targetLoc: ResolvedLocation = localLocation;
  let targetTitle = targetExpr;

  const simpleTime = parseTimeToken(targetExpr, now);
  if (simpleTime) {
    let d = createDateInLocation(
      now,
      localLocation,
      simpleTime.hour,
      simpleTime.minute,
      simpleTime.second,
      simpleTime.dayDelta,
      simpleTime.explicitDate
    );
    if (!simpleTime.explicitDate && simpleTime.dayDelta === 0 && d.getTime() <= now.getTime()) {
      d = createDateInLocation(now, localLocation, simpleTime.hour, simpleTime.minute, simpleTime.second, 1);
    }
    targetDate = d;
    const fmt = formatDateTimeInLocation(d, localLocation);
    targetTitle = `${fmt.time24} (${fmt.dateShort}, ${localLocation.shortLabel})`;
  }

  if (!targetDate) {
    const split = splitLocationAndTime(targetExpr, now);
    if (split) {
      targetLoc = split.location;
      let d = createDateInLocation(
        now,
        targetLoc,
        split.time.hour,
        split.time.minute,
        split.time.second,
        split.time.dayDelta,
        split.time.explicitDate
      );
      if (!split.time.explicitDate && split.time.dayDelta === 0 && d.getTime() <= now.getTime()) {
        d = createDateInLocation(now, targetLoc, split.time.hour, split.time.minute, split.time.second, 1);
      }
      targetDate = d;
      const srcFmt = formatDateTimeInLocation(d, targetLoc);
      targetTitle = `${targetLoc.shortLabel} ${srcFmt.time24} (${srcFmt.dateShort})`;
    }
  }

  if (!targetDate) {
    const parsedMs = Date.parse(targetExpr);
    if (!Number.isNaN(parsedMs)) {
      targetDate = new Date(parsedMs);
      targetTitle = targetExpr;
    }
  }

  if (!targetDate) return [];

  const countdown = formatExactCountdown(targetDate, now);
  const localFmt = formatDateTimeInLocation(targetDate, localLocation);
  const dayLabel = getDayLabel(targetDate, localLocation, now);

  return [
    {
      id: `until:${targetDate.getTime()}`,
      section: "Countdown",
      title: `${countdown}  →  Until ${targetTitle}`,
      subtitle: `Target in your time: ${localFmt.time24} (${dayLabel}, ${localFmt.dateFull})`,
      accessories: [
        {
          tag: {
            value: countdown,
            color: targetDate.getTime() >= now.getTime() ? "green" : "orange",
          },
        },
        {
          text: localFmt.isoString,
        },
      ],
      copyValue: countdown,
      secondaryCopyValue: localFmt.isoString,
      secondaryCopyLabel: "Copy Target ISO 8601",
      targetDate,
      location: targetLoc,
      markdownDetail: buildMarkdownDetail({
        heading: `Countdown: ${countdown} (Until ${targetTitle})`,
        targetDate,
        now,
        localLocation,
        primaryLocation: targetLoc,
      }),
      icon: "hourglass",
    },
  ];
}

/**
 * Parses Unix epoch timestamps (seconds, milliseconds, microseconds) or ISO-8601 strings.
 */
export function parseDeveloperTimestampQuery(
  rawQuery: string,
  now: Date,
  localLocation: ResolvedLocation
): SmartResultItem[] {
  const trimmed = rawQuery.trim();

  const unixMatch = /^(?:@|unix\s+|epoch\s+|ts\s+)?(-?\d{9,16})(?:\.(\d+))?$/i.exec(trimmed);
  if (unixMatch) {
    const digits = unixMatch[1];
    const len = digits.replace(/^-/, "").length;
    const rawNum = Number(digits);
    let ms: number;
    let unitLabel: string;

    if (len <= 10) {
      ms = rawNum * 1000;
      unitLabel = "seconds";
    } else if (len <= 13) {
      ms = rawNum;
      unitLabel = "milliseconds";
    } else {
      ms = Math.round(rawNum / 1000);
      unitLabel = "microseconds";
    }

    const date = new Date(ms);
    if (!Number.isNaN(date.getTime())) {
      return buildTimestampItems(date, `Unix Timestamp (${unitLabel}: ${digits})`, now, localLocation);
    }
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}.*$/.test(trimmed)) {
    const parsedMs = Date.parse(trimmed);
    if (!Number.isNaN(parsedMs)) {
      const date = new Date(parsedMs);
      return buildTimestampItems(date, `Parsed Date (${trimmed})`, now, localLocation);
    }
  }

  return [];
}

function buildTimestampItems(
  date: Date,
  sectionTitle: string,
  now: Date,
  localLocation: ResolvedLocation
): SmartResultItem[] {
  const utcLoc = resolveBestLocation("UTC")!;
  const localFmt = formatDateTimeInLocation(date, localLocation);
  const utcFmt = formatDateTimeInLocation(date, utcLoc);
  const rel = formatRelativeFromNow(date, now);
  const localOffset = getOffsetMinutes(date, localLocation);
  const unixSec = Math.floor(date.getTime() / 1000);

  const md = buildMarkdownDetail({
    heading: sectionTitle,
    targetDate: date,
    now,
    localLocation,
    primaryLocation: localLocation,
    secondaryLocation: utcLoc,
  });

  return [
    {
      id: `ts-local:${date.getTime()}`,
      section: sectionTitle,
      title: `${localFmt.time24}  —  ${localFmt.dateFull} (Your Time)`,
      subtitle: `${localLocation.ianaName} (${formatUtcOffset(localOffset, true)})`,
      accessories: [
        { tag: { value: rel, color: date.getTime() >= now.getTime() ? "green" : "blue" } },
        { text: localFmt.isoString },
      ],
      copyValue: localFmt.isoString,
      secondaryCopyValue: String(unixSec),
      secondaryCopyLabel: "Copy Unix Seconds",
      targetDate: date,
      location: localLocation,
      markdownDetail: md,
      icon: "calendar",
    },
    {
      id: `ts-utc:${date.getTime()}`,
      section: sectionTitle,
      title: `${utcFmt.time24}  —  ${utcFmt.dateFull} (UTC)`,
      subtitle: `UTC+00:00`,
      accessories: [{ tag: { value: "UTC", color: "purple" } }, { text: utcFmt.isoString }],
      copyValue: utcFmt.isoString,
      secondaryCopyValue: String(date.getTime()),
      secondaryCopyLabel: "Copy Unix Milliseconds",
      targetDate: date,
      location: utcLoc,
      markdownDetail: md,
      icon: "globe",
    },
  ];
}

/**
 * Builds developer format items (Unix epoch, ISO-8601, Discord timestamp) for a given Date.
 */
export function buildDeveloperFormatItems(
  date: Date,
  now: Date,
  localLocation: ResolvedLocation,
  section = "Developer Formats & Timestamps"
): SmartResultItem[] {
  const utcLoc = resolveBestLocation("UTC")!;
  const localFmt = formatDateTimeInLocation(date, localLocation);
  const utcFmt = formatDateTimeInLocation(date, utcLoc);
  const unixSec = Math.floor(date.getTime() / 1000);
  const unixMs = date.getTime();
  const discordFull = `<t:${unixSec}:F>`;
  const discordRel = `<t:${unixSec}:R>`;

  const md = buildMarkdownDetail({
    heading: "Developer Formats",
    targetDate: date,
    now,
    localLocation,
    primaryLocation: localLocation,
  });

  return [
    {
      id: `dev-unix-sec:${unixSec}`,
      section,
      title: `${unixSec}`,
      subtitle: "Unix Timestamp (seconds)",
      accessories: [{ text: `${unixMs} ms` }, { tag: { value: "Epoch", color: "purple" } }],
      copyValue: String(unixSec),
      secondaryCopyValue: String(unixMs),
      secondaryCopyLabel: "Copy Unix Milliseconds",
      targetDate: date,
      markdownDetail: md,
      icon: "code",
    },
    {
      id: `dev-iso-local:${unixSec}`,
      section,
      title: localFmt.isoString,
      subtitle: `ISO 8601 (Local · ${localLocation.ianaName})`,
      accessories: [{ text: utcFmt.isoString }, { tag: { value: "ISO 8601", color: "blue" } }],
      copyValue: localFmt.isoString,
      secondaryCopyValue: utcFmt.isoString,
      secondaryCopyLabel: "Copy UTC ISO 8601",
      targetDate: date,
      markdownDetail: md,
      icon: "code",
    },
    {
      id: `dev-discord:${unixSec}`,
      section,
      title: `${discordFull}  /  ${discordRel}`,
      subtitle: "Discord Dynamic Timestamp (adapts to every reader's timezone)",
      accessories: [{ tag: { value: "Discord", color: "magenta" } }],
      copyValue: discordFull,
      secondaryCopyValue: discordRel,
      secondaryCopyLabel: "Copy Discord Relative Tag (<t:...:R>)",
      targetDate: date,
      markdownDetail: md,
      icon: "speech-bubble",
    },
  ];
}

/**
 * Main smart query entry point.
 * Takes any user input and returns prioritized `SmartResultItem[]`.
 */
export function evaluateSmartQuery(options: {
  query: string;
  now?: Date;
  localTimeZone?: string;
  pinnedQueries?: string[];
}): SmartResultItem[] {
  const {
    query,
    now = new Date(),
    localTimeZone,
    pinnedQueries = ["UTC", "Togliatti", "Moscow", "London", "New York"],
  } = options;

  const localLocation = getLocalLocation(localTimeZone);
  const trimmed = query.trim();

  // 1. Empty query or "now" -> Dashboard with Local, Pinned Locations, and Developer Formats
  if (!trimmed || /^(?:now|current|today|сейчас)$/i.test(trimmed)) {
    const items: SmartResultItem[] = [];

    items.push(buildLocationCurrentTimeItem(localLocation, now, localLocation, "Current Time"));

    const seenIds = new Set<string>([localLocation.id]);
    for (const pinnedRaw of pinnedQueries) {
      const loc = resolveBestLocation(pinnedRaw);
      if (loc && !seenIds.has(loc.id)) {
        seenIds.add(loc.id);
        items.push(buildLocationCurrentTimeItem(loc, now, localLocation, "Pinned Locations & Timezones"));
      }
    }

    items.push(...buildDeveloperFormatItems(now, now, localLocation));
    return items;
  }

  const results: SmartResultItem[] = [];

  // 2. Check Developer Timestamp / ISO-8601 (e.g. "1761901075", "2026-10-31T09:00:00Z")
  const tsItems = parseDeveloperTimestampQuery(trimmed, now, localLocation);
  if (tsItems.length > 0) {
    results.push(...tsItems);
    results.push(...buildDeveloperFormatItems(tsItems[0].targetDate, now, localLocation));
    return results;
  }

  // 3. Check "until ..." countdown queries (e.g. "until 18:00", "until UTC 9am", "until Togliatti 7 november 11:00")
  const untilItems = parseUntilQuery(trimmed, now, localLocation);
  if (untilItems.length > 0) {
    return untilItems;
  }

  // 4. Check Relative Time Math (e.g. "in 45m", "+3h 20m", "2 days ago", "tomorrow 15:00", "next friday 15:00")
  const relMath = parseRelativeMathQuery(trimmed, now, localLocation);
  if (relMath) {
    const relItems = buildTimestampItems(relMath.date, `Relative Time (${relMath.label})`, now, localLocation);
    results.push(...relItems);
    results.push(...buildDeveloperFormatItems(relMath.date, now, localLocation));
    return results;
  }

  // 5. Check Time Conversion (e.g. "Togliatti 7 november 11:00", "UTC 9am", "UTC 9:00", "9am PST in CET")
  const convItems = parseTimeConversionQuery(trimmed, now, localLocation);
  if (convItems.length > 0) {
    results.push(...convItems);
    results.push(...buildDeveloperFormatItems(convItems[0].targetDate, now, localLocation));
    return results;
  }

  // 6. Check standalone local time/date token (e.g. "7 november 11:00", "9am", "18:00")
  const standaloneTime = parseTimeToken(trimmed, now);
  if (standaloneTime) {
    const utcLoc = resolveBestLocation("UTC")!;
    const localTargetDate = createDateInLocation(
      now,
      localLocation,
      standaloneTime.hour,
      standaloneTime.minute,
      standaloneTime.second,
      standaloneTime.dayDelta,
      standaloneTime.explicitDate
    );
    const utcTargetDate = createDateInLocation(
      now,
      utcLoc,
      standaloneTime.hour,
      standaloneTime.minute,
      standaloneTime.second,
      standaloneTime.dayDelta,
      standaloneTime.explicitDate
    );

    results.push(
      buildConversionItem({
        sourceLocation: localLocation,
        targetLocation: utcLoc,
        localLocation,
        targetDate: localTargetDate,
        now,
        section: "Your Time → UTC",
      }),
      buildConversionItem({
        sourceLocation: utcLoc,
        targetLocation: localLocation,
        localLocation,
        targetDate: utcTargetDate,
        now,
        section: "UTC → Your Time",
      })
    );
    results.push(...buildDeveloperFormatItems(localTargetDate, now, localLocation));
    return results;
  }

  // 7. Location / City / Timezone Lookup (e.g. "UTC", "Анапа", "Tver", "Time in Togliatti", "GMT+4")
  const matchedLocations = resolveLocations(trimmed, 8);
  if (matchedLocations.length > 0) {
    for (let i = 0; i < matchedLocations.length; i++) {
      const loc = matchedLocations[i];
      results.push(
        buildLocationCurrentTimeItem(
          loc,
          now,
          localLocation,
          i === 0 ? "Best Match" : "Other Matching Locations"
        )
      );
    }

    const primaryLoc = matchedLocations[0];
    if (primaryLoc.id !== localLocation.id) {
      const nineAmDate = createDateInLocation(now, primaryLoc, 9, 0, 0, 0);
      const sixPmDate = createDateInLocation(now, primaryLoc, 18, 0, 0, 0);
      results.push(
        buildConversionItem({
          sourceLocation: primaryLoc,
          targetLocation: localLocation,
          localLocation,
          targetDate: nineAmDate,
          now,
          section: `Quick Reference: ${primaryLoc.shortLabel} Working Hours in Your Time`,
          idSuffix: ":ref-9am",
        }),
        buildConversionItem({
          sourceLocation: primaryLoc,
          targetLocation: localLocation,
          localLocation,
          targetDate: sixPmDate,
          now,
          section: `Quick Reference: ${primaryLoc.shortLabel} Working Hours in Your Time`,
          idSuffix: ":ref-6pm",
        })
      );
    }
    return results;
  }

  const cleaned = cleanLocationQuery(trimmed);
  if (cleaned && cleaned !== trimmed) {
    const retry = resolveLocations(cleaned, 5);
    for (const loc of retry) {
      results.push(buildLocationCurrentTimeItem(loc, now, localLocation, "Matching Locations"));
    }
  }

  return results;
}
