import React, { useEffect, useRef, useState } from 'react';
import { BuildingData, GeoAdminLocation } from '../types';
import { Search, X } from 'lucide-react';
import { searchAddresses } from '../services/geoAdminService';

declare global {
  interface Window {
    ol: any; // OpenLayers global
  }
}

interface MapViewProps {
  buildings: BuildingData[];
  onClose: () => void;
  onSearchSelect: (location: GeoAdminLocation) => void;
}

export const MapView: React.FC<MapViewProps> = ({ buildings, onClose, onSearchSelect }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<any>(null);
  const vectorSourceRef = useRef<any>(null);
  const overlayRef = useRef<any>(null);
  
  // Map Search State
  const [mapSearchTerm, setMapSearchTerm] = useState('');
  const [mapSuggestions, setMapSuggestions] = useState<GeoAdminLocation[]>([]);
  const [isMapSearchOpen, setIsMapSearchOpen] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || !window.ol) return;
    if (mapInstanceRef.current) return;

    const ol = window.ol;

    // 1. Base Layer: Swisstopo Satellite (Swissimage)
    const baseLayer = new ol.layer.Tile({
      source: new ol.source.XYZ({
        url: 'https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.swissimage/default/current/3857/{z}/{x}/{y}.jpeg',
        attributions: '&copy; <a href="https://www.swisstopo.admin.ch/">swisstopo</a>',
        maxZoom: 21
      })
    });

    // 2. Overlay Layer: GWR (Gebäude- und Wohnungsregister)
    const gwrLayer = new ol.layer.Tile({
      opacity: 0.8,
      source: new ol.source.TileWMS({
        url: 'https://wms.geo.admin.ch/',
        params: {
          'LAYERS': 'ch.bfs.gebaeude_wohnungs_register',
          'FORMAT': 'image/png',
          'TRANSPARENT': true,
          'VERSION': '1.3.0'
        },
        attributions: 'Bundesamt für Statistik'
      })
    });

    // 3. Vector Layer for Buildings
    vectorSourceRef.current = new ol.source.Vector();
    const vectorLayer = new ol.layer.Vector({
      source: vectorSourceRef.current,
      style: (feature: any) => {
        const isSelected = feature.get('selected');
        const number = feature.get('number');
        
        const dotColor = isSelected ? '#dc2626' : '#f97316';
        const dotSize = isSelected ? 10 : 7;
        const zIndex = isSelected ? 100 : 1;

        return new ol.style.Style({
          image: new ol.style.Circle({
            radius: dotSize,
            fill: new ol.style.Fill({ color: dotColor }),
            stroke: new ol.style.Stroke({ color: 'white', width: 2 })
          }),
          text: new ol.style.Text({
            text: number,
            offsetY: -15,
            font: isSelected ? 'bold 16px sans-serif' : 'bold 13px sans-serif',
            fill: new ol.style.Fill({ color: 'white' }),
            stroke: new ol.style.Stroke({ color: 'black', width: 3 }),
            textAlign: 'center'
          }),
          zIndex: zIndex
        });
      }
    });

    // 4. Popup Overlay
    const popupElement = document.createElement('div');
    popupElement.id = 'ol-popup-container';
    popupElement.className = 'ol-popup bg-white p-4 rounded-lg shadow-xl border border-gray-200 min-w-[200px]';
    popupElement.style.display = 'none';
    
    overlayRef.current = new ol.Overlay({
      element: popupElement,
      autoPan: true,
      autoPanAnimation: { duration: 250 },
      positioning: 'bottom-center',
      offset: [0, -15]
    });

    // Initialize Map
    const initialLat = buildings.length > 0 ? buildings[0].lat : 46.8182;
    const initialLng = buildings.length > 0 ? buildings[0].lng : 8.2275;
    const initialZoom = buildings.length > 0 ? 19 : 8;

    const map = new ol.Map({
      target: mapContainerRef.current,
      layers: [baseLayer, gwrLayer, vectorLayer],
      overlays: [overlayRef.current],
      view: new ol.View({
        center: ol.proj.fromLonLat([initialLng, initialLat]),
        zoom: initialZoom,
        maxZoom: 21
      }),
      controls: ol.control.defaults.defaults({
        attributionOptions: { collapsible: false }
      }).extend([
        new ol.control.Zoom({ className: 'custom-zoom' })
      ])
    });

    // Click Handler for Popups
    map.on('singleclick', (evt: any) => {
      const feature = map.forEachFeatureAtPixel(evt.pixel, (feat: any) => feat);
      if (feature) {
        const building = feature.get('building');
        const coordinates = feature.getGeometry().getCoordinates();
        
        const titleText = building.street ? `${building.street} ${building.number}` : `Gebäude ${building.number}`;
        const isSelected = building.selected;

        popupElement.innerHTML = `
          <div style="font-family: sans-serif;">
            <h3 style="margin: 0 0 8px 0; font-size: 16px; font-weight: bold; color: #1f2937;">${titleText}</h3>
            <p style="margin: 0 0 4px 0; font-size: 13px; color: #4b5563;">
                ${building.category || 'Keine Kategorie'}
            </p>
            <div style="font-size:12px; margin-bottom: 12px; color: #666;">
                Baujahr: ${building.year || '-'} | Fläche: ${building.area ? building.area + ' m²' : '-'}
            </div>
            <button 
                id="popup-select-btn"
                style="
                background-color: #dc2626; 
                color: white; 
                border: none; 
                padding: 8px 16px; 
                border-radius: 9999px; 
                font-size: 13px; 
                font-weight: 600; 
                cursor: pointer; 
                width: 100%;
                "
            >
                ${isSelected ? 'Ausgewählt' : 'Objekt auswählen'}
            </button>
          </div>
        `;
        
        popupElement.style.display = 'block';
        overlayRef.current.setPosition(coordinates);

        const btn = document.getElementById('popup-select-btn');
        if (btn) {
          btn.onclick = () => {
            document.dispatchEvent(new CustomEvent('selectBuilding', { detail: building.id }));
            btn.innerText = 'Ausgewählt';
          };
        }
      } else {
        popupElement.style.display = 'none';
        overlayRef.current.setPosition(undefined);
      }
    });

    // Pointer cursor on hover
    map.on('pointermove', (evt: any) => {
      const hit = map.hasFeatureAtPixel(evt.pixel);
      map.getTargetElement().style.cursor = hit ? 'pointer' : '';
    });

    mapInstanceRef.current = map;

    return () => {
        if (mapInstanceRef.current) {
            mapInstanceRef.current.setTarget(undefined);
            mapInstanceRef.current = null;
        }
    };
  }, []);

  // Update Markers when buildings change
  useEffect(() => {
    if (!mapInstanceRef.current || !vectorSourceRef.current || !window.ol) return;

    const ol = window.ol;
    const source = vectorSourceRef.current;
    source.clear();

    if (buildings.length === 0) return;

    const features: any[] = [];
    const groupedBuildings: Record<string, BuildingData[]> = {};
    
    buildings.forEach(b => {
        const key = `${b.lat.toFixed(6)},${b.lng.toFixed(6)}`;
        if (!groupedBuildings[key]) groupedBuildings[key] = [];
        groupedBuildings[key].push(b);
    });

    const extent = ol.extent.createEmpty();

    Object.values(groupedBuildings).forEach(group => {
        const count = group.length;

        group.forEach((b, index) => {
            if (!b.lat || !b.lng) return;

            let renderLat = b.lat;
            let renderLng = b.lng;

            if (count > 1) {
                const angle = (index / count) * 2 * Math.PI;
                const radius = 0.00015; 
                renderLat = b.lat + radius * Math.cos(angle);
                renderLng = b.lng + radius * Math.sin(angle) * 1.5;
            }

            const coords = ol.proj.fromLonLat([renderLng, renderLat]);
            const feature = new ol.Feature({
                geometry: new ol.geom.Point(coords),
                building: b,
                selected: b.selected,
                number: b.number
            });

            features.push(feature);
            ol.extent.extend(extent, feature.getGeometry().getExtent());
        });
    });

    source.addFeatures(features);

    // Fit view
    if (features.length > 0) {
        mapInstanceRef.current.getView().fit(extent, {
            padding: [100, 100, 100, 100],
            maxZoom: 19,
            duration: 1000
        });
    }

  }, [buildings]);

  // Map Search Logic
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      if (mapSearchTerm.length > 1) {
        try {
            const results = await searchAddresses(mapSearchTerm);
            setMapSuggestions(results);
            setIsMapSearchOpen(true);
        } catch (e) {
            setMapSuggestions([]);
        }
      } else {
        setMapSuggestions([]);
        setIsMapSearchOpen(false);
      }
    }, 300);
    return () => clearTimeout(delayDebounceFn);
  }, [mapSearchTerm]);

  const handleMapSearchSelect = (loc: GeoAdminLocation) => {
    const cleanLabel = loc.attrs.label.replace(/<[^>]*>?/gm, '');
    setMapSearchTerm(cleanLabel);
    setIsMapSearchOpen(false);
    onSearchSelect(loc);
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
        {/* Map Header with Search */}
        <div className="absolute top-4 left-4 z-[1000] flex flex-col w-full max-w-sm sm:max-w-md">
             <div className="relative bg-white rounded-lg shadow-xl border border-gray-200">
                <div className="flex items-center p-3">
                    <Search className="text-gray-400 w-5 h-5 ml-1 flex-shrink-0" />
                    <input 
                        type="text" 
                        className="w-full pl-3 pr-2 py-1 outline-none text-gray-700 bg-transparent placeholder-gray-400"
                        placeholder="Adresse auf Karte suchen..."
                        value={mapSearchTerm}
                        onChange={(e) => setMapSearchTerm(e.target.value)}
                        onFocus={() => {
                            if (mapSuggestions.length > 0) setIsMapSearchOpen(true);
                        }}
                    />
                    {mapSearchTerm && (
                        <button 
                            onClick={() => {
                                setMapSearchTerm('');
                                setIsMapSearchOpen(false);
                            }} 
                            className="p-1 hover:bg-gray-100 rounded-full"
                        >
                            <X className="w-5 h-5 text-gray-400" />
                        </button>
                    )}
                </div>
             </div>
             
             {/* Map Search Suggestions */}
             {isMapSearchOpen && mapSuggestions.length > 0 && (
                 <ul className="bg-white mt-2 rounded-lg shadow-xl max-h-60 overflow-y-auto border border-gray-200">
                     {mapSuggestions.map(loc => (
                          <li 
                            key={loc.id}
                            className="px-4 py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                            onClick={() => handleMapSearchSelect(loc)}
                          >
                            {loc.attrs.label.replace(/<[^>]*>?/gm, '')}
                          </li>
                     ))}
                 </ul>
             )}
        </div>

        {/* Close Button */}
        <button 
            onClick={onClose}
            className="absolute top-4 right-4 z-[1000] bg-white p-3 rounded-full shadow-xl hover:bg-gray-50 border border-gray-200 transition-transform hover:scale-105"
            title="Karte schliessen"
        >
            <X className="w-6 h-6 text-gray-700" />
        </button>

        {/* Map Container */}
        <div ref={mapContainerRef} className="w-full h-full bg-gray-100" />
        
        <style>{`
          .custom-zoom {
            position: absolute;
            bottom: 20px;
            right: 20px;
          }
          .custom-zoom button {
            background-color: white !important;
            color: #374151 !important;
            border: 1px solid #e5e7eb !important;
            width: 40px !important;
            height: 40px !important;
            font-size: 20px !important;
            border-radius: 8px !important;
            margin-bottom: 4px !important;
            box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1) !important;
          }
          .custom-zoom button:hover {
            background-color: #f9fafb !important;
          }
          .ol-popup {
            position: absolute;
            bottom: 12px;
            left: -50%;
            transform: translateX(-50%);
          }
          .ol-popup:after, .ol-popup:before {
            top: 100%;
            border: solid transparent;
            content: " ";
            height: 0;
            width: 0;
            position: absolute;
            pointer-events: none;
          }
          .ol-popup:after {
            border-top-color: white;
            border-width: 10px;
            left: 50%;
            margin-left: -10px;
          }
          .ol-popup:before {
            border-top-color: #e5e7eb;
            border-width: 11px;
            left: 50%;
            margin-left: -11px;
          }
        `}</style>
    </div>
  );
};
