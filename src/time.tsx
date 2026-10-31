import {
  Action,
  ActionPanel,
  Color,
  Icon,
  LaunchProps,
  List,
  LocalStorage,
  Toast,
  getPreferenceValues,
  showToast,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { geocodeCityOnline } from "./locations";
import { SmartResultItem, evaluateSmartQuery, extractCityCandidateForGeocoding } from "./time-utils";

interface Preferences {
  defaultCities?: string;
}

const PINNED_STORAGE_KEY = "smart-time-pinned-locations-v1";

const EXAMPLE_QUERIES = [
  { query: "UTC", description: "Current datetime in UTC and difference to your timezone" },
  { query: "UTC 9am", description: "Your local datetime when UTC is at 09:00 (plus difference)" },
  { query: "Togliatti 7 november 11:00", description: "Your local datetime when Togliatti is 7 Nov at 11:00" },
  { query: "Time in Togliatti", description: "Current time in Togliatti, its timezone (Europe/Samara), and offset" },
  { query: "Анапа", description: "Current time in Anapa (supports 1,134 Russian cities + 11M global GeoNames)" },
  { query: "Tver", description: "Current time in Tver, Russia (Europe/Moscow)" },
  { query: "9am PST in CET", description: "Convert 09:00 Pacific Time to Central European Time (and your time)" },
  { query: "in 2h 30m", description: "Exact local & UTC datetime 2 hours 30 minutes from now" },
  { query: "until 18:00", description: "Live countdown until 18:00 in your timezone" },
  { query: "1761901075", description: "Convert Unix timestamp (sec / ms / µs) to local & UTC datetime" },
];

function mapColor(colorName?: string): Color | undefined {
  switch (colorName) {
    case "green":
      return Color.Green;
    case "blue":
      return Color.Blue;
    case "orange":
      return Color.Orange;
    case "purple":
      return Color.Purple;
    case "magenta":
      return Color.Magenta;
    case "secondary":
      return Color.SecondaryText;
    default:
      return undefined;
  }
}

function mapIcon(iconName: string): Icon {
  switch (iconName) {
    case "globe":
      return Icon.Globe;
    case "clock":
      return Icon.Clock;
    case "switch":
      return Icon.Switch;
    case "hourglass":
      return Icon.Hourglass;
    case "calendar":
      return Icon.Calendar;
    case "code":
      return Icon.Code;
    case "speech-bubble":
      return Icon.SpeechBubble;
    default:
      return Icon.Clock;
  }
}

export default function Command(props: LaunchProps) {
  const preferences = getPreferenceValues<Preferences>();

  const defaultPinnedList = useMemo(() => {
    const raw = preferences.defaultCities || "UTC, Togliatti, Moscow, London, New York";
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }, [preferences.defaultCities]);

  const [searchText, setSearchText] = useState<string>(props.fallbackText ?? "");
  const [showDetail, setShowDetail] = useState<boolean>(false);
  const [now, setNow] = useState<Date>(() => new Date());
  const [pinnedLocations, setPinnedLocations] = useState<string[]>(defaultPinnedList);
  const [isLoadingPins, setIsLoadingPins] = useState<boolean>(true);
  const [isGeocoding, setIsGeocoding] = useState<boolean>(false);
  const [geocodeRevision, setGeocodeRevision] = useState<number>(0);

  useEffect(() => {
    let mounted = true;
    LocalStorage.getItem<string>(PINNED_STORAGE_KEY)
      .then((stored) => {
        if (!mounted) return;
        if (stored) {
          try {
            const parsed = JSON.parse(stored);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setPinnedLocations(parsed);
            }
          } catch {
            // fallback to defaultPinnedList
          }
        }
      })
      .finally(() => {
        if (mounted) setIsLoadingPins(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  // Keep clock and countdowns fresh
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  const items = useMemo(() => {
    return evaluateSmartQuery({
      query: searchText,
      now,
      pinnedQueries: pinnedLocations,
    });
  }, [searchText, now, pinnedLocations, geocodeRevision]);

  // If offline lookup returned 0 results for a query, try live GeoNames lookup via Open-Meteo
  useEffect(() => {
    if (items.length > 0 || !searchText.trim()) {
      setIsGeocoding(false);
      return;
    }

    const candidate = extractCityCandidateForGeocoding(searchText, now);
    if (!candidate || candidate.length < 2) {
      setIsGeocoding(false);
      return;
    }

    let cancelled = false;
    setIsGeocoding(true);
    const timer = setTimeout(() => {
      geocodeCityOnline(candidate)
        .then((found) => {
          if (!cancelled && found.length > 0) {
            setGeocodeRevision((r) => r + 1);
          }
        })
        .finally(() => {
          if (!cancelled) setIsGeocoding(false);
        });
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchText, items.length, now]);

  const togglePinLocation = async (shortLabel: string) => {
    const exists = pinnedLocations.some((p) => p.toLowerCase() === shortLabel.toLowerCase());
    const updated = exists
      ? pinnedLocations.filter((p) => p.toLowerCase() !== shortLabel.toLowerCase())
      : [...pinnedLocations, shortLabel];

    setPinnedLocations(updated);
    await LocalStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(updated));
    await showToast({
      style: Toast.Style.Success,
      title: exists ? `Unpinned ${shortLabel}` : `Pinned ${shortLabel} to Dashboard`,
    });
  };

  // Group items by section while preserving section order
  const sections = useMemo(() => {
    const map = new Map<string, SmartResultItem[]>();
    for (const item of items) {
      const list = map.get(item.section);
      if (list) {
        list.push(item);
      } else {
        map.set(item.section, [item]);
      }
    }
    return Array.from(map.entries());
  }, [items]);

  return (
    <List
      isLoading={isLoadingPins || isGeocoding}
      filtering={false}
      searchText={searchText}
      onSearchTextChange={setSearchText}
      isShowingDetail={showDetail}
      searchBarPlaceholder="UTC 9am, Tokyo 18:00, in 3h, until 18:00…"
      throttle={false}
    >
      {sections.length === 0 ? (
        <List.Section title="Try One of These Queries">
          {EXAMPLE_QUERIES.map((ex) => (
            <List.Item
              key={ex.query}
              icon={Icon.MagnifyingGlass}
              title={ex.query}
              subtitle={ex.description}
              actions={
                <ActionPanel>
                  <Action
                    title={`Try "${ex.query}"`}
                    icon={Icon.ArrowRight}
                    onAction={() => setSearchText(ex.query)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      ) : (
        sections.map(([sectionTitle, sectionItems]) => (
          <List.Section key={sectionTitle} title={sectionTitle}>
            {sectionItems.map((item) => {
              const unixSec = Math.floor(item.targetDate.getTime() / 1000);
              const discordFull = `<t:${unixSec}:F>`;
              const discordRel = `<t:${unixSec}:R>`;
              const isPinned =
                item.location &&
                pinnedLocations.some((p) => p.toLowerCase() === item.location!.shortLabel.toLowerCase());

              return (
                <List.Item
                  key={item.id}
                  icon={
                    item.icon === "code" || item.icon === "speech-bubble"
                      ? { source: mapIcon(item.icon), tintColor: Color.SecondaryText }
                      : mapIcon(item.icon)
                  }
                  title={item.title}
                  subtitle={showDetail ? undefined : item.subtitle}
                  accessories={
                    showDetail
                      ? undefined
                      : item.accessories.map((acc) => ({
                          text: acc.text,
                          tooltip: acc.tooltip,
                          tag: acc.tag
                            ? {
                                value: acc.tag.value,
                                color: mapColor(acc.tag.color),
                              }
                            : undefined,
                        }))
                  }
                  detail={<List.Item.Detail markdown={item.markdownDetail} />}
                  actions={
                    <ActionPanel>
                      <ActionPanel.Section title="Copy">
                        <Action.CopyToClipboard title="Copy Primary Result" content={item.copyValue} />
                        {item.secondaryCopyValue && (
                          <Action.CopyToClipboard
                            title={item.secondaryCopyLabel || "Copy ISO 8601"}
                            content={item.secondaryCopyValue}
                          />
                        )}
                        <Action.CopyToClipboard
                          title="Copy Unix Timestamp (Seconds)"
                          content={String(unixSec)}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "u" }}
                        />
                        <Action.CopyToClipboard
                          title="Copy Discord Timestamp (<t:...:F>)"
                          content={discordFull}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "d" }}
                        />
                        <Action.CopyToClipboard
                          title="Copy Discord Relative (<t:...:R>)"
                          content={discordRel}
                          shortcut={{ modifiers: ["cmd", "opt"], key: "d" }}
                        />
                        <Action.Paste
                          title="Paste Primary Result to Active App"
                          content={item.copyValue}
                          shortcut={{ modifiers: ["cmd", "shift"], key: "enter" }}
                        />
                      </ActionPanel.Section>

                      <ActionPanel.Section title="View & Pin">
                        <Action
                          title={showDetail ? "Hide Detailed Comparison" : "Show Detailed Comparison"}
                          icon={Icon.Sidebar}
                          shortcut={{ modifiers: ["cmd"], key: "i" }}
                          onAction={() => setShowDetail((prev) => !prev)}
                        />
                        {item.location && (
                          <Action
                            title={
                              isPinned
                                ? `Unpin ${item.location.shortLabel} from Dashboard`
                                : `Pin ${item.location.shortLabel} to Dashboard`
                            }
                            icon={isPinned ? Icon.PinDisabled : Icon.Pin}
                            shortcut={{ modifiers: ["cmd", "shift"], key: "p" }}
                            onAction={() => togglePinLocation(item.location!.shortLabel)}
                          />
                        )}
                        <Action
                          title="Refresh Current Time"
                          icon={Icon.RotateClockwise}
                          shortcut={{ modifiers: ["cmd"], key: "r" }}
                          onAction={() => setNow(new Date())}
                        />
                      </ActionPanel.Section>

                      <ActionPanel.Section title="Quick Queries">
                        {EXAMPLE_QUERIES.slice(0, 5).map((ex) => (
                          <Action
                            key={ex.query}
                            title={`Query: ${ex.query}`}
                            icon={Icon.Clock}
                            onAction={() => setSearchText(ex.query)}
                          />
                        ))}
                      </ActionPanel.Section>
                    </ActionPanel>
                  }
                />
              );
            })}
          </List.Section>
        ))
      )}
    </List>
  );
}
