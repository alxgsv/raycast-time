import { describe, expect, it } from "vitest";
import { evaluateSmartQuery } from "../time-utils";
import { resolveBestLocation } from "../locations";

// Fixed reference instant: 2026-10-31T09:00:00Z (which is 15:00 in Asia/Omsk UTC+6, and 13:00 in Europe/Samara UTC+4)
const REF_NOW = new Date("2026-10-31T09:00:00.000Z");
const LOCAL_TZ = "Asia/Omsk"; // UTC+6

describe("Smart Time & Timezone Evaluator", () => {
  it("resolves UTC and shows current datetime and relative offset to local timezone", () => {
    const items = evaluateSmartQuery({
      query: "UTC",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });

    expect(items.length).toBeGreaterThan(0);
    const best = items[0];
    expect(best.title).toContain("09:00");
    expect(best.title).toContain("UTC");
    expect(best.accessories[0]?.tag?.value).toBe("-6h");
  });

  it("converts 'UTC 9am' and 'UTC 9:00' to user local timezone and never outputs AM/PM", () => {
    for (const q of ["UTC 9am", "UTC 9:00", "9am UTC", "9:00 UTC"]) {
      const items = evaluateSmartQuery({
        query: q,
        now: REF_NOW,
        localTimeZone: LOCAL_TZ,
      });

      expect(items.length).toBeGreaterThan(0);
      const primary = items[0];
      expect(primary.title).toContain("15:00");
      expect(primary.subtitle).toContain("When UTC is 09:00");
      expect(primary.accessories[1]?.tag?.value).toBe("-6h");

      // Ensure no AM/PM in output
      expect(primary.title).not.toMatch(/\b(AM|PM)\b/i);
      expect(primary.subtitle).not.toMatch(/\b(AM|PM)\b/i);
      expect(primary.markdownDetail).not.toMatch(/\b(AM|PM)\b/i);
    }
  });

  it("converts 'Togliatti 7 november 11:00' (and date+time variants) to user local timezone", () => {
    const queries = [
      "Togliatti 7 november 11:00",
      "7 november 11:00 Togliatti",
      "Togliatti nov 7 11am",
      "Тольятти 7 ноября 11:00",
      "Togliatti 07.11 11:00",
    ];

    for (const q of queries) {
      const items = evaluateSmartQuery({
        query: q,
        now: REF_NOW,
        localTimeZone: LOCAL_TZ,
      });

      expect(items.length).toBeGreaterThan(0);
      const primary = items[0];
      // Togliatti is UTC+4 (11:00 on Nov 7 -> 07:00 UTC), Omsk is UTC+6 (13:00 on Nov 7)
      expect(primary.title).toContain("13:00 (Sat, Nov 7)");
      expect(primary.subtitle).toContain("When Togliatti is 11:00");
      expect(primary.accessories[1]?.tag?.value).toBe("-2h");
    }
  });

  it("resolves 'Анапа', 'Anapa', 'Tver', 'Тверь', and other Russian cities in both Cyrillic and Latin", () => {
    for (const q of ["Анапа", "Anapa", "Tver", "Тверь", "Сызрань", "Геленджик"]) {
      const loc = resolveBestLocation(q);
      expect(loc).not.toBeNull();

      const items = evaluateSmartQuery({
        query: q,
        now: REF_NOW,
        localTimeZone: LOCAL_TZ,
      });
      expect(items.length).toBeGreaterThan(0);
    }

    const anapa = resolveBestLocation("Анапа");
    expect(anapa?.timeZone).toBe("Europe/Moscow");

    const tver = resolveBestLocation("Tver");
    expect(tver?.timeZone).toBe("Europe/Moscow");
    expect(tver?.shortLabel).toBe("Tver");
  });

  it("resolves 'Time in Togliatti' (and variants) to Europe/Samara (UTC+4) and shows -2h difference to UTC+6", () => {
    for (const q of ["Time in Togliatti", "Togliatti", "Tolyatti", "Тольятти"]) {
      const loc = resolveBestLocation(q);
      expect(loc).not.toBeNull();
      expect(loc?.timeZone).toBe("Europe/Samara");

      const items = evaluateSmartQuery({
        query: q,
        now: REF_NOW,
        localTimeZone: LOCAL_TZ,
      });

      expect(items.length).toBeGreaterThan(0);
      const top = items[0];
      expect(top.title).toContain("13:00");
      expect(top.title).toContain("Togliatti");
      expect(top.accessories[0]?.tag?.value).toBe("-2h");
      expect(top.accessories[1]?.tooltip).toContain("Europe/Samara");
    }
  });

  it("converts 'Togliatti 18:30' to local time", () => {
    const items = evaluateSmartQuery({
      query: "Togliatti 18:30",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toContain("20:30");
    expect(items[0].accessories[0]?.tag?.value).toBe("in 5h 30m");
  });

  it("converts third-party zones ('9am PST in CET') and also shows user local time", () => {
    const items = evaluateSmartQuery({
      query: "9am PST in CET",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });

    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].section).toContain("ET");
    expect(items[1].section).toContain("In Your Local Timezone");
  });

  it("evaluates relative time math ('in 2h 30m', '+3h', '2 hours ago')", () => {
    const items = evaluateSmartQuery({
      query: "in 2h 30m",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toContain("17:30");
    expect(items[1].title).toContain("11:30");
  });

  it("evaluates countdown queries ('until 18:00', 'until Togliatti 7 november 11:00')", () => {
    const items = evaluateSmartQuery({
      query: "until 18:00",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });

    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(items[0].title).toContain("in 3h");
    expect(items[0].subtitle).toContain("18:00");

    const dateCountdown = evaluateSmartQuery({
      query: "until Togliatti 7 november 11:00",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });
    expect(dateCountdown.length).toBeGreaterThanOrEqual(2);
    expect(dateCountdown[0].title).toContain("in 6d 22h");
    expect(dateCountdown[0].subtitle).toContain("13:00");
  });

  it("auto-detects Unix timestamps in seconds and milliseconds", () => {
    const secItems = evaluateSmartQuery({
      query: "1761901200",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });
    expect(secItems.length).toBeGreaterThan(0);
    expect(secItems[0].section).toContain("Unix Timestamp (seconds");

    const msItems = evaluateSmartQuery({
      query: "1761901200000",
      now: REF_NOW,
      localTimeZone: LOCAL_TZ,
    });
    expect(msItems.length).toBeGreaterThan(0);
    expect(msItems[0].section).toContain("Unix Timestamp (milliseconds");
  });

  it("treats a bare hour next to a city as HH:00 ('Togliatti 12', '12 Togliatti', 'Тольятти 12')", () => {
    for (const q of ["Togliatti 12", "12 Togliatti", "Тольятти 12"]) {
      const items = evaluateSmartQuery({
        query: q,
        now: REF_NOW,
        localTimeZone: LOCAL_TZ,
      });

      expect(items.length).toBeGreaterThan(0);
      // 12:00 in Togliatti (UTC+4) → 14:00 in Omsk (UTC+6)
      expect(items[0].title).toContain("14:00");
      expect(items[0].subtitle).toContain("When Togliatti is 12:00");
      expect(items[0].accessories[1]?.tag?.value).toBe("-2h");
    }
  });
});
