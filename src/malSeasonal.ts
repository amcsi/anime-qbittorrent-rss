import { queryOptions } from "@tanstack/react-query";
import { keepPreviousDataOnSuccess } from "./keepPreviousDataOnSuccess";
import type { SeasonName } from "./season";

export type SeasonalAnime = {
  malId: number;
  romaji: string;
  english: string | null;
};

type TenraiSeasonResponse = {
  pagination: { has_next_page: boolean };
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

// Tenrai caps page size at 100, so a season spans a few pages.
const PAGE_LIMIT = 100;

export async function fetchSeasonalAnime(year: number, name: SeasonName): Promise<SeasonalAnime[]> {
  const slug = seasonSlug[name];
  const anime: SeasonalAnime[] = [];
  const seen = new Set<number>();
  for (let page = 1; ; page++) {
    const res = await fetch(
      `https://api.tenrai.org/v1/seasons/${year}/${slug}?limit=${PAGE_LIMIT}&page=${page}`,
    );
    if (!res.ok) {
      throw new Error(`MyAnimeList seasonal lookup failed (${res.status})`);
    }
    const json = (await res.json()) as TenraiSeasonResponse;
    for (const item of json.data) {
      if (seen.has(item.mal_id)) continue;
      seen.add(item.mal_id);
      anime.push({
        malId: item.mal_id,
        romaji: item.title,
        english: item.title_english?.trim() ? item.title_english.trim() : null,
      });
    }
    if (!json.pagination.has_next_page) return anime;
  }
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
