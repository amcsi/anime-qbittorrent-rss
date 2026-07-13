import type { Query } from "@tanstack/react-query";

export function keepPreviousDataOnSuccess<T>(
  previousData: T | undefined,
  previousQuery: Pick<Query<unknown, unknown, T>, "state"> | undefined,
): T | undefined {
  if (previousQuery?.state.status === "success") {
    return previousData;
  }
  return undefined;
}
