import { vi } from "vitest";

export function installMatchMedia(query: string, initial: boolean) {
  let matches = initial;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    media: query,
    get matches() {
      return matches;
    },
    onchange: null,
    addEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener),
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => true,
  } as MediaQueryList;

  vi.stubGlobal("matchMedia", (value: string) =>
    value === query ? media : { ...media, media: value, matches: false },
  );

  return {
    setMatches(next: boolean) {
      matches = next;
      const event = { matches, media: query } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}
