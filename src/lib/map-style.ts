import mapboxgl from 'mapbox-gl';

export const NAVER_LIKE_MAP_STYLE_ID = 'mapbox/navigation-day-v1';
export const NAVER_LIKE_MAP_STYLE = `mapbox://styles/${NAVER_LIKE_MAP_STYLE_ID}`;

const KOREAN_NAME_EXPRESSION = [
  'coalesce',
  ['get', 'name_ko'],
  ['get', 'name_kr'],
  ['get', 'name_local'],
  ['get', 'name'],
] as const;

const isNameProperty = (value: unknown) => {
  if (typeof value !== 'string') return false;
  return value === 'name' || value === 'name_en' || value === 'name:en' || value.startsWith('name_');
};

const localizeTextFieldExpression = (value: unknown): unknown => {
  if (typeof value === 'string') {
    if (value === '{name}' || value === '{name_en}' || value === '{name:en}') {
      return KOREAN_NAME_EXPRESSION;
    }
    return value;
  }

  if (!Array.isArray(value) || value.length === 0) {
    return value;
  }

  const [operator, ...rest] = value;

  if (operator === 'get' && isNameProperty(rest[0])) {
    return KOREAN_NAME_EXPRESSION;
  }

  return [operator, ...rest.map((entry) => localizeTextFieldExpression(entry))];
};

const ROAD_LINE_KEYWORDS = [
  'road',
  'street',
  'motorway',
  'trunk',
  'primary',
  'secondary',
  'tertiary',
  'service',
  'path',
  'pedestrian',
  'track',
];

const NON_ROAD_LINE_KEYWORDS = [
  'rail',
  'ferry',
  'subway',
  'tram',
  'aeroway',
  'runway',
  'river',
  'waterway',
  'boundary',
];

const ROAD_BADGE_KEYWORDS = [
  'shield',
  'road-number',
  'route-number',
  'highway-number',
  'motorway-number',
  'junction-number',
];

const LANDMARK_LABEL_KEYWORDS = [
  'poi',
  'landmark',
  'place-label',
  'settlement',
  'town',
  'village',
  'city',
];

const WIDE_AREA_LABEL_KEYWORDS = [
  'settlement',
  'place-label',
  'state-label',
  'country-label',
  'city',
  'town',
  'village',
];

const NON_LANDMARK_LABEL_KEYWORDS = [
  'road',
  'street',
  'shield',
  'number',
  'route',
  'motorway',
  'transit',
  'airport',
  'aeroway',
  'rail',
  'ferry',
  'waterway',
];

const includesAnyKeyword = (value: string, keywords: readonly string[]) => {
  return keywords.some((keyword) => value.includes(keyword));
};

const isRoadLineLayerId = (layerId: string) => {
  const id = layerId.toLowerCase();
  if (includesAnyKeyword(id, NON_ROAD_LINE_KEYWORDS)) {
    return false;
  }
  return includesAnyKeyword(id, ROAD_LINE_KEYWORDS);
};

const shouldHideRoadBadgeLayer = (map: mapboxgl.Map, layerId: string) => {
  const normalizedId = layerId.toLowerCase();
  if (includesAnyKeyword(normalizedId, ROAD_BADGE_KEYWORDS)) {
    return true;
  }

  const iconImage = map.getLayoutProperty(layerId, 'icon-image');
  if (!iconImage) {
    return false;
  }

  const serialized = typeof iconImage === 'string'
    ? iconImage.toLowerCase()
    : JSON.stringify(iconImage).toLowerCase();

  return includesAnyKeyword(serialized, ROAD_BADGE_KEYWORDS);
};

const isLandmarkLabelLayerId = (layerId: string) => {
  const id = layerId.toLowerCase();

  if (includesAnyKeyword(id, NON_LANDMARK_LABEL_KEYWORDS)) {
    return false;
  }

  return includesAnyKeyword(id, LANDMARK_LABEL_KEYWORDS);
};

const isWideAreaLabelLayerId = (layerId: string) => {
  const id = layerId.toLowerCase();
  return includesAnyKeyword(id, WIDE_AREA_LABEL_KEYWORDS);
};

export const applyKoreanMapLabels = (map: mapboxgl.Map) => {
  const mapWithConfig = map as mapboxgl.Map & {
    setConfigProperty?: (importId: string, configName: string, value: unknown) => void;
  };

  if (typeof mapWithConfig.setConfigProperty === 'function') {
    try {
      mapWithConfig.setConfigProperty('basemap', 'language', 'ko');
      mapWithConfig.setConfigProperty('basemap', 'showPointOfInterestLabels', true);
      mapWithConfig.setConfigProperty('basemap', 'showPlaceLabels', true);
    } catch {
      // Continue with expression-based fallback below.
    }
  }

  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    if (layer.type !== 'symbol' || !map.getLayer(layer.id)) {
      return;
    }

    const textField = map.getLayoutProperty(layer.id, 'text-field');
    if (!textField) {
      return;
    }

    const localized = localizeTextFieldExpression(textField);

    if (JSON.stringify(localized) === JSON.stringify(textField)) {
      return;
    }

    try {
      map.setLayoutProperty(layer.id, 'text-field', localized as mapboxgl.Expression);
    } catch {
      // Some custom style expressions may be immutable/unsupported; skip safely.
    }
  });
};

export const applyRoadVisualStyle = (map: mapboxgl.Map) => {
  const layers = map.getStyle().layers ?? [];

  layers.forEach((layer) => {
    if (!map.getLayer(layer.id)) {
      return;
    }

    if (layer.type === 'symbol') {
      if (!shouldHideRoadBadgeLayer(map, layer.id)) {
        if (!isLandmarkLabelLayerId(layer.id)) {
          return;
        }

        try {
          const isWideAreaLayer = isWideAreaLabelLayerId(layer.id);

          map.setLayoutProperty(layer.id, 'visibility', 'visible');
          map.setLayoutProperty(
            layer.id,
            'text-size',
            isWideAreaLayer
              ? [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  4,
                  11,
                  8,
                  13,
                  12,
                  15,
                ]
              : [
                  'interpolate',
                  ['linear'],
                  ['zoom'],
                  10,
                  10,
                  14,
                  12,
                  17,
                  13,
                ]
          );
          map.setLayerZoomRange(layer.id, isWideAreaLayer ? 4 : 10, 24);
          map.setPaintProperty(layer.id, 'text-color', '#1f2937');
          map.setPaintProperty(layer.id, 'text-halo-color', '#ffffff');
          map.setPaintProperty(layer.id, 'text-halo-width', 1.2);
          if (isWideAreaLayer) {
            map.setPaintProperty(layer.id, 'text-opacity', [
              'interpolate',
              ['linear'],
              ['zoom'],
              4,
              0.92,
              10,
              1,
            ]);
          }
        } catch {
          // Some symbol layers may not support these overrides; skip safely.
        }

        return;
      }

      try {
        map.setLayoutProperty(layer.id, 'visibility', 'none');
      } catch {
        // Some symbol layers may be immutable; skip safely.
      }

      return;
    }

    if (layer.type !== 'line') {
      return;
    }

    if (!isRoadLineLayerId(layer.id)) {
      return;
    }

    try {
      map.setPaintProperty(layer.id, 'line-color', '#cfd7e3');
      map.setPaintProperty(layer.id, 'line-opacity', 0.95);
    } catch {
      // Not all line layers support direct overrides; skip safely.
    }
  });
};
