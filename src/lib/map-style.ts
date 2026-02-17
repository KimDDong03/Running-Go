import type { Map } from 'maplibre-gl';

export const DEFAULT_MAP_STYLE = 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json';

export const applyKoreanMapLabels = (_map: Map) => {
  const map = _map;
  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    if (layer.type !== 'symbol' || !map.getLayer(layer.id)) {
      return;
    }

    const layout = layer.layout as { 'text-field'?: unknown } | undefined;
    if (!layout || layout['text-field'] === undefined) {
      return;
    }

    const layerId = layer.id.toLowerCase();
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']?.toLowerCase() ?? '';
    const looksLikePlaceLabel =
      layerId.includes('place')
      || layerId.includes('country')
      || layerId.includes('state')
      || layerId.includes('settlement')
      || sourceLayer.includes('place');

    if (!looksLikePlaceLabel) {
      return;
    }

    map.setLayoutProperty(layer.id, 'text-field', [
      'coalesce',
      ['get', 'name:ko'],
      ['get', 'name_ko'],
      ['get', 'name'],
      ['get', 'name_en'],
    ]);
  });
};

const ROAD_LABEL_ID_KEYWORDS = [
  'road',
  'street',
  'highway',
  'transportation_name',
  'housenumber',
  'address',
  'path',
  'pedestrian',
  'cycleway',
  'shield',
];

const ROAD_LABEL_SOURCE_KEYWORDS = ['transportation_name', 'housenumber'];

const KEEP_LABEL_ID_KEYWORDS = [
  'place',
  'poi',
  'airport',
  'water',
  'marine',
  'country',
  'state',
  'settlement',
  'mountain',
  'landmark',
  'park',
  'building',
];

const WALKABLE_LINE_KEYWORDS = [
  'path',
  'pedestrian',
  'footway',
  'sidewalk',
  'track',
  'steps',
  'cycleway',
  'living',
  'service',
  'minor',
];

const VEHICLE_MAJOR_LINE_KEYWORDS = ['motorway', 'trunk', 'primary'];

export const applyRoadVisualStyle = (map: Map) => {
  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    if (layer.type !== 'symbol' || !map.getLayer(layer.id)) {
      return;
    }

    const layerId = layer.id.toLowerCase();
    const sourceLayer = (layer as { 'source-layer'?: string })['source-layer']?.toLowerCase() ?? '';

    if (KEEP_LABEL_ID_KEYWORDS.some((keyword) => layerId.includes(keyword))) {
      return;
    }

    const isRoadLabelById = ROAD_LABEL_ID_KEYWORDS.some((keyword) => layerId.includes(keyword));
    const isRoadLabelBySource = ROAD_LABEL_SOURCE_KEYWORDS.some((keyword) => sourceLayer.includes(keyword));

    if (!isRoadLabelById && !isRoadLabelBySource) {
      return;
    }

    map.setLayoutProperty(layer.id, 'visibility', 'none');
  });

  layers.forEach((layer) => {
    if (layer.type !== 'line' || !map.getLayer(layer.id)) {
      return;
    }

    const layerId = layer.id.toLowerCase();

    const isWalkableLine = WALKABLE_LINE_KEYWORDS.some((keyword) => layerId.includes(keyword));
    if (isWalkableLine) {
      map.setPaintProperty(layer.id, 'line-width', [
        'interpolate',
        ['linear'],
        ['zoom'],
        11,
        1.2,
        13,
        2.2,
        15,
        4,
        17,
        6,
        19,
        9,
      ]);
      map.setPaintProperty(layer.id, 'line-opacity', 0.95);
      map.setPaintProperty(layer.id, 'line-color', '#475569');
      return;
    }

    const isMajorVehicleLine = VEHICLE_MAJOR_LINE_KEYWORDS.some((keyword) => layerId.includes(keyword));
    if (isMajorVehicleLine) {
      map.setPaintProperty(layer.id, 'line-opacity', 0.65);
    }
  });
};
