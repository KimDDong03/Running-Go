export interface LatLng {
  lat: number;
  lng: number;
}

export interface GPSPoint extends LatLng {
  timestamp: number;
  accuracy: number;
}

export const MATCH_THRESHOLD_METERS = 120;
export const MIN_MATCH_RATE = 90;
export const DEFAULT_MAX_ACCURACY = 20;
export const DENSIFY_STEP_METERS = 8;
export const TARGET_MATCH_DISTANCE_METERS = 60;
export const MAX_MATCH_DISTANCE_METERS = 200;
export const MAX_SPEED_MPS = 7;
export const MAX_JUMP_METERS = 120;
export const MAX_JUMP_TIME_SECONDS = 5;

export interface MatchDetails {
  matchRate: number;
  userMedianDistance: number;
  courseMedianDistance: number;
  userP90Distance: number;
  courseP90Distance: number;
  userCoverageRate: number;
  courseCoverageRate: number;
  userPointCount: number;
  coursePointCount: number;
}

export function calculateDistanceMeters(p1: LatLng, p2: LatLng): number {
  const R = 6371e3;
  const phi1 = p1.lat * Math.PI / 180;
  const phi2 = p2.lat * Math.PI / 180;
  const deltaPhi = (p2.lat - p1.lat) * Math.PI / 180;
  const deltaLambda = (p2.lng - p1.lng) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) * Math.cos(phi2) *
    Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

export function calculateMatchRate(courseWaypoints: LatLng[], userPath: GPSPoint[]): number {
  return calculateMatchDetails(courseWaypoints, userPath).matchRate;
}

export function calculateMatchDetails(courseWaypoints: LatLng[], userPath: GPSPoint[]): MatchDetails {
  if (courseWaypoints.length === 0 || userPath.length === 0) {
    return {
      matchRate: 0,
      userMedianDistance: 0,
      courseMedianDistance: 0,
      userP90Distance: 0,
      courseP90Distance: 0,
      userCoverageRate: 0,
      courseCoverageRate: 0,
      userPointCount: userPath.length,
      coursePointCount: courseWaypoints.length,
    };
  }

  const densifiedUserPath = densifyPath(userPath, DENSIFY_STEP_METERS);
  const densifiedCourse = densifyPath(courseWaypoints, DENSIFY_STEP_METERS);
  const simplifiedUserPath = simplifyPath(densifiedUserPath, DENSIFY_STEP_METERS);
  const simplifiedCourse = simplifyPath(densifiedCourse, DENSIFY_STEP_METERS);

  if (simplifiedUserPath.length === 0 || simplifiedCourse.length === 0) {
    return {
      matchRate: 0,
      userMedianDistance: 0,
      courseMedianDistance: 0,
      userP90Distance: 0,
      courseP90Distance: 0,
      userCoverageRate: 0,
      courseCoverageRate: 0,
      userPointCount: simplifiedUserPath.length,
      coursePointCount: simplifiedCourse.length,
    };
  }

  const userDistances = simplifiedUserPath.map((point) =>
    distanceToPolylineMeters(point, simplifiedCourse)
  );
  const courseDistances = simplifiedCourse.map((point) =>
    distanceToPolylineMeters(point, simplifiedUserPath)
  );

  const userMedian = median(userDistances);
  const courseMedian = median(courseDistances);
  const userP90 = percentile(userDistances, 0.9);
  const courseP90 = percentile(courseDistances, 0.9);
  const userCoverage = coverageRate(userDistances, TARGET_MATCH_DISTANCE_METERS);
  const courseCoverage = coverageRate(courseDistances, TARGET_MATCH_DISTANCE_METERS);

  const avgP90 = (userP90 + courseP90) / 2;
  const distanceScore = 1 - clamp(avgP90 / MAX_MATCH_DISTANCE_METERS, 0, 1);
  const coverageScore = (userCoverage + courseCoverage) / 2;
  const combinedScore = clamp(distanceScore * 0.45 + coverageScore * 0.55, 0, 1);
  const rounded = Math.round(combinedScore * 1000) / 10;

  return {
    matchRate: rounded,
    userMedianDistance: Math.round(userMedian * 10) / 10,
    courseMedianDistance: Math.round(courseMedian * 10) / 10,
    userP90Distance: Math.round(userP90 * 10) / 10,
    courseP90Distance: Math.round(courseP90 * 10) / 10,
    userCoverageRate: Math.round(userCoverage * 1000) / 10,
    courseCoverageRate: Math.round(courseCoverage * 1000) / 10,
    userPointCount: simplifiedUserPath.length,
    coursePointCount: simplifiedCourse.length,
  };
}

export function validateCollection(courseWaypoints: LatLng[], userPath: GPSPoint[]) {
  const details = calculateMatchDetails(courseWaypoints, userPath);
  const matchRate = details.matchRate;

  if (matchRate < MIN_MATCH_RATE) {
    const debugInfo = `거리 중앙값 ${details.userMedianDistance}m/${details.courseMedianDistance}m · 점 ${details.userPointCount}/${details.coursePointCount}`;
    return {
      isValid: false,
      matchRate,
      reason: `경로 매칭률 ${matchRate}% (필요: ${MIN_MATCH_RATE}%) · ${debugInfo}`,
    };
  }

  return {
    isValid: true,
    matchRate,
  };
}

export function filterLowAccuracyPoints(path: GPSPoint[], maxAccuracy: number = DEFAULT_MAX_ACCURACY) {
  const accurate = path.filter((point) => point.accuracy <= maxAccuracy);
  const base = accurate.length > 0 ? accurate : path;
  const filtered = filterBySpeed(base);
  return filtered.length >= 2 ? filtered : base;
}

function filterBySpeed(points: GPSPoint[]) {
  if (points.length <= 2) return points;
  const filtered: GPSPoint[] = [points[0]];

  for (let i = 1; i < points.length; i++) {
    const prev = filtered[filtered.length - 1];
    const curr = points[i];
    const dtSec = (curr.timestamp - prev.timestamp) / 1000;
    if (dtSec <= 0) continue;

    const distance = calculateDistanceMeters(prev, curr);
    const speed = distance / dtSec;
    if (speed > MAX_SPEED_MPS) continue;
    if (distance > MAX_JUMP_METERS && dtSec < MAX_JUMP_TIME_SECONDS) continue;

    filtered.push(curr);
  }

  return filtered;
}

function distanceToPolylineMeters(point: LatLng, polyline: LatLng[]): number {
  if (polyline.length === 1) {
    return calculateDistanceMeters(point, polyline[0]);
  }

  let minDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < polyline.length - 1; i++) {
    const distance = distancePointToSegmentMeters(point, polyline[i], polyline[i + 1]);
    if (distance < minDistance) {
      minDistance = distance;
    }
  }

  return minDistance;
}

function simplifyPath(points: LatLng[], minDistanceMeters: number): LatLng[] {
  if (points.length <= 2) return points;
  const simplified: LatLng[] = [points[0]];
  for (let i = 1; i < points.length; i++) {
    const prev = simplified[simplified.length - 1];
    const next = points[i];
    if (calculateDistanceMeters(prev, next) >= minDistanceMeters) {
      simplified.push(next);
    }
  }
  if (simplified[simplified.length - 1] !== points[points.length - 1]) {
    simplified.push(points[points.length - 1]);
  }
  return simplified;
}

function densifyPath(points: LatLng[], stepMeters: number): LatLng[] {
  if (points.length <= 1 || stepMeters <= 0) return points;
  const densified: LatLng[] = [points[0]];

  for (let i = 0; i < points.length - 1; i++) {
    const start = points[i];
    const end = points[i + 1];
    const distance = calculateDistanceMeters(start, end);

    if (distance <= stepMeters) {
      densified.push(end);
      continue;
    }

    const steps = Math.floor(distance / stepMeters);
    for (let s = 1; s <= steps; s++) {
      const t = (s * stepMeters) / distance;
      if (t >= 1) break;
      densified.push({
        lat: start.lat + (end.lat - start.lat) * t,
        lng: start.lng + (end.lng - start.lng) * t,
      });
    }

    densified.push(end);
  }

  return densified;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

function coverageRate(distances: number[], threshold: number): number {
  if (distances.length === 0) return 0;
  const covered = distances.filter((distance) => distance <= threshold).length;
  return covered / distances.length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function distancePointToSegmentMeters(point: LatLng, start: LatLng, end: LatLng): number {
  const refLat = (start.lat + end.lat + point.lat) / 3;
  const scale = Math.cos((refLat * Math.PI) / 180);
  const toXY = (coord: LatLng) => ({
    x: coord.lng * 111320 * scale,
    y: coord.lat * 111320,
  });

  const p = toXY(point);
  const a = toXY(start);
  const b = toXY(end);

  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  const t = abLenSq === 0 ? 0 : Math.max(0, Math.min(1, (apx * abx + apy * aby) / abLenSq));

  const closest = {
    x: a.x + abx * t,
    y: a.y + aby * t,
  };

  const dx = p.x - closest.x;
  const dy = p.y - closest.y;
  return Math.sqrt(dx * dx + dy * dy);
}
