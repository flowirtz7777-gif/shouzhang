import { act, renderHook } from "@testing-library/react";
import { installMatchMedia } from "../test/matchMedia";
import { useReducedMotion } from "./useReducedMotion";

test("reflects prefers-reduced-motion changes", () => {
  const media = installMatchMedia("(prefers-reduced-motion: reduce)", true);
  const { result } = renderHook(() => useReducedMotion());
  expect(result.current).toBe(true);
  act(() => media.setMatches(false));
  expect(result.current).toBe(false);
});
