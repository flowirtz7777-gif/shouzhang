import { buildRoadGeometry, getRoadPose } from "./roadGeometry";

test("keeps every station farther right than the previous station", () => {
  const geometry = buildRoadGeometry(8);
  expect(
    geometry.stations.every(
      (station, index) => index === 0 || station.x > geometry.stations[index - 1]!.x,
    ),
  ).toBe(true);
  expect(geometry.path.startsWith("M 80")).toBe(true);
  expect(geometry.path.endsWith("Z")).toBe(false);
  expect(geometry.width).toBeGreaterThan(8 * 240);
});

test("returns a stable open start path for an empty project", () => {
  expect(buildRoadGeometry(0)).toEqual({ stations: [], path: "M 80 300", width: 1200 });
});

test("interpolates a stable pose from the first station to the last", () => {
  const geometry = buildRoadGeometry(6);
  expect(getRoadPose(geometry.stations, -1)).toEqual({ ...geometry.stations[0]!, angle: 0 });
  expect(getRoadPose(geometry.stations, 1)).toEqual({ ...geometry.stations.at(-1)!, angle: 0 });

  const middle = getRoadPose(geometry.stations, 0.5);
  expect(middle.x).toBeGreaterThan(geometry.stations[0]!.x);
  expect(middle.x).toBeLessThan(geometry.stations.at(-1)!.x);
  expect(Number.isFinite(middle.y)).toBe(true);
  expect(Number.isFinite(middle.angle)).toBe(true);
});

test("uses the cubic road tangent for its midpoint angle", () => {
  const middle = getRoadPose([{ x: 0, y: 0 }, { x: 100, y: 100 }], 0.5);
  expect(middle.x).toBeCloseTo(50);
  expect(middle.y).toBeCloseTo(50);
  expect(middle.angle).toBeCloseTo(63.4349, 3);
});
