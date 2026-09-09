import { useState, useEffect, useCallback, useMemo } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/lib/supabase';
import { toast } from 'sonner';

export interface ClinicLocation {
  id: string;
  name: string;              // Ej: "Consultorio Principal (Condesa)"
  address: string;           // Ej: "Av. Ámsterdam 142, Int. 204, Col. Hipódromo Condesa"
  instructions?: string;     // Ej: "Piso 2, tocar interfón 204. Estacionamiento a la vuelta."
  googleMapsUrl?: string;    // Ej: "https://maps.google.com/?q=..."
  isDefault?: boolean;       // Consultorio predeterminado al crear citas
}

const DEFAULT_PRESET_LOCATIONS: ClinicLocation[] = [
  {
    id: 'loc_default_1',
    name: 'Consultorio Principal',
    address: 'Consultorio Privado',
    instructions: 'Recepción principal, registrarse al llegar.',
    isDefault: true,
  },
];

export function useClinicLocations() {
  const { organization, refresh } = useOrganization();
  const orgId = organization?.id || 'default';
  const storageKey = `mindful_locations_${orgId}`;

  // Cargar de localStorage inicialmente para respuesta instantánea
  const [locations, setLocations] = useState<ClinicLocation[]>(() => {
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('[useClinicLocations] Error leyendo cache local:', e);
    }
    return DEFAULT_PRESET_LOCATIONS;
  });

  const [isLoading, setIsLoading] = useState(false);

  // Sincronizar con organization.settings.locations
  useEffect(() => {
    if (organization?.settings?.locations && Array.isArray(organization.settings.locations)) {
      const orgLocations = organization.settings.locations as ClinicLocation[];
      if (orgLocations.length > 0) {
        setLocations(orgLocations);
        localStorage.setItem(storageKey, JSON.stringify(orgLocations));
        return;
      }
    }
  }, [organization?.settings, storageKey]);

  // Persistir en base de datos y cache local
  const persistLocations = useCallback(async (newLocations: ClinicLocation[]) => {
    setLocations(newLocations);
    try {
      localStorage.setItem(storageKey, JSON.stringify(newLocations));
    } catch (e) {
      console.warn('Error guardando en localStorage:', e);
    }

    if (organization?.id) {
      try {
        setIsLoading(true);
        const currentSettings = (organization.settings as Record<string, unknown>) || {};
        const updatedSettings = {
          ...currentSettings,
          locations: newLocations,
        };

        const { error } = await supabase
          .from('organizations')
          .update({ settings: updatedSettings })
          .eq('id', organization.id);

        if (error) throw error;
        await refresh();
      } catch (err: any) {
        console.error('[useClinicLocations] Error al sincronizar con Supabase:', err);
      } finally {
        setIsLoading(false);
      }
    }
  }, [organization?.id, organization?.settings, refresh, storageKey]);

  // Guardar o actualizar ubicación
  const saveLocation = useCallback(async (locationData: Omit<ClinicLocation, 'id'> & { id?: string }) => {
    const id = locationData.id || `loc_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;
    
    // Si se marca como default, desmarcar las demás
    const isFirst = locations.length === 0;
    const shouldBeDefault = locationData.isDefault || isFirst;

    let updatedList: ClinicLocation[];
    const existingIndex = locations.findIndex(l => l.id === id);

    const newLocation: ClinicLocation = {
      ...locationData,
      id,
      isDefault: shouldBeDefault,
    };

    if (existingIndex >= 0) {
      updatedList = locations.map(l => {
        if (l.id === id) return newLocation;
        if (shouldBeDefault) return { ...l, isDefault: false };
        return l;
      });
    } else {
      updatedList = [
        ...locations.map(l => shouldBeDefault ? { ...l, isDefault: false } : l),
        newLocation,
      ];
    }

    await persistLocations(updatedList);
    toast.success('Consultorio guardado en tu catálogo');
    return newLocation;
  }, [locations, persistLocations]);

  // Eliminar ubicación
  const deleteLocation = useCallback(async (id: string) => {
    const filtered = locations.filter(l => l.id !== id);
    // Si se eliminó la default y quedan otras, marcar la primera como default
    if (filtered.length > 0 && !filtered.some(l => l.isDefault)) {
      filtered[0].isDefault = true;
    }
    await persistLocations(filtered);
    toast.success('Consultorio eliminado');
  }, [locations, persistLocations]);

  // Establecer como predeterminado
  const setDefaultLocation = useCallback(async (id: string) => {
    const updated = locations.map(l => ({
      ...l,
      isDefault: l.id === id,
    }));
    await persistLocations(updated);
    toast.success('Consultorio predeterminado actualizado');
  }, [locations, persistLocations]);

  // Ubicación predeterminada activa
  const defaultLocation = useMemo(() => {
    return locations.find(l => l.isDefault) || locations[0];
  }, [locations]);

  return {
    locations,
    defaultLocation,
    isLoading,
    saveLocation,
    deleteLocation,
    setDefaultLocation,
  };
}

export default useClinicLocations;
