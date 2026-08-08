import type { ReactNode } from "react";
import { ReaderNavigationContext, type ReaderNavigation } from "./readerNavigation";

export function ReaderNavigationProvider({
  value,
  children,
}: {
  value: ReaderNavigation;
  children: ReactNode;
}) {
  return (
    <ReaderNavigationContext.Provider value={value}>
      {children}
    </ReaderNavigationContext.Provider>
  );
}
