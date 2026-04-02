import React, { useState, useEffect, useRef } from 'react';
import { AddressSearch } from './components/AddressSearch';
import { BuildingList } from './components/BuildingList';
import { MapView } from './components/MapView';
import { ManualAddressModal } from './components/ManualAddressModal';
import { GeoAdminLocation, BuildingData, ViewMode } from './types';
import { getBuildingsAtLocation } from './services/geoAdminService';
import { Loader2 } from 'lucide-react';

const normalizeStreet = (s: string) => s.toLowerCase().trim();

const App: React.FC = () => {
  const [viewMode, setViewMode] = useState<ViewMode>(ViewMode.LIST);
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  
  // 'buildings' is the filtered list displayed in the Table
  const [buildings, setBuildings] = useState<BuildingData[]>([]);
  
  // 'allBuildings' is the complete list of buildings in the area, displayed on the Map
  const [allBuildings, setAllBuildings] = useState<BuildingData[]>([]);
  
  // The street name of the initial search context (used to highlight "foreign" buildings in the list)
  const [primaryStreet, setPrimaryStreet] = useState<string>('');

  // State to hold data for editing a manual entry
  const [manualEditData, setManualEditData] = useState<BuildingData | null>(null);

  // Ref to prevent search trigger when setting search term programmatically (e.g. from manual submit)
  const skipSearchTriggerRef = useRef(false);

  // Listen for custom event from Map Popup
  useEffect(() => {
    const handleMapSelection = (e: Event) => {
        const customEvent = e as CustomEvent;
        const id = customEvent.detail;
        toggleSelection(id);
    };
    
    document.addEventListener('selectBuilding', handleMapSelection);
    return () => document.removeEventListener('selectBuilding', handleMapSelection);
  }, []);

  // Handling Address Selection
  const handleAddressSelect = async (location: GeoAdminLocation) => {
    setLoading(true);
    setBuildings([]); 
    setAllBuildings([]); // Clear map
    setPrimaryStreet('');

    try {
      const lat = location.attrs.lat || location.attrs.y;
      const lon = location.attrs.lon || location.attrs.x;

      // 1. Fetch all buildings near this coordinate (via GWR Identify)
      let fetchedBuildings = await getBuildingsAtLocation(lat, lon);
      
      // Sort naturally: 34, 34a, 34b, 34.1
      fetchedBuildings.sort((a, b) => 
        a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' })
      );

      // 2. Parse User Input
      const selectedLabel = location.attrs.label.replace(/<[^>]*>?/gm, ''); // clean HTML
      
      // Extract the full number user searched for (e.g. "34a", "34.1")
      // Regex matches a number followed by letters/dots/digits, ensuring it's surrounded by space or end of string
      const match = selectedLabel.match(/\s([0-9]+[a-zA-Z0-9\.-]*)(\s|$)/); 
      const fullSearchNumber = match ? match[1] : '';
      
      // Extract Street Name from Label (everything before the matched number)
      let targetStreet = '';
      if (match && match.index) {
          targetStreet = selectedLabel.substring(0, match.index).trim();
      }

      // 3. Filter List Logic
      let listBuildings = fetchedBuildings;

      // A. Strict Street Filter
      // We explicitly extract the street from the label and filter everything else out.
      if (targetStreet) {
          const normalizedTarget = normalizeStreet(targetStreet);
          
          const streetFiltered = listBuildings.filter(b => {
              // Normalize building street
              const bStreet = normalizeStreet(b.street);
              return bStreet === normalizedTarget;
          });

          // Only apply filter if we found matches. If data quality is bad and nothing matches, show all (fallback).
          if (streetFiltered.length > 0) {
              listBuildings = streetFiltered;
          }
      }

      // B. Hierarchical Number Filter
      // Rules:
      // - Input "1" -> Parent "1". Match "1", "1.1", "1.2". Exclude "1a", "1b".
      // - Input "1a" -> Parent "1a". Match "1a", "1a.1". Exclude "1", "1b".
      // - Input "1a.1" -> Parent "1a". Match "1a", "1a.1".
      if (fullSearchNumber) {
          let parentNumber = fullSearchNumber;

          // If input is a child (has a dot like 1a.1), look up the parent (1a)
          if (fullSearchNumber.includes('.')) {
              const lastDotIndex = fullSearchNumber.lastIndexOf('.');
              parentNumber = fullSearchNumber.substring(0, lastDotIndex);
          }

          const numberFiltered = listBuildings.filter(b => {
             const n = b.number.toLowerCase();
             const p = parentNumber.toLowerCase();

             // 1. Exact match to parent (e.g. "1" === "1", or "1a" === "1a")
             if (n === p) return true;

             // 2. Is a direct child extension (must start with "parent.")
             // e.g. "1.1" starts with "1.", "1a.1" starts with "1a."
             if (n.startsWith(p + '.')) return true;

             return false;
          });
          
          if (numberFiltered.length > 0) {
              listBuildings = numberFiltered;
          }
      }

      // Fallback: If filtering resulted in empty list (e.g. GWR doesn't have the specific number yet), 
      // check if we can at least find the exact number search in the original set
      if (listBuildings.length === 0 && fullSearchNumber) {
          listBuildings = fetchedBuildings.filter(b => b.number === fullSearchNumber);
      }
      
      // Double fallback: if still empty, show all fetched buildings (better than nothing)
      if (listBuildings.length === 0 && fetchedBuildings.length > 0) {
          listBuildings = fetchedBuildings;
      }

      // 4. Selection Logic
      // Reset selection first
      fetchedBuildings.forEach(b => b.selected = false);

      // If specific number was searched (e.g. "34a"), pre-select it
      if (fullSearchNumber) {
           let target = undefined;

           // Priority 1: Match Number in the FILTERED list.
           // This is critical: we must pick a building that survived the street filter.
           target = listBuildings.find(b => b.number.toLowerCase() === fullSearchNumber.toLowerCase());

           // Priority 2: Match Number AND Street in full list (Fallback)
           if (!target && targetStreet) {
               const normTargetStreet = normalizeStreet(targetStreet);
               target = fetchedBuildings.find(b => 
                   b.number.toLowerCase() === fullSearchNumber.toLowerCase() &&
                   normalizeStreet(b.street) === normTargetStreet
               );
           }

           // Priority 3: Match Number only (Last Resort)
           if (!target) {
               target = fetchedBuildings.find(b => b.number.toLowerCase() === fullSearchNumber.toLowerCase());
           }

           if (target) {
               target.selected = true; 
           }
      }

      // Update States
      setAllBuildings([...fetchedBuildings]); // Map gets full neighborhood context
      setBuildings(listBuildings); // List gets strictly filtered hierarchical group
      
      // Set primary street for UI comparison (using the first building found)
      if (listBuildings.length > 0) {
          setPrimaryStreet(listBuildings[0].street);
      } else if (targetStreet) {
          setPrimaryStreet(targetStreet);
      }

    } catch (error) {
      console.error(error);
      setBuildings([]);
      setAllBuildings([]);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelection = (id: string) => {
    // 1. Update Map Data (allBuildings) to reflect selection state globally
    let targetBuilding: BuildingData | undefined;
    
    setAllBuildings(prev => prev.map(b => {
      if (b.id === id) {
        // Create a copy with toggled selection
        targetBuilding = { ...b, selected: !b.selected };
        return targetBuilding;
      }
      return b;
    }));

    // 2. Update List Data (buildings)
    setBuildings(prev => {
        // Check if the building is already in the list
        const exists = prev.some(b => b.id === id);
        
        let newBuildings = [...prev];

        if (exists) {
            // If it exists, just update its selection status
            newBuildings = newBuildings.map(b => b.id === id ? { ...b, selected: !b.selected } : b);
        } else if (targetBuilding && targetBuilding.selected) {
            // If it doesn't exist and we just selected it (via map), ADD it to the list
            newBuildings.push(targetBuilding);
            
            // Re-sort the list so the new item appears in logical order (by number)
            newBuildings.sort((a, b) => 
                a.number.localeCompare(b.number, undefined, { numeric: true, sensitivity: 'base' })
            );
        }
        
        return newBuildings;
    });
  };

  const handleManualSubmit = async (data: { street: string; number: string; zip: string; city: string; canton: string; lat: number; lng: number }) => {
     // Create a new BuildingData object manually
     const newBuilding: BuildingData = {
         id: 'manual-' + Math.random().toString(36),
         address: `${data.street} ${data.number} ${data.zip} ${data.city}`,
         street: data.street,
         number: data.number,
         zip: data.zip,
         city: data.city,
         area: 0,
         year: 0,
         category: 'Manuell erfasst',
         canton: data.canton, 
         selected: true,
         lat: data.lat,
         lng: data.lng,
         egid: 'MANUAL'
     };

     // Set list view to ONLY the manual building
     setBuildings([newBuilding]);
     setPrimaryStreet(data.street);
     
     // Set skip flag to prevent auto-suggestions from reopening
     skipSearchTriggerRef.current = true;
     setSearchTerm(`${data.street} ${data.number} ${data.zip} ${data.city}`);
     
     setIsManualModalOpen(false);
     setManualEditData(null); // Clear edit data

     // Fetch context for the map (neighbors), but do NOT select them
     // This ensures the map shows the street context without highlighting any official point
     try {
         const neighbors = await getBuildingsAtLocation(data.lat, data.lng);
         // Neighbors come with selected: false by default
         setAllBuildings(neighbors);
     } catch (e) {
         console.error("Failed to fetch map context for manual entry", e);
         // If fetch fails, we simply have an empty map context. 
         // We do not add the manual building to allBuildings to avoid showing a red dot.
         setAllBuildings([]);
     }
  };

  const handleEditManual = () => {
      if (buildings.length > 0 && buildings[0].category === 'Manuell erfasst') {
          // Prepare the data needed for the form
          const current = buildings[0];
          setManualEditData(current);
          setIsManualModalOpen(true);
      }
  };

  return (
    <div className="min-h-screen flex flex-col items-center pt-20 px-4 pb-10 bg-gray-100">
      
      {/* Header / Title */}
      <h1 className="text-3xl font-bold text-gray-800 mb-8">Standortadresse</h1>

      {/* Search Component */}
      <AddressSearch 
        searchTerm={searchTerm}
        setSearchTerm={setSearchTerm}
        onSelect={handleAddressSelect}
        onOpenManualSearch={() => {
            setManualEditData(null);
            setIsManualModalOpen(true);
        }}
        skipNextSearchRef={skipSearchTriggerRef}
      />

      {/* Loading State */}
      {loading && (
        <div className="mt-8 flex items-center text-blue-600">
          <Loader2 className="animate-spin h-6 w-6 mr-2" />
          <span>Lade Gebäudedaten...</span>
        </div>
      )}

      {/* Results Table */}
      {!loading && buildings.length > 0 && (
        <BuildingList 
          buildings={buildings}
          primaryStreet={primaryStreet}
          onToggleSelection={toggleSelection}
          onOpenMap={() => setViewMode(ViewMode.MAP)}
          onEditManual={handleEditManual}
        />
      )}
      
      {!loading && buildings.length === 0 && searchTerm.length > 5 && !loading && (
           <div className="mt-4 text-gray-500">
              Keine Gebäude gefunden.
           </div>
      )}

      {/* Full Screen Map Overlay */}
      {viewMode === ViewMode.MAP && (
        <MapView 
            buildings={allBuildings} // Pass ALL buildings (neighbors) to map
            onClose={() => setViewMode(ViewMode.LIST)}
            onSearchSelect={handleAddressSelect}
        />
      )}

      {/* Manual Address Modal */}
      {isManualModalOpen && (
          <ManualAddressModal 
             onClose={() => setIsManualModalOpen(false)}
             onSubmit={handleManualSubmit}
             initialData={manualEditData ? {
                 street: manualEditData.street,
                 number: manualEditData.number,
                 zip: manualEditData.zip || '',
                 city: manualEditData.city || '',
                 canton: manualEditData.canton,
                 lat: manualEditData.lat,
                 lng: manualEditData.lng
             } : undefined}
          />
      )}

    </div>
  );
};

export default App;