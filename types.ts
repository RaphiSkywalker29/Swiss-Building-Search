export interface GeoAdminLocation {
  id: number;
  weight: number;
  attrs: {
    origin: string;
    geom_quadindex: string;
    zoomlevel: number;
    featureId: string;
    lon: number;
    lat: number;
    num: number;
    y: number;
    x: number;
    label: string; // The full formatted address e.g. "Tüfistrasse 34a 8311 Brütten"
    detail: string; // e.g. "tüfistrasse 34a 8311 brütten 2959"
    rank: number;
  };
}

export interface GwrBuildingFeature {
  id: string; // EGID or EGID_EDID
  layerBodId: string;
  layerName: string;
  featureId: string;
  attributes: {
    egid: string;
    
    // Address fields
    strname_deinr?: string; // Combined Street + Number
    strname?: string; // Street Name
    deinr?: string; // Full entrance number (e.g. 34a)
    dnum?: string; // House number (e.g., 34)
    dnummer?: string; // House suffix (e.g., a)
    
    // Location fields
    plz4?: number;
    dplz4?: number;
    gdename?: string;
    dplzname?: string;
    gkantonskuerzel?: string; // Potential attribute
    gdekt?: string; // Standard GWR attribute for Canton (e.g. "ZH")
    
    // Building Data
    garea?: number; // Area in m2
    gbauj?: number; // Year built
    
    // Category
    gkat_de?: string; // Category description (German)
    gkat?: number; // Category code (e.g. 1020)
    
    label?: string; // formatted label
  };
  geometry: {
    x: number;
    y: number;
    spatialReference: {
      wkid: number;
    }
  }
}

export interface BuildingData {
  id: string; // internal unique ID for the list
  address: string;
  street: string; // Street name for context comparison
  number: string; // "34", "34a", "34.1"
  zip?: string;
  city?: string;
  area: number;
  year: number;
  category: string;
  canton: string; // Canton abbreviation
  selected: boolean;
  lat: number;
  lng: number;
  egid: string;
}

export enum ViewMode {
  LIST = 'LIST',
  MAP = 'MAP'
}