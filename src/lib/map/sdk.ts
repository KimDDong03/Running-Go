import maplibregl, { type GeoJSONSource, type LngLatLike, type MapMouseEvent } from 'maplibre-gl';

export interface MapLatLng {
  lat: () => number;
  lng: () => number;
}

export interface MapPoint {
  x: number;
  y: number;
}

export interface MapBounds {
  extend: (latLng: MapLatLng) => void;
  getNE: () => MapLatLng;
  getSW: () => MapLatLng;
}

export interface MapLike {
  setCenter: (latLng: MapLatLng) => void;
  setZoom: (zoom: number) => void;
  setOptions?: (options: {
    draggable?: boolean;
    scrollWheel?: boolean;
    pinchZoom?: boolean;
    keyboardShortcuts?: boolean;
    disableDoubleClickZoom?: boolean;
    disableDoubleTapZoom?: boolean;
  }) => void;
  getCenter: () => MapLatLng;
  getZoom: () => number;
  getBounds: () => MapBounds;
  fitBounds: (bounds: MapBounds, options?: { top?: number; right?: number; bottom?: number; left?: number }) => void;
  destroy: () => void;
}

export interface MapMarkerLike {
  setPosition: (latLng: MapLatLng) => void;
  setMap: (map: MapLike | null) => void;
  getPosition?: () => MapLatLng;
}

export interface MapPolylineLike {
  setPath: (path: MapLatLng[]) => void;
  setMap: (map: MapLike | null) => void;
}

interface MapEventApi {
  addListener: (target: object, eventName: string, handler: (...args: unknown[]) => void) => object;
  removeListener: (listener: object) => void;
}

export interface MapSdkApi {
  LatLng: new (lat: number, lng: number) => MapLatLng;
  Point: new (x: number, y: number) => MapPoint;
  Size: new (width: number, height: number) => { width: number; height: number };
  LatLngBounds: new () => MapBounds;
  Map: new (container: HTMLElement, options: { center: MapLatLng; zoom: number; mapTypeControl?: boolean; zoomControl?: boolean }) => MapLike;
  Marker: new (options: {
    map?: MapLike;
    position: MapLatLng;
    draggable?: boolean;
    icon?: {
      content: HTMLElement | string;
      size?: { width: number; height: number };
      anchor?: MapPoint;
    };
  }) => MapMarkerLike;
  Polyline: new (options: {
    map?: MapLike;
    path: MapLatLng[];
    strokeColor: string;
    strokeWeight: number;
    strokeOpacity?: number;
    strokeLineCap?: 'round' | 'butt' | 'square';
    strokeLineJoin?: 'round' | 'bevel' | 'miter';
    clickable?: boolean;
  }) => MapPolylineLike;
  Event: MapEventApi;
}

const mapEventAlias: Record<string, string> = {
  zoom_start: 'zoomstart',
};

let lineId = 0;

class AdapterLatLng implements MapLatLng {
  constructor(private readonly latitude: number, private readonly longitude: number) {}
  lat() { return this.latitude; }
  lng() { return this.longitude; }
}

class AdapterPoint implements MapPoint {
  constructor(public x: number, public y: number) {}
}

class AdapterSize {
  constructor(public width: number, public height: number) {}
}

class AdapterBounds implements MapBounds {
  private readonly bounds: maplibregl.LngLatBounds;
  constructor() { this.bounds = new maplibregl.LngLatBounds(); }
  extend(latLng: MapLatLng) { this.bounds.extend([latLng.lng(), latLng.lat()]); }
  getNE() { const ne = this.bounds.getNorthEast(); return new AdapterLatLng(ne.lat, ne.lng); }
  getSW() { const sw = this.bounds.getSouthWest(); return new AdapterLatLng(sw.lat, sw.lng); }
  toMapLibreBounds() { return this.bounds; }
}

class AdapterMap implements MapLike {
  constructor(private readonly map: maplibregl.Map) {}
  setCenter(latLng: MapLatLng) { this.map.setCenter([latLng.lng(), latLng.lat()]); }
  setZoom(zoom: number) { this.map.setZoom(zoom); }
  setOptions(options: {
    draggable?: boolean;
    scrollWheel?: boolean;
    pinchZoom?: boolean;
    keyboardShortcuts?: boolean;
    disableDoubleClickZoom?: boolean;
    disableDoubleTapZoom?: boolean;
  }) {
    if (typeof options.draggable === 'boolean') options.draggable ? this.map.dragPan.enable() : this.map.dragPan.disable();
    if (typeof options.scrollWheel === 'boolean') options.scrollWheel ? this.map.scrollZoom.enable() : this.map.scrollZoom.disable();
    if (typeof options.pinchZoom === 'boolean') options.pinchZoom ? this.map.touchZoomRotate.enable() : this.map.touchZoomRotate.disable();
    if (typeof options.keyboardShortcuts === 'boolean') options.keyboardShortcuts ? this.map.keyboard.enable() : this.map.keyboard.disable();
    if (typeof options.disableDoubleClickZoom === 'boolean') options.disableDoubleClickZoom ? this.map.doubleClickZoom.disable() : this.map.doubleClickZoom.enable();
  }
  getCenter() { const center = this.map.getCenter(); return new AdapterLatLng(center.lat, center.lng); }
  getZoom() { return this.map.getZoom(); }
  getBounds() {
    const bounds = this.map.getBounds();
    const adapterBounds = new AdapterBounds();
    adapterBounds.extend(new AdapterLatLng(bounds.getSouthWest().lat, bounds.getSouthWest().lng));
    adapterBounds.extend(new AdapterLatLng(bounds.getNorthEast().lat, bounds.getNorthEast().lng));
    return adapterBounds;
  }
  fitBounds(bounds: MapBounds, options?: { top?: number; right?: number; bottom?: number; left?: number }) {
    const target = bounds instanceof AdapterBounds
      ? bounds.toMapLibreBounds()
      : new maplibregl.LngLatBounds([bounds.getSW().lng(), bounds.getSW().lat()], [bounds.getNE().lng(), bounds.getNE().lat()]);
    this.map.fitBounds(target, {
      padding: options ? { top: options.top ?? 0, right: options.right ?? 0, bottom: options.bottom ?? 0, left: options.left ?? 0 } : 0,
      maxZoom: 18,
      duration: 300,
    });
  }
  destroy() { this.map.remove(); }
  getMapLibreMap() { return this.map; }
}

class AdapterMarker implements MapMarkerLike {
  private currentMap: AdapterMap | null = null;
  constructor(private readonly marker: maplibregl.Marker, map?: AdapterMap) {
    if (map) {
      this.currentMap = map;
      this.marker.addTo(map.getMapLibreMap());
    }
  }
  setPosition(latLng: MapLatLng) { this.marker.setLngLat([latLng.lng(), latLng.lat()]); }
  setMap(map: MapLike | null) {
    this.marker.remove();
    this.currentMap = map instanceof AdapterMap ? map : null;
    if (this.currentMap) this.marker.addTo(this.currentMap.getMapLibreMap());
  }
  getPosition() { const position = this.marker.getLngLat(); return new AdapterLatLng(position.lat, position.lng); }
  getMapLibreMarker() { return this.marker; }
}

class AdapterPolyline implements MapPolylineLike {
  private readonly sourceId = `rg-poly-source-${++lineId}`;
  private readonly layerId = `rg-poly-layer-${lineId}`;
  private currentMap: AdapterMap | null;
  private path: MapLatLng[];
  private readonly color: string;
  private readonly weight: number;
  private readonly opacity: number;
  constructor(options: { map?: MapLike; path: MapLatLng[]; strokeColor: string; strokeWeight: number; strokeOpacity?: number }) {
    this.currentMap = options.map instanceof AdapterMap ? options.map : null;
    this.path = options.path;
    this.color = options.strokeColor;
    this.weight = options.strokeWeight;
    this.opacity = options.strokeOpacity ?? 1;
    if (this.currentMap) this.attach(this.currentMap);
  }
  setPath(path: MapLatLng[]) {
    this.path = path;
    if (!this.currentMap) return;
    const source = this.currentMap.getMapLibreMap().getSource(this.sourceId) as GeoJSONSource | undefined;
    if (source) source.setData(this.toGeoJson());
  }
  setMap(map: MapLike | null) {
    if (this.currentMap) {
      this.detach(this.currentMap);
      this.currentMap = null;
    }
    if (map instanceof AdapterMap) {
      this.currentMap = map;
      this.attach(map);
    }
  }
  private toGeoJson() {
    return {
      type: 'Feature' as const,
      properties: {},
      geometry: { type: 'LineString' as const, coordinates: this.path.map((point) => [point.lng(), point.lat()] as [number, number]) },
    };
  }
  private attach(map: AdapterMap) {
    const m = map.getMapLibreMap();
    if (!m.getSource(this.sourceId)) m.addSource(this.sourceId, { type: 'geojson', data: this.toGeoJson() });
    if (!m.getLayer(this.layerId)) {
      m.addLayer({
        id: this.layerId,
        type: 'line',
        source: this.sourceId,
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: { 'line-color': this.color, 'line-width': this.weight, 'line-opacity': this.opacity },
      });
    }
  }
  private detach(map: AdapterMap) {
    const m = map.getMapLibreMap();
    if (m.getLayer(this.layerId)) m.removeLayer(this.layerId);
    if (m.getSource(this.sourceId)) m.removeSource(this.sourceId);
  }
}

type AdapterListener = {
  target: maplibregl.Map | maplibregl.Marker;
  eventName: string;
  handler: (...args: unknown[]) => void;
};

const toLatLngLike = (latLng: MapLatLng): LngLatLike => [latLng.lng(), latLng.lat()];

const MAPBOX_STYLE_ID = 'mapbox/streets-v12';

const resolveMapLocale = () => {
  if (typeof document !== 'undefined') {
    const htmlLang = document.documentElement.lang?.toLowerCase();
    if (htmlLang.startsWith('ko')) {
      return 'ko';
    }
    if (htmlLang.startsWith('en')) {
      return 'en';
    }
  }

  if (typeof document !== 'undefined') {
    const localeCookie = document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('rg-locale='));
    const localeValue = localeCookie?.split('=')[1];
    if (localeValue === 'ko' || localeValue === 'en') {
      return localeValue;
    }
  }

  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('ko')) {
    return 'ko';
  }

  return 'en';
};

const buildLocalizedTextField = (locale: 'ko' | 'en') => {
  if (locale === 'ko') {
    return ['coalesce', ['get', 'name_ko'], ['get', 'name'], ['get', 'name_en']];
  }
  return ['coalesce', ['get', 'name_en'], ['get', 'name'], ['get', 'name_ko']];
};

const applyMapLabelLanguage = (map: maplibregl.Map, locale: 'ko' | 'en') => {
  const style = map.getStyle();
  const layers = style?.layers;
  if (!Array.isArray(layers)) {
    return;
  }

  const textField = buildLocalizedTextField(locale);
  layers.forEach((layer) => {
    if (layer.type !== 'symbol') {
      return;
    }

    const layout = (layer as { layout?: Record<string, unknown> }).layout;
    if (!layout || !('text-field' in layout)) {
      return;
    }

    try {
      map.setLayoutProperty(layer.id, 'text-field', textField);
    } catch {
      return;
    }
  });
};

const toMapboxSpriteUrl = (mapboxUrl: string, mapboxToken: string) => {
  const path = mapboxUrl.replace('mapbox://sprites/', '');
  return `https://api.mapbox.com/styles/v1/${path}/sprite?access_token=${mapboxToken}`;
};

const toMapboxGlyphUrl = (mapboxUrl: string, mapboxToken: string) => {
  const path = mapboxUrl.replace('mapbox://fonts/', '');
  return `https://api.mapbox.com/fonts/v1/${path}?access_token=${mapboxToken}`;
};

const toMapboxTileJsonUrl = (mapboxUrl: string, mapboxToken: string) => {
  const path = mapboxUrl.replace('mapbox://', '');
  return `https://api.mapbox.com/v4/${path}.json?secure&access_token=${mapboxToken}`;
};

const deepClone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const stripNameFields = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stripNameFields(item));
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const next: Record<string, unknown> = {};
  Object.entries(value as Record<string, unknown>).forEach(([key, fieldValue]) => {
    if (key === 'name') {
      return;
    }
    next[key] = stripNameFields(fieldValue);
  });
  return next;
};

const sanitizeMapboxStyle = (style: Record<string, unknown>, mapboxToken: string) => {
  const next = stripNameFields(deepClone(style)) as Record<string, unknown>;

  if (typeof next.sprite === 'string' && next.sprite.startsWith('mapbox://sprites/')) {
    next.sprite = toMapboxSpriteUrl(next.sprite, mapboxToken);
  }

  if (typeof next.glyphs === 'string' && next.glyphs.startsWith('mapbox://fonts/')) {
    next.glyphs = toMapboxGlyphUrl(next.glyphs, mapboxToken);
  }

  const sources = next.sources as Record<string, Record<string, unknown>> | undefined;
  if (sources && typeof sources === 'object') {
    Object.values(sources).forEach((source) => {
      if (typeof source.url === 'string' && source.url.startsWith('mapbox://')) {
        source.url = toMapboxTileJsonUrl(source.url, mapboxToken);
      }
    });
  }

  return next;
};

const fetchMapboxStyle = async (mapboxToken: string) => {
  const styleUrl = `https://api.mapbox.com/styles/v1/${MAPBOX_STYLE_ID}?access_token=${mapboxToken}`;
  const response = await fetch(styleUrl, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error('Mapbox style request failed');
  }

  const style = await response.json() as Record<string, unknown>;
  return sanitizeMapboxStyle(style, mapboxToken);
};

const createMapSdk = (preparedStyle: Record<string, unknown>): MapSdkApi => {
  const Event: MapEventApi = {
    addListener(target: object, eventName: string, handler: (...args: unknown[]) => void) {
      const resolvedEvent = mapEventAlias[eventName] ?? eventName;
      if (target instanceof AdapterMap) {
        const mapTarget = target.getMapLibreMap();
        const wrapped = (...args: unknown[]) => {
          if (args[0] && typeof args[0] === 'object' && 'lngLat' in (args[0] as object)) {
            const event = args[0] as MapMouseEvent;
            handler({ coord: new AdapterLatLng(event.lngLat.lat, event.lngLat.lng), domEvent: event.originalEvent });
            return;
          }
          handler(...args);
        };
        mapTarget.on(resolvedEvent, wrapped);
        return { target: mapTarget, eventName: resolvedEvent, handler: wrapped } as AdapterListener;
      }
      if (target instanceof AdapterMarker) {
        const markerTarget = target.getMapLibreMarker();
        markerTarget.on(resolvedEvent, handler);
        return { target: markerTarget, eventName: resolvedEvent, handler } as AdapterListener;
      }
      throw new Error('Unsupported event target');
    },
    removeListener(listener: object) {
      const typed = listener as AdapterListener;
      if (!typed?.target || !typed.eventName || !typed.handler) return;
      typed.target.off(typed.eventName, typed.handler);
    },
  };

  return {
    LatLng: AdapterLatLng,
    Point: AdapterPoint,
    Size: AdapterSize,
    LatLngBounds: AdapterBounds,
    Map: class extends AdapterMap {
      constructor(container: HTMLElement, options: { center: MapLatLng; zoom: number }) {
        const locale = resolveMapLocale();
        const map = new maplibregl.Map({
          container,
          style: deepClone(preparedStyle) as unknown as maplibregl.StyleSpecification,
          center: toLatLngLike(options.center),
          zoom: options.zoom,
        });

        const syncLanguage = () => {
          applyMapLabelLanguage(map, locale);
        };

        map.on('load', syncLanguage);
        map.on('styledata', syncLanguage);
        super(map);
      }
    },
    Marker: class extends AdapterMarker {
      constructor(options: { map?: MapLike; position: MapLatLng; draggable?: boolean; icon?: { content: HTMLElement | string; size?: { width: number; height: number }; anchor?: MapPoint } }) {
        const element = typeof options.icon?.content === 'string'
          ? (() => {
              const wrapper = document.createElement('div');
              wrapper.innerHTML = options.icon.content;
              return wrapper;
            })()
          : options.icon?.content;
        const marker = new maplibregl.Marker({
          element,
          draggable: options.draggable,
          anchor: options.icon?.anchor ? 'center' : 'bottom',
        }).setLngLat(toLatLngLike(options.position));
        super(marker, options.map instanceof AdapterMap ? options.map : undefined);
      }
    },
    Polyline: AdapterPolyline,
    Event,
  };
};

const ensureMapLibreStyle = () => {
  if (typeof document === 'undefined') return;
  if (document.getElementById('maplibre-css')) return;
  const link = document.createElement('link');
  link.id = 'maplibre-css';
  link.rel = 'stylesheet';
  link.href = 'https://unpkg.com/maplibre-gl@5.18.0/dist/maplibre-gl.css';
  document.head.appendChild(link);
};

let sdkLoaderPromise: Promise<MapSdkApi> | null = null;

export const loadMapSdk = (): Promise<MapSdkApi> => {
  if (sdkLoaderPromise) return sdkLoaderPromise;

  sdkLoaderPromise = new Promise<MapSdkApi>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('지도 SDK는 브라우저에서만 로드할 수 있습니다'));
      return;
    }

    const token = process.env.NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN;
    if (!token) {
      reject(new Error('NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN 환경 변수가 필요합니다'));
      return;
    }

    ensureMapLibreStyle();
    void fetchMapboxStyle(token)
      .then((style) => {
        resolve(createMapSdk(style));
      })
      .catch((error) => {
        reject(error);
      });
  });

  return sdkLoaderPromise;
};
