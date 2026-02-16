interface NaverMapLatLng {
  lat: () => number;
  lng: () => number;
}

interface NaverMapPoint {
  x: number;
  y: number;
}

interface NaverMapBounds {
  extend: (latLng: NaverMapLatLng) => void;
  getNE: () => NaverMapLatLng;
  getSW: () => NaverMapLatLng;
}

interface NaverMapLike {
  setCenter: (latLng: NaverMapLatLng) => void;
  setZoom: (zoom: number) => void;
  setOptions?: (options: {
    draggable?: boolean;
    scrollWheel?: boolean;
    pinchZoom?: boolean;
    keyboardShortcuts?: boolean;
    disableDoubleClickZoom?: boolean;
    disableDoubleTapZoom?: boolean;
  }) => void;
  getCenter: () => NaverMapLatLng;
  getZoom: () => number;
  getBounds: () => NaverMapBounds;
  fitBounds: (bounds: NaverMapBounds, options?: { top?: number; right?: number; bottom?: number; left?: number }) => void;
  destroy: () => void;
}

interface NaverMapMarkerLike {
  setPosition: (latLng: NaverMapLatLng) => void;
  setMap: (map: NaverMapLike | null) => void;
  getPosition?: () => NaverMapLatLng;
}

interface NaverMapPolylineLike {
  setPath: (path: NaverMapLatLng[]) => void;
  setMap: (map: NaverMapLike | null) => void;
}

interface NaverMapEventApi {
  addListener: (target: object, eventName: string, handler: (...args: unknown[]) => void) => object;
  removeListener: (listener: object) => void;
}

interface NaverMapsApi {
  LatLng: new (lat: number, lng: number) => NaverMapLatLng;
  Point: new (x: number, y: number) => NaverMapPoint;
  Size: new (width: number, height: number) => { width: number; height: number };
  LatLngBounds: new () => NaverMapBounds;
  Map: new (container: HTMLElement, options: { center: NaverMapLatLng; zoom: number; mapTypeControl?: boolean; zoomControl?: boolean }) => NaverMapLike;
  Marker: new (options: {
    map?: NaverMapLike;
    position: NaverMapLatLng;
    draggable?: boolean;
    icon?: {
      content: HTMLElement | string;
      size?: { width: number; height: number };
      anchor?: NaverMapPoint;
    };
  }) => NaverMapMarkerLike;
  Polyline: new (options: {
    map?: NaverMapLike;
    path: NaverMapLatLng[];
    strokeColor: string;
    strokeWeight: number;
    strokeOpacity?: number;
    strokeLineCap?: 'round' | 'butt' | 'square';
    strokeLineJoin?: 'round' | 'bevel' | 'miter';
    clickable?: boolean;
  }) => NaverMapPolylineLike;
  Event: NaverMapEventApi;
}

type NaverMapsWindow = Window & {
  naver?: {
    maps?: NaverMapsApi;
  };
};

let naverMapsLoaderPromise: Promise<NaverMapsApi> | null = null;

const getNaverMapsFromWindow = (): NaverMapsApi | null => {
  if (typeof window === 'undefined') return null;
  const naverWindow = window as NaverMapsWindow;
  return naverWindow.naver?.maps ?? null;
};

export const loadNaverMapsSdk = (): Promise<NaverMapsApi> => {
  const existing = getNaverMapsFromWindow();
  if (existing) {
    return Promise.resolve(existing);
  }

  if (naverMapsLoaderPromise) {
    return naverMapsLoaderPromise;
  }

  naverMapsLoaderPromise = new Promise<NaverMapsApi>((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('네이버 지도 SDK는 브라우저에서만 로드할 수 있습니다'));
      return;
    }

    const existingScript = document.getElementById('naver-maps-sdk') as HTMLScriptElement | null;
    if (existingScript) {
      existingScript.addEventListener('load', () => {
        const sdk = getNaverMapsFromWindow();
        if (sdk) {
          resolve(sdk);
        } else {
          reject(new Error('네이버 지도 SDK 로드에 실패했습니다'));
        }
      });
      existingScript.addEventListener('error', () => {
        reject(new Error('네이버 지도 SDK 스크립트를 불러오지 못했습니다'));
      });
      return;
    }

    const script = document.createElement('script');
    const naverClientId = process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID;
    if (!naverClientId) {
      reject(new Error('NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID 환경 변수가 필요합니다'));
      return;
    }

    script.id = 'naver-maps-sdk';
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${naverClientId}`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const sdk = getNaverMapsFromWindow();
      if (sdk) {
        resolve(sdk);
      } else {
        reject(new Error('네이버 지도 SDK 초기화에 실패했습니다'));
      }
    };
    script.onerror = () => {
      reject(new Error('네이버 지도 SDK 스크립트를 불러오지 못했습니다'));
    };
    document.head.appendChild(script);
  });

  return naverMapsLoaderPromise;
};

export type {
  NaverMapLike,
  NaverMapMarkerLike,
  NaverMapPolylineLike,
  NaverMapBounds,
  NaverMapLatLng,
  NaverMapsApi,
};
