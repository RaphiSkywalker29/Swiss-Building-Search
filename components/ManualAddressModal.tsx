import React, { useState, useRef, useEffect } from 'react';
import { X, Loader2, CheckCircle2 } from 'lucide-react';
import { searchAddresses, CANTON_NAMES, getCantonAtLocation, getBuildingsAtLocation } from '../services/geoAdminService';
import { GeoAdminLocation } from '../types';

interface ManualAddressModalProps {
  onClose: () => void;
  onSubmit: (data: {
    street: string;
    number: string;
    zip: string;
    city: string;
    canton: string;
    lat: number;
    lng: number;
  }) => void;
  initialData?: {
      street: string;
      number: string;
      zip: string;
      city: string;
      canton: string;
      lat: number;
      lng: number;
  };
}

export const ManualAddressModal: React.FC<ManualAddressModalProps> = ({ onClose, onSubmit, initialData }) => {
  const [street, setStreet] = useState(initialData?.street || '');
  const [number, setNumber] = useState(initialData?.number || '');
  const [zipCity, setZipCity] = useState(initialData ? `${initialData.zip} ${initialData.city}` : '');
  const [canton, setCanton] = useState(initialData ? (CANTON_NAMES[initialData.canton] || initialData.canton) : ''); // Display Name
  const [cantonCode, setCantonCode] = useState(initialData?.canton || ''); // Abbreviation
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(initialData ? { lat: initialData.lat, lng: initialData.lng } : null);
  
  // Autosuggestion States
  const [streetSuggestions, setStreetSuggestions] = useState<GeoAdminLocation[]>([]);
  const [zipCitySuggestions, setZipCitySuggestions] = useState<GeoAdminLocation[]>([]);
  const [activeSuggestionField, setActiveSuggestionField] = useState<'street' | 'zipCity' | null>(null);
  
  const [isValidating, setIsValidating] = useState(false);
  const [validated, setValidated] = useState(!!initialData);

  // Debounce for Street
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (activeSuggestionField === 'street' && street.length > 1) {
        // 'address' origin returns both streets and specific addresses.
        const results = await searchAddresses(street, 'address');
        
        const uniqueResults: GeoAdminLocation[] = [];
        const seenLabels = new Set<string>();

        results.forEach(r => {
            let label = r.attrs.label.replace(/<[^>]*>?/gm, '');
            
            // Logic: The user wants "Street Zip City" only, no house numbers.
            // If the result has a number (r.attrs.num), we strip it from the label.
            if (r.attrs.num) {
                 // Try to split into "Street part" and "Zip City part"
                 // Regex: Match generic start, followed by 4 digits and space (Zip)
                 const match = label.match(/^(.*?)(\d{4}\s.*)$/);
                 if (match) {
                     const prefix = match[1].trim(); // e.g. "Musterstrasse 12a"
                     const suffix = match[2]; // e.g. "8000 Zürich"
                     
                     // Remove trailing number from the prefix
                     // e.g. "Musterstrasse 12a" -> "Musterstrasse"
                     const cleanPrefix = prefix.replace(/\s\d+[a-zA-Z0-9\-\.]*$/, '');
                     label = `${cleanPrefix} ${suffix}`;
                 }
            }

            if (!seenLabels.has(label)) {
                seenLabels.add(label);
                // Create a copy with the clean label for display
                uniqueResults.push({
                    ...r,
                    attrs: {
                        ...r.attrs,
                        label: label 
                    }
                });
            }
        });

        setStreetSuggestions(uniqueResults);
      } else {
        setStreetSuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [street, activeSuggestionField]);

  // Debounce for Zip/City
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (activeSuggestionField === 'zipCity' && zipCity.length > 1) {
        const results = await searchAddresses(zipCity, 'zipcode,gg25');
        setZipCitySuggestions(results);
      } else {
        setZipCitySuggestions([]);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [zipCity, activeSuggestionField]);

  const handleStreetSelect = async (loc: GeoAdminLocation) => {
    // The label is already sanitized by our search effect above
    const label = loc.attrs.label.replace(/<[^>]*>?/gm, '');
    
    // Regex to split Street and Zip/City
    const match = label.match(/^(.*?)(\d{4}\s.*)$/);
    
    if (match) {
        setStreet(match[1].trim());
        setZipCity(match[2].trim());
    } else {
        setStreet(label);
    }
    
    setStreetSuggestions([]);
    setValidated(false); 
    
    // Automatically fetch Canton
    // Ensure we look for lat/lon (WGS84) first, then y/x
    const lat = loc.attrs.lat || loc.attrs.y;
    const lng = loc.attrs.lon || loc.attrs.x;
    
    // Store coords implicitly if we trust this street location
    if (lat && lng) {
        setCoords({ lat, lng }); // Provisional coords from street center
        
        try {
            const cantonAbbr = await getCantonAtLocation(lat, lng);
            if (cantonAbbr) {
                const fullName = CANTON_NAMES[cantonAbbr] || cantonAbbr;
                setCanton(fullName);
                setCantonCode(cantonAbbr);
            }
        } catch (e) {
            console.error("Auto-fetch canton failed", e);
        }
    }
  };

  const handleVerify = async () => {
    if (!street || !number || !zipCity) return;
    setIsValidating(true);
    
    const query = `${street} ${number} ${zipCity}`;
    
    try {
        // 1. Try to find the exact address location
        const results = await searchAddresses(query, 'address');
        
        let foundLat, foundLng;
        
        if (results.length > 0) {
            foundLat = results[0].attrs.lat || results[0].attrs.y;
            foundLng = results[0].attrs.lon || results[0].attrs.x;
        } else {
            // Fallback: Street + City
            const fallbackQuery = `${street} ${zipCity}`;
            const fallbackResults = await searchAddresses(fallbackQuery, 'address');
            if (fallbackResults.length > 0) {
                foundLat = fallbackResults[0].attrs.lat || fallbackResults[0].attrs.y;
                foundLng = fallbackResults[0].attrs.lon || fallbackResults[0].attrs.x;
            }
        }

        if (foundLat && foundLng) {
            setCoords({ lat: foundLat, lng: foundLng });
            
            // 2. Identify Canton (Refresh)
            // First check GWR buildings (best accuracy for exact address)
            const buildings = await getBuildingsAtLocation(foundLat, foundLng);
            let foundCanton = '';
            
            if (buildings.length > 0 && buildings[0].canton) {
                foundCanton = buildings[0].canton;
            } else {
                // Fallback to political boundaries layer
                const cantonAbbr = await getCantonAtLocation(foundLat, foundLng);
                if (cantonAbbr) foundCanton = cantonAbbr;
            }

            if (foundCanton) {
                const fullName = CANTON_NAMES[foundCanton] || foundCanton;
                setCanton(fullName);
                setCantonCode(foundCanton);
            } else if (!canton) {
                 setCanton('Unbekannt');
                 setCantonCode('XX');
            }
            
            setValidated(true);
        } else {
            alert('Adresse konnte nicht gefunden werden. Bitte überprüfen Sie die Eingaben.');
            setValidated(false);
        }

    } catch (e) {
        console.error(e);
        alert('Fehler bei der Adressprüfung.');
    } finally {
        setIsValidating(false);
    }
  };

  const handleSubmit = () => {
      if (validated && coords) {
          onSubmit({
              street,
              number,
              zip: zipCity.split(' ')[0], 
              city: zipCity.substring(zipCity.indexOf(' ') + 1) || zipCity,
              canton: cantonCode || canton, // Prefer code, fallback to name/input if missing
              lat: coords.lat,
              lng: coords.lng
          });
      }
  };

  return (
    <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black bg-opacity-50 p-4">
      <div className="bg-white w-full max-w-lg rounded-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
            <h2 className="text-xl font-semibold text-gray-800">Standortadresse erfassen</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X className="w-6 h-6" />
            </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto space-y-6">
            <p className="text-gray-600 text-sm bg-blue-50 text-blue-800 p-3 rounded-md">
                Bitte überprüfen Sie die Adresse, insbesondere in Grenzgebieten zwischen Kantonen.
            </p>

            {/* Strasse */}
            <div className="relative group">
                <label className="block text-sm font-semibold text-gray-700 mb-1">Strasse</label>
                <div className="relative">
                    <input 
                        type="text" 
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        value={street}
                        onChange={(e) => {
                            setStreet(e.target.value);
                            setValidated(false);
                        }}
                        onFocus={() => setActiveSuggestionField('street')}
                        onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                        placeholder="z.B. Bahnhofstrasse"
                    />
                    {street && (
                        <button onClick={() => setStreet('')} className="absolute right-3 top-3 text-gray-400 hover:text-gray-600">
                            <X className="w-4 h-4" />
                        </button>
                    )}
                    {activeSuggestionField === 'street' && streetSuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-200 mt-1 max-h-48 overflow-y-auto shadow-xl rounded-md divide-y divide-gray-50">
                            {streetSuggestions.map((s, idx) => (
                                <li 
                                    key={`${s.id}-${idx}`} 
                                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                                    onClick={() => handleStreetSelect(s)}
                                >
                                    {s.attrs.label}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Hausnummer */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Hausnummer</label>
                <input 
                    type="text" 
                    className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                    value={number}
                    onChange={(e) => {
                        setNumber(e.target.value);
                        setValidated(false);
                    }}
                    placeholder="z.B. 10a"
                />
            </div>

            {/* PLZ / Ort */}
            <div className="relative">
                <label className="block text-sm font-semibold text-gray-700 mb-1">PLZ / Ort</label>
                <div className="relative">
                    <input 
                        type="text" 
                        className="w-full border border-gray-300 rounded-lg p-2.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-shadow"
                        value={zipCity}
                        onChange={(e) => {
                            setZipCity(e.target.value);
                            setValidated(false);
                        }}
                        onFocus={() => setActiveSuggestionField('zipCity')}
                        onBlur={() => setTimeout(() => setActiveSuggestionField(null), 200)}
                        placeholder="z.B. 8000 Zürich"
                    />
                    {activeSuggestionField === 'zipCity' && zipCitySuggestions.length > 0 && (
                        <ul className="absolute z-10 w-full bg-white border border-gray-200 mt-1 max-h-48 overflow-y-auto shadow-xl rounded-md divide-y divide-gray-50">
                            {zipCitySuggestions.map(s => (
                                <li 
                                    key={s.id} 
                                    className="px-4 py-3 hover:bg-gray-50 cursor-pointer text-sm text-gray-700"
                                    onClick={() => {
                                        setZipCity(s.attrs.label.replace(/<[^>]*>?/gm, ''));
                                        setZipCitySuggestions([]);
                                        setValidated(false);
                                    }}
                                >
                                    {s.attrs.label.replace(/<[^>]*>?/gm, '')}
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>

            {/* Kanton / Region */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Kanton/Region</label>
                <input 
                    type="text" 
                    readOnly
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-gray-500 cursor-not-allowed"
                    value={canton}
                />
            </div>

            {/* Land */}
            <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Land</label>
                <input 
                    type="text" 
                    readOnly
                    className="w-full border border-gray-200 bg-gray-50 rounded-lg p-2.5 text-gray-500 cursor-not-allowed"
                    value="Schweiz (inkl. Liechtenstein)"
                />
            </div>

        </div>

        {/* Footer with UX Hierarchy */}
        <div className="px-6 py-5 border-t border-gray-100 bg-gray-50 flex justify-between items-center">
            {/* Tertiary / Ghost Button */}
            <button 
                onClick={onClose}
                className="text-gray-600 font-medium text-sm hover:text-gray-900 px-3 py-2 rounded transition-colors"
            >
                Abbrechen
            </button>

            <div className="flex items-center space-x-3">
                {/* Visual Feedback for Validated State */}
                {validated && (
                    <span className="text-emerald-600 text-sm font-medium flex items-center transition-all duration-300 opacity-100">
                        <CheckCircle2 className="w-4 h-4 mr-1.5" />
                        Geprüft
                    </span>
                )}
                
                {/* Secondary / Outline Button */}
                <button 
                    onClick={handleVerify}
                    disabled={isValidating}
                    className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-medium text-sm rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                >
                    {isValidating ? (
                        <div className="flex items-center">
                            <Loader2 className="w-3.5 h-3.5 animate-spin mr-2"/>
                            Prüfe...
                        </div>
                    ) : (
                        "Adresse prüfen"
                    )}
                </button>

                {/* Primary / Filled Button */}
                <button 
                    onClick={handleSubmit}
                    disabled={!validated}
                    className={`px-4 py-2 font-medium text-sm rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-all ${
                        validated 
                        ? 'bg-blue-600 text-white hover:bg-blue-700' 
                        : 'bg-gray-200 text-gray-400 cursor-not-allowed'
                    }`}
                >
                    Übernehmen
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};