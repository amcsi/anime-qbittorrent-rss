import { useQuery } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { filterSeasonalAnime, seasonalAnimeQueryOptions, type SeasonalAnime } from "./malSeasonal";
import type { Season } from "./season";
import { useDebouncedValue } from "./useDebouncedValue";

type AnimeSearchTitleComboboxProps = {
  value: string;
  onChange: (value: string) => void;
  season: Season;
  onAnimeSelect: (anime: SeasonalAnime) => void;
};

const MAX_SUGGESTIONS = 12;
const SEARCH_DEBOUNCE_MS = 300;

export function AnimeSearchTitleCombobox({
  value,
  onChange,
  season,
  onAnimeSelect,
}: AnimeSearchTitleComboboxProps) {
  const listboxId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debouncedQuery = useDebouncedValue(value, SEARCH_DEBOUNCE_MS);
  const isDebouncing = value.trim() !== debouncedQuery.trim();

  const seasonalQuery = useMemo(
    () => seasonalAnimeQueryOptions(season.year, season.name),
    [season.year, season.name],
  );
  const { data: seasonalAnime = [], isPending, isFetching, error, isError } = useQuery(seasonalQuery);

  const suggestions = useMemo(
    () => filterSeasonalAnime(seasonalAnime, debouncedQuery).slice(0, MAX_SUGGESTIONS),
    [seasonalAnime, debouncedQuery],
  );

  const showList =
    open && debouncedQuery.trim().length > 0 && !isPending && !isDebouncing && !isError;

  useEffect(() => {
    setActiveIndex(-1);
  }, [debouncedQuery, season.year, season.name]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const selectAnime = (anime: SeasonalAnime) => {
    onAnimeSelect(anime);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showList || suggestions.length === 0) {
      if (event.key === "Escape") setOpen(false);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((idx) => (idx + 1) % suggestions.length);
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((idx) => (idx <= 0 ? suggestions.length - 1 : idx - 1));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      const selected = suggestions[activeIndex];
      if (selected) selectAnime(selected);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const activeOptionId =
    activeIndex >= 0 && activeIndex < suggestions.length
      ? `${listboxId}-option-${activeIndex}`
      : undefined;

  const loadError = error instanceof Error ? error.message : error ? "Could not load seasonal anime" : null;
  const showLoadingHint = isPending || (isFetching && seasonalAnime.length === 0);

  return (
    <div className="combobox" ref={rootRef}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onInputKeyDown}
        placeholder="e.g. My Anime Title"
        autoComplete="off"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listboxId}
        aria-activedescendant={activeOptionId}
        aria-autocomplete="list"
      />
      {showLoadingHint ? (
        <div className="combobox-hint">
          Loading {season.year} {season.name} anime…
        </div>
      ) : null}
      {isDebouncing && !showLoadingHint ? (
        <div className="combobox-hint">Searching…</div>
      ) : null}
      {loadError ? <div className="combobox-hint combobox-hint--error">{loadError}</div> : null}
      {showList ? (
        <ul className="combobox-list" id={listboxId} role="listbox">
          {suggestions.length === 0 ? (
            <li className="combobox-option combobox-option--empty" role="option" aria-disabled="true">
              No matches in this season
            </li>
          ) : (
            suggestions.map((anime, index) => {
              const ariaLabel = anime.english ? `${anime.english}, ${anime.romaji}` : anime.romaji;
              return (
                <li
                  key={anime.malId}
                  id={`${listboxId}-option-${index}`}
                  className={`combobox-option${index === activeIndex ? " combobox-option--active" : ""}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  aria-label={ariaLabel}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => selectAnime(anime)}
                >
                  <span className="combobox-option-primary">{anime.english ?? anime.romaji}</span>
                  {anime.english ? (
                    <span className="combobox-option-secondary">{anime.romaji}</span>
                  ) : null}
                </li>
              );
            })
          )}
        </ul>
      ) : null}
    </div>
  );
}
