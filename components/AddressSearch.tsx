import React, { useState, useEffect, useRef } from 'react';
import { GeoAdminLocation } from '../types';
import { searchAddresses } from '../services/geoAdminService';
import { Search, X, PlusCircle } from 'lucide-react';

interface AddressSearchProps {
  onSelect: (location: GeoAdminLocation) => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  onOpenManualSearch: () => void;
  skipNextSearchRef?: React.MutableRefObject<boolean>;
}

export const AddressSearch: React.FC<AddressSearchProps> = ({ 
  onSelect, 
  searchTerm, 
  setSearchTerm, 
  onOpenManualSearch,
  skipNextSearchRef
}) => {
  const [suggestions, setSuggestions] = useState<GeoAdminLocation[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  
  // Use a ref to prevent search triggering immediately after selection from dropdown
  const shouldSkipSearch = useRef(false);

  // Debounce search
  useEffect(() => {
    const delayDebounceFn = setTimeout(async () => {
      // 1. Check external skip ref (from parent, e.g. after manual submit)
      if (skipNextSearchRef && skipNextSearchRef.current) {
        skipNextSearchRef.current = false;
        return;
      }

      // 2. Check internal skip ref (from dropdown selection)
      if (shouldSkipSearch.current) {
        shouldSkipSearch.current = false;
        return;
      }

      if (searchTerm.length > 1) {
        const results = await searchAddresses(searchTerm);
        setSuggestions(results);
        setIsOpen(true);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    }, 300);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, skipNextSearchRef]);

  // Click outside to close
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [wrapperRef]);

  const handleSelect = (loc: GeoAdminLocation) => {
    // Strip HTML tags from label
    const cleanLabel = loc.attrs.label.replace(/<[^>]*>?/gm, '');
    
    // Set flag to skip the next search effect
    shouldSkipSearch.current = true;
    
    setSearchTerm(cleanLabel);
    setSuggestions([]); // Clear suggestions visually
    setIsOpen(false);
    onSelect(loc);
  };

  const handleClear = () => {
    setSearchTerm('');
    setSuggestions([]);
    setIsOpen(false);
  };

  return (
    <div className="relative w-full max-w-2xl z-50" ref={wrapperRef}>
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
          <Search className="h-5 w-5 text-gray-400" />
        </div>
        <input
          type="text"
          className="block w-full pl-10 pr-10 py-3 border border-gray-300 rounded-lg leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 sm:text-lg shadow-sm transition-shadow"
          placeholder="z.B. Tüfistrasse 34a, 8311 Brütten"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onFocus={() => {
             // Only open if we have suggestions and it wasn't just a selection
             if(suggestions.length > 0 && !shouldSkipSearch.current) setIsOpen(true);
          }}
        />
        {searchTerm && (
           <button 
             onClick={handleClear}
             className="absolute inset-y-0 right-0 pr-3 flex items-center cursor-pointer text-gray-400 hover:text-gray-600"
           >
             <X className="h-5 w-5" />
           </button>
        )}
      </div>

      {/* Suggestion Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full bg-white shadow-lg max-h-60 rounded-md py-1 text-base ring-1 ring-black ring-opacity-5 overflow-auto focus:outline-none sm:text-sm">
          {suggestions.map((loc) => {
             const label = loc.attrs.label.replace(/<[^>]*>?/gm, '');
             return (
              <li
                key={loc.id}
                className="cursor-pointer select-none relative py-2 pl-3 pr-9 hover:bg-gray-100 text-gray-900 border-b border-gray-100 last:border-0"
                onClick={() => handleSelect(loc)}
              >
                <div className="flex flex-col">
                  <span className="font-medium text-lg text-gray-800">{label}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Manual Entry Link - UX Improved: Blue Link style instead of Error Red */}
      <div 
        className="mt-3 flex items-center text-sm font-medium cursor-pointer text-blue-600 hover:text-blue-700 hover:underline transition-colors"
        onClick={onOpenManualSearch}
      >
        <PlusCircle className="w-4 h-4 mr-1.5" />
        Adresse bzw. Objekt ist nicht dabei
      </div>
    </div>
  );
};