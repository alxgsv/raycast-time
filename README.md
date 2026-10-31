# Time (Raycast Extension)

A single-input smart time, timezone, city, countdown, and developer timestamp tool for Raycast.

## Supported Queries

### 1. Terse Timezone & City Lookups
* `UTC`, `EST`, `PST`, `CET`, `MSK`, `SAMT`, `IST`, `JST`, `UTC+4`, `GMT-5:30`
  * Shows current datetime in that timezone, its IANA / UTC offset, relative hour difference to your timezone (e.g. `-6h`), and working-hours reference (`09:00` and `18:00` there in your local time).
* `Time in Togliatti`, `Togliatti`, `Tolyatti`, `Тольятти`, `SFO`, `JFK`, `Tokyo`, `Europe/Samara`
  * Resolves 7,300+ global cities, airport codes, and Cyrillic/transliterated aliases.

### 2. Shorthand Time Conversion
* `UTC 9am`, `UTC 9:00`, `9am UTC`, `Togliatti 18:30`, `UTC tomorrow 9am`
  * Shows what datetime it will be in **your local timezone** when the specified timezone/city is at that time, the timezone offset difference, and relative time from now (`in 5h 30m` / `2h ago`).
* `9am in UTC`, `14:00 to Togliatti`
  * Converts your local time into the target timezone/city.
* `9am PST in CET`, `UTC 9:00 in Tokyo`
  * Converts between any two timezones/cities while also displaying the equivalent in your local timezone.

### 3. Relative Time & Countdown Math
* `in 45m`, `in 2h 30m`, `+3h 20m`, `-45m`, `2 days ago`, `tomorrow 15:00`, `next Friday 15:00`
  * Computes the exact local and UTC datetimes, relative offset, and developer formats.
* `until 18:00`, `until UTC 9am`, `until Togliatti 18:00`, `until 2026-12-31`
  * Shows a live countdown (`in 2h 57m`) alongside the target local and UTC datetimes.

### 4. Developer & Format Helpers
* Empty query or `now`:
  * Live dashboard with your local time, pinned cities/timezones (`Cmd+Shift+P` to pin/unpin any location), Unix epoch (seconds & ms), ISO-8601 (local & UTC), and Discord dynamic timestamps (`<t:...:F>` and `<t:...:R>`).
* `1761901075`, `1761901075000`, `2026-10-31T09:00:00Z`
  * Auto-detects Unix timestamps (seconds, milliseconds, microseconds) and ISO-8601 strings.

## Installation into Raycast

```bash
git clone https://github.com/alxgsv/raycast-time.git
cd raycast-time
npm install
npm run dev   # then stop with Ctrl+C — the extension stays installed in Raycast
```

To update later: `git pull && npm install && npm run dev`.

Running `npm run dev` registers and hot-reloads the **Time** command inside your local Raycast app.
