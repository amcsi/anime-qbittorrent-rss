import { type ReactNode, useEffect, useState } from "react";
import { toast } from "sonner";
import "./App.css";

type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

const STORAGE_KEY = "anime-qbittorrent-rss:form:v1";

function seasonFromMonth(month1to12: number): { month: 1 | 4 | 7 | 10; name: SeasonName } {
  if (month1to12 >= 10) return { month: 10, name: "Fall" };
  if (month1to12 >= 7) return { month: 7, name: "Summer" };
  if (month1to12 >= 4) return { month: 4, name: "Spring" };
  return { month: 1, name: "Winter" };
}

function defaultSeasonForNow(now = new Date()): {
  year: number;
  month: 1 | 4 | 7 | 10;
  name: SeasonName;
} {
  const year = now.getFullYear();
  const month1to12 = now.getMonth() + 1;
  const { month, name } = seasonFromMonth(month1to12);
  return { year, month, name };
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function seasonKey(season: { year: number; month: 1 | 4 | 7 | 10; name: SeasonName }): string {
  return `${season.year}-${pad2(season.month)}-${season.name}`;
}

function seasonsEqual(
  a: { year: number; month: 1 | 4 | 7 | 10; name: SeasonName },
  b: { year: number; month: 1 | 4 | 7 | 10; name: SeasonName },
): boolean {
  return a.year === b.year && a.month === b.month && a.name === b.name;
}

function stepSeason(
  season: { year: number; month: 1 | 4 | 7 | 10; name: SeasonName },
  delta: -1 | 1,
): { year: number; month: 1 | 4 | 7 | 10; name: SeasonName } {
  const months: Array<{ month: 1 | 4 | 7 | 10; name: SeasonName }> = [
    { month: 1, name: "Winter" },
    { month: 4, name: "Spring" },
    { month: 7, name: "Summer" },
    { month: 10, name: "Fall" },
  ];
  const idx = months.findIndex((m) => m.month === season.month);
  const nextIdx = idx + delta;
  if (nextIdx < 0) {
    const m = months[months.length - 1]!;
    return { year: season.year - 1, month: m.month, name: m.name };
  }
  if (nextIdx >= months.length) {
    const m = months[0]!;
    return { year: season.year + 1, month: m.month, name: m.name };
  }
  const m = months[nextIdx]!;
  return { year: season.year, month: m.month, name: m.name };
}

function sanitizeWindowsName(input: string): string {
  // Strip Windows-forbidden filename characters and control chars.
  // Also trim spaces/dots that Windows disallows at the end.
  const withoutForbidden = input.replace(/[<>:"/\\|?*]/g, "");
  const withoutControl = Array.from(withoutForbidden)
    .filter((ch) => {
      const cp = ch.codePointAt(0) ?? 0;
      return cp >= 0x20;
    })
    .join("");
  const stripped = withoutControl
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[ .]+$/g, "");
  return stripped;
}

function joinPath(...parts: Array<string | undefined>): string {
  const first = parts.find((p) => Boolean(p && p.trim().length > 0)) ?? "";
  const keepLeadingSlash = typeof first === "string" && first.trim().startsWith("/");

  const cleaned = parts
    .filter((p): p is string => Boolean(p && p.trim().length > 0))
    .map((p, idx) => {
      const trimmed = p.trim();
      const noTrailing = trimmed.replace(/\/+$/g, "");
      if (idx === 0) return noTrailing.replace(/\/+$/g, "");
      return noTrailing.replace(/^\/+/g, "");
    })
    .filter((p) => p.length > 0);

  const joined = cleaned.join("/");
  if (!joined) return keepLeadingSlash ? "/" : "";
  return keepLeadingSlash && !joined.startsWith("/") ? `/${joined}` : joined;
}

/** Regex (as a string) matching an episode number token >= min, with 01–09 style padding for episodes < 10. */
function buildMinEpisodeNumberRegex(minRaw: number): string {
  const min = Math.max(1, Math.min(999, Math.floor(Number(minRaw)) || 1));
  const parts: string[] = [];

  if (min <= 99) {
    if (min <= 9) {
      parts.push(`0[${min}-9]`);
      parts.push(`[1-9]\\d`);
    } else {
      const tens = Math.floor(min / 10);
      const ones = min % 10;
      if (ones === 0) {
        parts.push(`${tens}[0-9]`);
        if (tens < 9) parts.push(`[${tens + 1}-9]\\d`);
      } else {
        parts.push(`${tens}[${ones}-9]`);
        if (tens < 9) parts.push(`[${tens + 1}-9]\\d`);
      }
    }
    parts.push(`[1-9]\\d{2,}`);
    return `((?:${parts.join("|")}))`;
  }

  const h = Math.floor(min / 100);
  const rest = min % 100;
  const t = Math.floor(rest / 10);
  const o = rest % 10;

  if (t === 0 && o === 0) {
    parts.push(`${h}00`);
    parts.push(`${h}0[1-9]`);
    parts.push(`${h}[1-9]\\d`);
  } else if (t === 0 && o !== 0) {
    parts.push(`${h}0[${o}-9]`);
    parts.push(`${h}[1-9]\\d`);
  } else if (t !== 0 && o === 0) {
    parts.push(`${h}${t}0`);
    parts.push(`${h}${t}[1-9]`);
    if (t < 9) parts.push(`${h}[${t + 1}-9]\\d`);
  } else {
    parts.push(`${h}${t}[${o}-9]`);
    if (t < 9) parts.push(`${h}[${t + 1}-9]\\d`);
  }

  if (h < 9) parts.push(`[${h + 1}-9]\\d{2}`);
  parts.push(`[1-9]\\d{3,}`);

  return `((?:${parts.join("|")}))`;
}

function clampMinEpisode(n: number): number {
  return Math.max(1, Math.min(999, Math.floor(Number(n)) || 1));
}

async function copyToClipboard(text: string): Promise<void> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      toast.success("Copied to clipboard");
      return;
    }
  } catch {
    // fall through to legacy copy
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) {
      toast.success("Copied to clipboard");
    } else {
      toast.error("Could not copy");
    }
  } catch {
    toast.error("Could not copy");
  }
}

function CopyIcon() {
  return (
    <svg
      className="copy-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="8.25" y="8.25" width="12.5" height="12.5" rx="2" />
      <path d="M6.5 15.75H5.75A2 2 0 0 1 3.75 13.75V5.75A2 2 0 0 1 5.75 3.75H13.75A2 2 0 0 1 15.75 5.75V6.5" />
    </svg>
  );
}

function ReadonlyCopyRow(props: {
  label: string;
  value: string;
  placeholder?: string;
  copyValue: string;
  mono?: boolean;
  copyAriaLabel: string;
  after?: ReactNode;
}) {
  const { label, value, placeholder, copyValue, mono, copyAriaLabel, after } = props;
  return (
    <div className="field field-span2">
      <span className="field-label">{label}</span>
      <div className="readonly-row">
        <input
          className={`readonly-row-input${mono ? " input-mono" : ""}`}
          value={value}
          readOnly
          placeholder={placeholder}
          spellCheck={false}
        />
        <button
          type="button"
          className="copy-btn"
          onClick={() => void copyToClipboard(copyValue)}
          aria-label={copyAriaLabel}
        >
          <CopyIcon />
        </button>
      </div>
      {after}
    </div>
  );
}

function App() {
  const basePath = (import.meta.env.VITE_BASE_PATH as string | undefined) ?? "";

  const [animeDisplayTitle, setAnimeDisplayTitle] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as Partial<{ animeDisplayTitle: string }>;
      return parsed.animeDisplayTitle ?? "";
    } catch {
      return "";
    }
  });
  const [animeSearchTitle, setAnimeSearchTitle] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as Partial<{ animeSearchTitle: string }>;
      return parsed.animeSearchTitle ?? "";
    } catch {
      return "";
    }
  });

  const [minEpisodeText, setMinEpisodeText] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return "";
      const parsed = JSON.parse(raw) as Partial<{ minEpisodeText: string; minEpisode: number }>;
      if (typeof parsed.minEpisodeText === "string") {
        return parsed.minEpisodeText;
      }
      // Back-compat if an older numeric value exists
      if (typeof parsed.minEpisode === "number" && Number.isFinite(parsed.minEpisode)) {
        return String(clampMinEpisode(parsed.minEpisode));
      }
      return "";
    } catch {
      return "";
    }
  });

  const [season, setSeason] = useState(() => {
    const fallback = defaultSeasonForNow();
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return fallback;
      const parsed = JSON.parse(raw) as Partial<{
        seasonYear: number;
        seasonMonth: 1 | 4 | 7 | 10;
        seasonName: SeasonName;
      }>;
      if (
        typeof parsed.seasonYear === "number" &&
        (parsed.seasonMonth === 1 ||
          parsed.seasonMonth === 4 ||
          parsed.seasonMonth === 7 ||
          parsed.seasonMonth === 10) &&
        (parsed.seasonName === "Winter" ||
          parsed.seasonName === "Spring" ||
          parsed.seasonName === "Summer" ||
          parsed.seasonName === "Fall")
      ) {
        return { year: parsed.seasonYear, month: parsed.seasonMonth, name: parsed.seasonName };
      }
      return fallback;
    } catch {
      return fallback;
    }
  });

  useEffect(() => {
    const defaultSeason = defaultSeasonForNow();
    const payload: Record<string, string | number> = {
      animeDisplayTitle,
      animeSearchTitle,
      minEpisodeText,
    };
    if (!seasonsEqual(season, defaultSeason)) {
      payload.seasonYear = season.year;
      payload.seasonMonth = season.month;
      payload.seasonName = season.name;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [animeDisplayTitle, animeSearchTitle, minEpisodeText, season.year, season.month, season.name]);

  const defaultSeason = defaultSeasonForNow();
  const seasonIsNonDefault = !seasonsEqual(season, defaultSeason);

  const safeAnimeDisplayTitle = sanitizeWindowsName(animeDisplayTitle);
  const seasonPath = seasonKey(season);
  const fullDirectory = joinPath(basePath, seasonPath, safeAnimeDisplayTitle);
  const seasonDisplay = `${seasonPath} - ${animeDisplayTitle}`.trim();

  const trimmedMinEpisodeText = minEpisodeText.trim();
  const isMinEpisodeEmpty = trimmedMinEpisodeText.length === 0;
  const isMinEpisodeNumeric = /^\d+$/.test(trimmedMinEpisodeText);
  const minEpisodeRegex =
    isMinEpisodeEmpty || !isMinEpisodeNumeric
      ? ""
      : buildMinEpisodeNumberRegex(clampMinEpisode(Number(trimmedMinEpisodeText)));
  const minEpisodeRegexSpaced =
    isMinEpisodeNumeric && minEpisodeRegex.length > 0 ? `( ${minEpisodeRegex.slice(1, -1)} )` : "";
  const minEpisodeRegexDisplay = isMinEpisodeNumeric
    ? minEpisodeRegexSpaced
    : isMinEpisodeEmpty
      ? ""
      : `Invalid minimum episode number: "${minEpisodeText}"`;

  const nyaaQueryWithSubsPlease = `${animeSearchTitle} (720p|1080p) -batch subsplease`.trim();
  const nyaaQueryNoSubsPlease = `${animeSearchTitle} (720p|1080p) -batch`.trim();

  const nyaaSearchUrl = (query: string) =>
    `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(query)}`;
  const nyaaRssUrl = (query: string) =>
    `https://nyaa.si/?page=rss&f=0&c=0_0&q=${encodeURIComponent(query)}`;

  const nyaaRssWithSubsUrl = nyaaRssUrl(nyaaQueryWithSubsPlease);
  const nyaaRssNoSubsUrl = nyaaRssUrl(nyaaQueryNoSubsPlease);

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${animeDisplayTitle} myanimelist`)}`;
  const googleSearchTitleUrl = `https://www.google.com/search?q=${encodeURIComponent(`${animeSearchTitle} myanimelist`)}`;

  return (
    <>
      <section id="center">
        <div style={{ width: "min(900px, 100%)" }}>
          <h1>Anime RSS helper</h1>
          <p style={{ marginBottom: 18 }}>
            Base path from <code>VITE_BASE_PATH</code>.
          </p>

          <div className="form-grid">
            <label className="field">
              <span className="field-label">Anime display title</span>
              <input
                value={animeDisplayTitle}
                onChange={(e) => setAnimeDisplayTitle(e.target.value)}
                placeholder="e.g. My Anime Title"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">Anime search title</span>
              <input
                value={animeSearchTitle}
                onChange={(e) => setAnimeSearchTitle(e.target.value)}
                placeholder="e.g. My Anime Title"
                autoComplete="off"
              />
            </label>

            <label className="field">
              <span className="field-label">Minimum episode number</span>
              <input
                value={minEpisodeText}
                onChange={(e) => setMinEpisodeText(e.target.value)}
                placeholder="e.g. 05"
                inputMode="numeric"
                autoComplete="off"
              />
              <div className="field-hint">Episodes 1–9 are treated as 01–09 in the regex.</div>
            </label>

            <div className="field">
              <span className="field-label">Episode number regex (readonly)</span>
              <div className="readonly-row">
                <input
                  className="readonly-row-input input-mono"
                  value={minEpisodeRegexDisplay}
                  readOnly
                  placeholder="Set the minimum episode number"
                  spellCheck={false}
                />
                <button
                  type="button"
                  className="copy-btn"
                  onClick={() => void copyToClipboard(minEpisodeRegexDisplay)}
                  aria-label="Copy episode number regex"
                >
                  <CopyIcon />
                </button>
              </div>
            </div>

            <div className={`field${seasonIsNonDefault ? " season-non-default" : ""}`}>
              <span className="field-label">Season</span>
              <div className="season-row">
                <button
                  type="button"
                  onClick={() => setSeason((s) => stepSeason(s, -1))}
                  aria-label="Previous season"
                >
                  −
                </button>
                <div className="season-pill" aria-label="Selected season">
                  {season.year} {season.name}
                </div>
                <button
                  type="button"
                  onClick={() => setSeason((s) => stepSeason(s, 1))}
                  aria-label="Next season"
                >
                  +
                </button>
              </div>
              <div className="season-sub">{seasonPath}</div>
            </div>

            <ReadonlyCopyRow
              label="Full directory (readonly)"
              value={fullDirectory}
              copyValue={fullDirectory}
              copyAriaLabel="Copy full directory"
              after={
                <div className="field-hint">
                  Display title sanitized for Windows:{" "}
                  <code>{safeAnimeDisplayTitle || "(empty)"}</code>
                </div>
              }
            />

            <ReadonlyCopyRow
              label="Season label (readonly)"
              value={seasonDisplay}
              copyValue={seasonDisplay}
              copyAriaLabel="Copy season label"
            />

            <div className="field field-span2">
              <span className="field-label">Links</span>
              <ul className="link-list">
                <li>
                  <a href={nyaaSearchUrl(nyaaQueryWithSubsPlease)} target="_blank" rel="noreferrer">
                    Nyaa search (with subsplease)
                  </a>
                  {" · "}
                  <span className="link-rss-group">
                    <a href={nyaaRssWithSubsUrl} target="_blank" rel="noreferrer">
                      RSS
                    </a>
                    <button
                      type="button"
                      className="copy-btn copy-btn--inline"
                      onClick={() => void copyToClipboard(nyaaRssWithSubsUrl)}
                      aria-label="Copy Nyaa RSS URL (with subsplease)"
                    >
                      <CopyIcon />
                    </button>
                  </span>
                </li>
                <li>
                  <a href={nyaaSearchUrl(nyaaQueryNoSubsPlease)} target="_blank" rel="noreferrer">
                    Nyaa search (no subsplease)
                  </a>
                  {" · "}
                  <span className="link-rss-group">
                    <a href={nyaaRssNoSubsUrl} target="_blank" rel="noreferrer">
                      RSS
                    </a>
                    <button
                      type="button"
                      className="copy-btn copy-btn--inline"
                      onClick={() => void copyToClipboard(nyaaRssNoSubsUrl)}
                      aria-label="Copy Nyaa RSS URL (no subsplease)"
                    >
                      <CopyIcon />
                    </button>
                  </span>
                </li>
                <li>
                  <a href={googleUrl} target="_blank" rel="noreferrer">
                    Google search (display title)
                  </a>
                </li>
                <li>
                  <a href={googleSearchTitleUrl} target="_blank" rel="noreferrer">
                    Google search (search title)
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

export default App;
