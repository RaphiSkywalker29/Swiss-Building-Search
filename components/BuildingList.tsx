import React from 'react';
import { BuildingData } from '../types';
import { Check, Map as MapIcon, Layers, Pencil } from 'lucide-react';

interface BuildingListProps {
  buildings: BuildingData[];
  primaryStreet: string; // The street name of the main search results
  onToggleSelection: (id: string) => void;
  onOpenMap: () => void;
  onEditManual?: () => void; // New prop for editing
}

export const BuildingList: React.FC<BuildingListProps> = ({ buildings, primaryStreet, onToggleSelection, onOpenMap, onEditManual }) => {
  if (buildings.length === 0) return null;

  const selectedBuildings = buildings.filter(b => b.selected);
  const selectedCount = selectedBuildings.length;

  // Check if selected buildings span multiple different streets
  const uniqueSelectedStreets = new Set(selectedBuildings.map(b => b.street));
  const hasMixedStreets = uniqueSelectedStreets.size > 1;

  // Detect if this is a manual entry list
  const isManual = buildings.length > 0 && buildings[0].category === 'Manuell erfasst';

  return (
    <div className="w-full max-w-4xl mt-8 flex flex-col">
        {/* Results Card */}
        <div className="bg-white rounded-lg shadow-md overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <div>
                    <h2 className="text-lg font-semibold text-gray-800">
                        {isManual ? 'Manuell erfasster Standort' : 'Gefundene Gebäude'}
                    </h2>
                    {!isManual && (
                        <p className="text-sm text-gray-500">Bitte wählen Sie das gewünschte Objekt aus.</p>
                    )}
                </div>
                <div className="flex items-center">
                    {isManual && onEditManual && (
                        <button
                            onClick={onEditManual}
                            className="mr-3 inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                        >
                            <Pencil className="mr-2 h-4 w-4 text-gray-500" />
                            Standortadresse bearbeiten
                        </button>
                    )}
                    <button
                        onClick={onOpenMap}
                        className="inline-flex items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors"
                    >
                        <MapIcon className="mr-2 h-4 w-4 text-gray-500" />
                        Karte anzeigen
                    </button>
                </div>
            </div>
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-16">
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Hausnummer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Gebäudefläche (m²)
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Baujahr
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kategorie
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Kanton
                    </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                    {buildings.map((building) => {
                        // Show label if streets are mixed OR if this building differs from search
                        // For manual entries, we typically don't need this complex check as it's a single entry, but logic holds.
                        const showStreetLabel = building.selected && building.street && (hasMixedStreets || building.street !== primaryStreet);
                        
                        // Condition for risk message: Selected AND NOT Manual
                        const showRiskMessage = building.selected && building.category !== 'Manuell erfasst';

                        return (
                        <tr 
                            key={building.id} 
                            className={`hover:bg-gray-50 transition-colors ${building.selected ? 'bg-blue-50 hover:bg-blue-100' : ''}`}
                        >
                            <td className="px-6 py-4 whitespace-nowrap">
                            <button
                                onClick={() => onToggleSelection(building.id)}
                                className={`h-6 w-6 rounded border flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 ${
                                building.selected
                                    ? 'bg-blue-600 border-blue-600 text-white'
                                    : 'border-gray-300 bg-white text-transparent hover:border-gray-400'
                                }`}
                                aria-label={building.selected ? "Abwählen" : "Auswählen"}
                            >
                                <Check className="h-4 w-4" />
                            </button>
                            </td>
                            {/* Removed whitespace-nowrap to allow wrapping of long messages */}
                            <td className="px-6 py-4">
                                <div className="flex flex-col">
                                    <span className="text-sm font-medium text-gray-900 whitespace-nowrap">{building.number}</span>
                                    {showStreetLabel && (
                                        <span className="inline-block mt-1 text-xs text-gray-500 italic">
                                            {building.street}
                                        </span>
                                    )}
                                    {showRiskMessage && (
                                        <span className="inline-block mt-1 text-xs text-emerald-600 font-medium whitespace-normal">
                                            ✓ Risikoangaben übernommen
                                        </span>
                                    )}
                                </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {building.area || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {building.year || '-'}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {building.category}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 uppercase">
                            {building.canton}
                            </td>
                        </tr>
                        );
                    })}
                </tbody>
                </table>
            </div>
        </div>

        {/* Action Buttons Footer */}
        <div className="mt-4 flex justify-end">
            <button
                disabled={selectedCount <= 1}
                className={`inline-flex items-center px-4 py-2 border shadow-sm text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 transition-colors ${
                    selectedCount > 1
                    ? 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                    : 'border-gray-200 text-gray-400 bg-gray-50 cursor-not-allowed'
                }`}
            >
                <Layers className={`mr-2 h-4 w-4 ${selectedCount > 1 ? 'text-gray-500' : 'text-gray-300'}`} />
                Mehrere Standorte eröffnen
            </button>
        </div>
    </div>
  );
};