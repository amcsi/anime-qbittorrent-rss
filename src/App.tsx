import { useEffect, useState } from "react";
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
    const payload = {
      animeDisplayTitle,
      animeSearchTitle,
      seasonYear: season.year,
      seasonMonth: season.month,
      seasonName: season.name,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [animeDisplayTitle, animeSearchTitle, season.year, season.month, season.name]);

  const safeAnimeDisplayTitle = sanitizeWindowsName(animeDisplayTitle);
  const seasonPath = seasonKey(season);
  const fullDirectory = joinPath(basePath, seasonPath, safeAnimeDisplayTitle);
  const seasonDisplay = `${seasonPath} - ${animeDisplayTitle}`.trim();

  const nyaaQueryWithSubsPlease = `${animeSearchTitle} -480 -batch subsplease`.trim();
  const nyaaQueryNoSubsPlease = `${animeSearchTitle} -480 -batch`.trim();

  const nyaaSearchUrl = (query: string) =>
    `https://nyaa.si/?f=0&c=0_0&q=${encodeURIComponent(query)}`;
  const nyaaRssUrl = (query: string) =>
    `https://nyaa.si/?page=rss&f=0&c=0_0&q=${encodeURIComponent(query)}`;

  const googleUrl = `https://www.google.com/search?q=${encodeURIComponent(animeDisplayTitle)}`;

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

            <div className="field">
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

            <label className="field field-span2">
              <span className="field-label">Full directory (readonly)</span>
              <input value={fullDirectory} readOnly />
              <div className="field-hint">
                Display title sanitized for Windows:{" "}
                <code>{safeAnimeDisplayTitle || "(empty)"}</code>
              </div>
            </label>

            <label className="field field-span2">
              <span className="field-label">Season label (readonly)</span>
              <input value={seasonDisplay} readOnly />
            </label>

            <div className="field field-span2">
              <span className="field-label">Links</span>
              <ul className="link-list">
                <li>
                  <a href={nyaaSearchUrl(nyaaQueryWithSubsPlease)} target="_blank" rel="noreferrer">
                    Nyaa search (with subsplease)
                  </a>
                  {" · "}
                  <a href={nyaaRssUrl(nyaaQueryWithSubsPlease)} target="_blank" rel="noreferrer">
                    RSS
                  </a>
                </li>
                <li>
                  <a href={nyaaSearchUrl(nyaaQueryNoSubsPlease)} target="_blank" rel="noreferrer">
                    Nyaa search (no subsplease)
                  </a>
                  {" · "}
                  <a href={nyaaRssUrl(nyaaQueryNoSubsPlease)} target="_blank" rel="noreferrer">
                    RSS
                  </a>
                </li>
                <li>
                  <a href={googleUrl} target="_blank" rel="noreferrer">
                    Google search (display title)
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
