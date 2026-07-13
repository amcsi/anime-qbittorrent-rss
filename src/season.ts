export type SeasonName = "Winter" | "Spring" | "Summer" | "Fall";

export type Season = {
  year: number;
  month: 1 | 4 | 7 | 10;
  name: SeasonName;
};

export function seasonFromMonth(month1to12: number): { month: 1 | 4 | 7 | 10; name: SeasonName } {
  if (month1to12 >= 10) return { month: 10, name: "Fall" };
  if (month1to12 >= 7) return { month: 7, name: "Summer" };
  if (month1to12 >= 4) return { month: 4, name: "Spring" };
  return { month: 1, name: "Winter" };
}

export function defaultSeasonForNow(now = new Date()): Season {
  const year = now.getFullYear();
  const month1to12 = now.getMonth() + 1;
  const { month, name } = seasonFromMonth(month1to12);
  return { year, month, name };
}

export function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

export function seasonKey(season: Season): string {
  return `${season.year}-${pad2(season.month)}-${season.name}`;
}

export function seasonsEqual(a: Season, b: Season): boolean {
  return a.year === b.year && a.month === b.month && a.name === b.name;
}

export function stepSeason(season: Season, delta: -1 | 1): Season {
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
