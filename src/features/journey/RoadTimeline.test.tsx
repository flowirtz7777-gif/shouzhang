import { act, createRef } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { orderEntries } from "../../domain/orderEntries";
import { seedProject } from "../../domain/seedProject";
import { installMatchMedia } from "../../test/matchMedia";
import { RoadTimeline, type RoadTimelineHandle } from "./RoadTimeline";

function setRoadScrollRange(viewport: HTMLElement, scrollWidth = 2200, clientWidth = 1200): void {
  Object.defineProperties(viewport, {
    scrollWidth: { configurable: true, value: scrollWidth },
    clientWidth: { configurable: true, value: clientWidth },
  });
}

beforeEach(() => {
  installMatchMedia("(prefers-reduced-motion: reduce)", true);
  window.sessionStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test("renders chronologically ordered nodes and opens the matching journal entry", () => {
  const firstEntry = orderEntries(seedProject.entries)[0]!;
  render(<RoadTimeline project={seedProject} />, { wrapper: MemoryRouter });
  const nodes = screen.getAllByRole("link", { name: /打开手账/ });
  expect(nodes[0]).toHaveTextContent(firstEntry.title);
  expect(nodes[0]).toHaveAttribute("href", `/journal/${firstEntry.id}`);
});

test("draws one open railway and advances exactly one station per arrow key", () => {
  const { container } = render(<RoadTimeline project={seedProject} />, { wrapper: MemoryRouter });
  const trackLayers = container.querySelectorAll<SVGPathElement>("path[data-track-layer]");
  expect(trackLayers).toHaveLength(3);
  expect([...trackLayers].every((path) => !path.getAttribute("d")?.endsWith("Z"))).toBe(true);

  const viewport = screen.getByRole("region", { name: "社会实践旅途时间线" });
  const bus = container.querySelector<HTMLImageElement>(".road-bus")!;
  setRoadScrollRange(viewport);
  const stationProgress = 1 / (seedProject.entries.length + 1);
  const stationScroll = 1000 * stationProgress;

  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  expect(viewport.scrollLeft).toBeCloseTo(stationScroll);
  expect(bus).toHaveAttribute("data-road-progress", stationProgress.toFixed(4));
  expect(bus).toHaveAttribute("data-road-step", "1");

  fireEvent.keyDown(viewport, { key: "ArrowRight" });
  expect(viewport.scrollLeft).toBeCloseTo(stationScroll * 2);
  expect(bus).toHaveAttribute("data-road-step", "2");

  fireEvent.keyDown(viewport, { key: "ArrowLeft" });
  expect(viewport.scrollLeft).toBeCloseTo(stationScroll);
  expect(bus).toHaveAttribute("data-road-step", "1");
});

test("chapter navigation moves the bus to that chapter's first station", () => {
  const timelineRef = createRef<RoadTimelineHandle>();
  const { container } = render(
    <RoadTimeline ref={timelineRef} project={seedProject} />,
    { wrapper: MemoryRouter },
  );
  const viewport = screen.getByRole("region", { name: "社会实践旅途时间线" });
  const bus = container.querySelector<HTMLImageElement>(".road-bus")!;
  setRoadScrollRange(viewport);
  const entries = orderEntries(seedProject.entries);
  const firstEntryIndex = entries.findIndex(
    (entry) => entry.phaseId === seedProject.phases[1]!.id,
  );
  const stationIndex = firstEntryIndex + 1;
  const expectedProgress = stationIndex / (entries.length + 1);

  act(() => timelineRef.current?.scrollToPhase(seedProject.phases[1]!.id));

  expect(viewport.scrollLeft).toBeCloseTo(1000 * expectedProgress);
  expect(bus).toHaveAttribute("data-road-progress", expectedProgress.toFixed(4));
  expect(bus).toHaveAttribute("data-road-step", String(stationIndex));
});

test("does not remap vertical wheel gestures to horizontal road movement", () => {
  render(<RoadTimeline project={seedProject} />, { wrapper: MemoryRouter });
  const viewport = screen.getByRole("region", { name: "社会实践旅途时间线" });
  fireEvent.wheel(viewport, { deltaY: 120 });
  expect(viewport.scrollLeft).toBe(0);
});
