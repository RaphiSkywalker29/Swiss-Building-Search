import { GeoAdminLocation, GwrBuildingFeature, BuildingData } from '../types';

const SEARCH_API = 'https://api3.geo.admin.ch/rest/services/api/SearchServer';
const IDENTIFY_API = 'https://api3.geo.admin.ch/rest/services/api/MapServer/identify';

// Mapping for GWR Category Codes (GKAT) to German description
const GWR_CATEGORY_MAPPING: Record<number, string> = {
  1010: 'Provisorische Unterkunft',
  1020: 'Gebäude mit ausschliesslicher Wohnnutzung',
  1030: 'Wohngebäude mit Nebennutzung',
  1040: 'Gebäude mit teilweiser Wohnnutzung',
  1060: 'Gebäude ohne Wohnnutzung',
  1080: 'Sonderbau'
};

export const CANTON_NAMES: Record<string, string> = {
  'ZH': 'Zürich',
  'BE': 'Bern',
  'LU': 'Luzern',
  'UR': 'Uri',
  'SZ': 'Schwyz',
  'OW': 'Obwalden',
  'NW': 'Nidwalden',
  'GL': 'Glarus',
  'ZG': 'Zug',
  'FR': 'Freiburg',
  'SO': 'Solothurn',
  'BS': 'Basel-Stadt',
  'BL': 'Basel-Landschaft',
  'SH': 'Schaffhausen',
  'AR': 'Appenzell Ausserrhoden',
  'AI': 'Appenzell Innerrhoden',
  'SG': 'St. Gallen',
  'GR': 'Graubünden',
  'AG': 'Aargau',
  'TG': 'Thurgau',
  'TI': 'Tessin',
  'VD': 'Waadt',
  'VS': 'Wallis',
  'NE': 'Neuenburg',
  'GE': 'Genf',
  'JU': 'Jura'
};

const resolveCategory = (attrs: GwrBuildingFeature['attributes']): string => {
    // 1. Try explicit text field
    if (attrs.gkat_de) return attrs.gkat_de;
    
    // 2. Try mapping the code
    if (attrs.gkat && GWR_CATEGORY_MAPPING[attrs.gkat]) {
        return GWR_CATEGORY_MAPPING[attrs.gkat];
    }

    return 'Unbekannt';
};

/**
 * Searches for addresses using the Swiss GeoAdmin API.
 * Supports filtering by origins (e.g., 'address', 'street', 'zipcode', 'gg25')
 */
export const searchAddresses = async (query: string, origins: string = 'address'): Promise<GeoAdminLocation[]> => {
  if (!query || query.length < 1) return [];

  const params = new URLSearchParams({
    type: 'locations',
    searchText: query,
    origins: origins, 
    limit: '10',
    sr: '4326' // Request WGS84 coordinates
  });

  try {
    const response = await fetch(`${SEARCH_API}?${params.toString()}`);
    if (!response.ok) throw new Error('Search failed');
    const data = await response.json();
    return data.results || [];
  } catch (error) {
    console.error('GeoAdmin search error:', error);
    return [];
  }
};

/**
 * Identifies the Canton at a specific coordinate using Swiss Boundaries layer.
 */
export const getCantonAtLocation = async (lat: number, lon: number): Promise<string | null> => {
    const params = new URLSearchParams({
        geometryType: 'esriGeometryPoint',
        geometry: `${lon},${lat}`,
        imageDisplay: '500,500,96',
        mapExtent: `${lon-0.01},${lat-0.01},${lon+0.01},${lat+0.01}`, 
        tolerance: '10', 
        layers: 'all:ch.swisstopo.swissboundaries3d-kanton-flaeche.fill',
        sr: '4326', 
        returnGeometry: 'false'
      });
    
      try {
        const response = await fetch(`${IDENTIFY_API}?${params.toString()}`);
        if (!response.ok) throw new Error('Identify Canton failed');
        const data = await response.json();
        const feature = data.results?.[0];
        if (feature && feature.attributes) {
            // Usually attributes contain 'ak' or 'kanton' or 'name'
            // For this specific layer: 'ak' is abbreviation, 'name' is name
            return feature.attributes.ak || null; 
        }
        return null;
      } catch (e) {
          return null;
      }
};

/**
 * Identifies buildings (GWR layer) at a specific coordinate.
 */
export const getBuildingsAtLocation = async (lat: number, lon: number): Promise<BuildingData[]> => {
  // Identify requires a bounding box mapExtent. We create a small buffer around the point.
  // 0.005 degrees is roughly 300-500 meters, sufficient context for the API to render the layer internally.
  const delta = 0.005;
  const minX = lon - delta;
  const minY = lat - delta;
  const maxX = lon + delta;
  const maxY = lat + delta;
  
  const params = new URLSearchParams({
    geometryType: 'esriGeometryPoint',
    geometry: `${lon},${lat}`,
    imageDisplay: '500,500,96',
    mapExtent: `${minX},${minY},${maxX},${maxY}`, 
    tolerance: '50', 
    layers: 'all:ch.bfs.gebaeude_wohnungs_register',
    sr: '4326', // Request WGS84
    returnGeometry: 'true'
  });

  try {
    const response = await fetch(`${IDENTIFY_API}?${params.toString()}`);
    if (!response.ok) throw new Error('Identify failed');
    const data = await response.json();
    
    const results: GwrBuildingFeature[] = data.results || [];

    // Transform raw GWR features into our app's BuildingData format
    const buildings: BuildingData[] = results.map((feat) => {
      const attrs = feat.attributes;
      
      // Construct the full house number (e.g., "34a")
      const number = attrs.deinr || `${attrs.dnum || ''}${attrs.dnummer || ''}`;

      // Construct Address safely
      let addressStr = '';
      const zipVal = attrs.dplz4 || attrs.plz4;
      const cityVal = attrs.dplzname || attrs.gdename;

      if (attrs.strname_deinr) {
          addressStr = `${attrs.strname_deinr} ${zipVal || ''} ${cityVal || ''}`;
      } else {
          // Fallback construction
          const street = attrs.strname || '';
          const num = number || '';
          addressStr = `${street} ${num} ${zipVal || ''} ${cityVal || ''}`;
      }
      
      // Robustly handle street name (ensure string before trim)
      const streetName = String(attrs.strname || '').trim();

      return {
        id: feat.featureId || Math.random().toString(36),
        address: addressStr.trim(),
        street: streetName,
        number: number,
        zip: zipVal ? String(zipVal) : undefined,
        city: cityVal ? String(cityVal) : undefined,
        area: attrs.garea || 0,
        year: attrs.gbauj || 0,
        category: resolveCategory(attrs),
        canton: attrs.gdekt || attrs.gkantonskuerzel || '',
        selected: false,
        lat: parseFloat(String(feat.geometry.y)), // Ensure number
        lng: parseFloat(String(feat.geometry.x)), // Ensure number
        egid: attrs.egid
      };
    });

    // Remove duplicates based on EGID + Number to be safe
    const uniqueBuildings = Array.from(new Map(buildings.map(item => [item.id, item])).values());

    return uniqueBuildings;

  } catch (error) {
    console.error('GWR Identify error:', error);
    return [];
  }
};