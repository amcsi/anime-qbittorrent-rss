import { queryOptions } from "@tanstack/react-query";
import { keepPreviousDataOnSuccess } from "./keepPreviousDataOnSuccess";
import type { SeasonName } from "./season";

export type SeasonalAnime = {
  malId: number;
  romaji: string;
  english: string | null;
};

type JikanSeasonResponse = {
  data: Array<{
    mal_id: number;
    title: string;
    title_english: string | null;
  }>;
};

const seasonSlug: Record<SeasonName, string> = {
  Winter: "winter",
  Spring: "spring",
  Summer: "summer",
  Fall: "fall",
};

export const seasonalAnimeQueryKey = (year: number, name: SeasonName) =>
  ["seasonal-anime", year, name] as const;

function isRateLimitError(error: unknown): boolean {
  return error instanceof Error && error.message.includes("429");
}

export function filterSeasonalAnime(anime: SeasonalAnime[], query: string): SeasonalAnime[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return anime.filter((entry) => {
    if (entry.romaji.toLowerCase().includes(q)) return true;
    if (entry.english?.toLowerCase().includes(q)) return true;
    return false;
  });
}

export async function fetchSeasonalAnime(year: number, name: SeasonName): Promise<SeasonalAnime[]> {
  const slug = seasonSlug[name];
  const res = await fetch(`https://api.jikan.moe/v4/seasons/${year}/${slug}`);
  if (!res.ok) {
    throw new Error(`MyAnimeList seasonal lookup failed (${res.status})`);
  }
  const json = (await res.json()) as JikanSeasonResponse;
  return json.data.map((item) => ({
    malId: item.mal_id,
    romaji: item.title,
    english: item.title_english?.trim() ? item.title_english.trim() : null,
  }));
}

export function seasonalAnimeQueryOptions(year: number, name: SeasonName) {
  return queryOptions({
    queryKey: seasonalAnimeQueryKey(year, name),
    queryFn: () => fetchSeasonalAnime(year, name),
    placeholderData: keepPreviousDataOnSuccess,
    retry(failureCount, error) {
      if (isRateLimitError(error)) return false;
      return failureCount < 1;
    },
  });
}
