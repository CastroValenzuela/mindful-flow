import { useState, useEffect, useRef, useCallback } from 'react';

export interface DraftMetadata<T> {
  data: T;
  savedAt: number;
}

interface UseNoteDraftOptions<T> {
  draftKey: string;
  data: T;
  isDirty: boolean;
  debounceMs?: number;
  onRestore?: (restoredData: T) => void;
}

/**
 * Hook HIPAA / EHR-compliant para persistencia y resiliencia local de notas clínicas.
 * - Guarda cambios con debounce en localStorage para evitar pérdida de datos.
 * - Escucha el evento global 'mindful-emergency-save' para volcado síncrono antes del timeout.
 * - Detecta si hay un borrador previo no guardado y permite restaurarlo o descartarlo.
 */
export function useNoteDraft<T>({
  draftKey,
  data,
  isDirty,
  debounceMs = 1000,
  onRestore,
}: UseNoteDraftOptions<T>) {
  const [hasDraft, setHasDraft] = useState(false);
  const [draftData, setDraftData] = useState<T | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  // Mantener referencias actualizadas para callbacks síncronos
  const dataRef = useRef(data);
  const isDirtyRef = useRef(isDirty);
  const draftKeyRef = useRef(draftKey);

  useEffect(() => {
    dataRef.current = data;
    isDirtyRef.current = isDirty;
    draftKeyRef.current = draftKey;
  }, [data, isDirty, draftKey]);

  // Función síncrona de guardado forzado
  const saveImmediately = useCallback(() => {
    if (!draftKeyRef.current || !isDirtyRef.current) return;
    try {
      const payload: DraftMetadata<T> = {
        data: dataRef.current,
        savedAt: Date.now(),
      };
      localStorage.setItem(draftKeyRef.current, JSON.stringify(payload));
      setDraftSavedAt(payload.savedAt);
      setAutosaveStatus('saved');
    } catch (err) {
      console.warn('[useNoteDraft] Error al guardar borrador en localStorage:', err);
    }
  }, []);

  // Comprobar borrador existente al montar o cambiar clave
  useEffect(() => {
    if (!draftKey) {
      setHasDraft(false);
      setDraftData(null);
      setDraftSavedAt(null);
      return;
    }

    try {
      const raw = localStorage.getItem(draftKey);
      if (raw) {
        const parsed: DraftMetadata<T> = JSON.parse(raw);
        if (parsed && parsed.data) {
          setHasDraft(true);
          setDraftData(parsed.data);
          setDraftSavedAt(parsed.savedAt || null);
          return;
        }
      }
    } catch (e) {
      console.error('[useNoteDraft] Error leyendo borrador:', e);
    }

    setHasDraft(false);
    setDraftData(null);
    setDraftSavedAt(null);
  }, [draftKey]);

  // Autoguardado debounced al escribir
  useEffect(() => {
    if (!isDirty || !draftKey) return;

    setAutosaveStatus('saving');
    const timer = setTimeout(() => {
      saveImmediately();
    }, debounceMs);

    return () => clearTimeout(timer);
  }, [data, isDirty, draftKey, debounceMs, saveImmediately]);

  // Escuchar evento global de emergencia (emitido por Layout antes de signOut por inactividad)
  useEffect(() => {
    const handleEmergencySave = () => {
      if (isDirtyRef.current) {
        saveImmediately();
      }
    };

    window.addEventListener('mindful-emergency-save', handleEmergencySave);
    return () => window.removeEventListener('mindful-emergency-save', handleEmergencySave);
  }, [saveImmediately]);

  // Restaurar borrador
  const restoreDraft = useCallback(() => {
    if (!draftData) return null;
    if (onRestore) {
      onRestore(draftData);
    }
    setHasDraft(false);
    return draftData;
  }, [draftData, onRestore]);

  // Descartar borrador almacenado
  const discardDraft = useCallback(() => {
    if (draftKey) {
      localStorage.removeItem(draftKey);
    }
    setHasDraft(false);
    setDraftData(null);
    setDraftSavedAt(null);
    setAutosaveStatus('idle');
  }, [draftKey]);

  // Limpiar borrador tras guardado exitoso en base de datos
  const clearDraft = useCallback(() => {
    if (draftKey) {
      localStorage.removeItem(draftKey);
    }
    setHasDraft(false);
    setDraftData(null);
    setDraftSavedAt(null);
    setAutosaveStatus('idle');
  }, [draftKey]);

  return {
    hasDraft,
    draftData,
    draftSavedAt,
    autosaveStatus,
    restoreDraft,
    discardDraft,
    clearDraft,
    saveImmediately,
  };
}

export default useNoteDraft;
