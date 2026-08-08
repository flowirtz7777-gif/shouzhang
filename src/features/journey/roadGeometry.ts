const STATION_GAP = 260;
const START_X = 80;
const BASE_Y = 300;
const ROAD_AMPLITUDE = 58;

export interface RoadStation {
  x: number;
  y: number;
}

export interface RoadGeometry {
  stations: RoadStation[];
  path: string;
  width: number;
}

export interface RoadPose extends RoadStation {
  angle: number;
}

function cubicBezier(start: number, controlA: number, controlB: number, end: number, t: number): number {
  const inverse = 1 - t;
  return inverse ** 3 * start
    + 3 * inverse ** 2 * t * controlA
    + 3 * inverse * t ** 2 * controlB
    + t ** 3 * end;
}

function cubicBezierDerivative(
  start: number,
  controlA: number,
  controlB: number,
  end: number,
  t: number,
): number {
  const inverse = 1 - t;
  return 3 * inverse ** 2 * (controlA - start)
    + 6 * inverse * t * (controlB - controlA)
    + 3 * t ** 2 * (end - controlB);
}

export function getRoadPose(stations: RoadStation[], progress: number): RoadPose {
  const first = stations[0] ?? { x: START_X, y: BASE_Y };
  if (stations.length < 2) return { ...first, angle: 0 };

  const normalized = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  const segmentProgress = normalized * (stations.length - 1);
  const segmentIndex = Math.min(stations.length - 2, Math.floor(segmentProgress));
  const t = Math.min(1, segmentProgress - segmentIndex);
  const start = stations[segmentIndex]!;
  const end = stations[segmentIndex + 1]!;
  const middleX = (start.x + end.x) / 2;
  const x = cubicBezier(start.x, middleX, middleX, end.x, t);
  const y = cubicBezier(start.y, start.y, end.y, end.y, t);
  const dx = cubicBezierDerivative(start.x, middleX, middleX, end.x, t);
  const dy = cubicBezierDerivative(start.y, start.y, end.y, end.y, t);

  return {
    x,
    y,
    angle: Math.atan2(dy, dx) * 180 / Math.PI,
  };
}

export function buildRoadGeometry(count: number): RoadGeometry {
  const stationCount = Math.max(0, Math.floor(count));
  if (stationCount === 0) {
    return { stations: [], path: "M 80 300", width: 1200 };
  }

  const stations = Array.from({ length: stationCount }, (_, index) => ({
    x: START_X + index * STATION_GAP,
    y: BASE_Y + Math.sin(index * 1.15) * ROAD_AMPLITUDE,
  }));

  const path = stations.reduce((value, station, index) => {
    if (index === 0) return `M ${station.x} ${station.y}`;
    const previous = stations[index - 1]!;
    const middle = (previous.x + station.x) / 2;
    return `${value} C ${middle} ${previous.y}, ${middle} ${station.y}, ${station.x} ${station.y}`;
  }, "");

  return {
    stations,
    path,
    width: Math.max(1200, START_X * 2 + stationCount * STATION_GAP),
  };
}
