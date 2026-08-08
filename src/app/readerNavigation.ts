import { createContext, useContext } from "react";

export interface ReaderNavigation {
  journeyPath: string;
  journalPath: string;
  overviewPath?: string;
}

export const ReaderNavigationContext = createContext<ReaderNavigation>({
  journeyPath: "/journey",
  journalPath: "/journal",
});

export function useReaderNavigation(): ReaderNavigation {
  return useContext(ReaderNavigationContext);
}
