import { useEffect, useRef, useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Appointment, Contact } from "@shared/schema";
import { haversineDistance, geocodeAddress, PROXIMITY_METERS } from "@/lib/geo-utils";

type AppointmentWithContact = Appointment & { contact: Contact };

const CHECK_INTERVAL_MS = 15000;
const DISMISSED_KEY = 'fuse-gps-dismissed-appointments';

function getDismissedIds(): Set<number> {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function addDismissedId(id: number) {
  const dismissed = getDismissedIds();
  dismissed.add(id);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify([...dismissed]));
}

function clearOldDismissed() {
  const today = new Date().toISOString().split('T')[0];
  const key = `${DISMISSED_KEY}-date`;
  const lastDate = localStorage.getItem(key);
  if (lastDate !== today) {
    localStorage.removeItem(DISMISSED_KEY);
    localStorage.setItem(key, today);
  }
}

interface UseAppointmentGPSOptions {
  enabled?: boolean;
  onArrival?: (appointment: AppointmentWithContact) => void;
}

export function useAppointmentGPS({ enabled = true, onArrival }: UseAppointmentGPSOptions) {
  const [locationPermission, setLocationPermission] = useState<'granted' | 'denied' | 'prompt' | 'unknown'>('unknown');
  const [isTracking, setIsTracking] = useState(false);
  const geocodeCacheRef = useRef<Map<string, { lat: number; lng: number } | null>>(new Map());
  const arrivedRef = useRef<Set<number>>(new Set());
  const checkingRef = useRef(false);

  const { data: appointments } = useQuery<AppointmentWithContact[]>({
    queryKey: ['/api/appointments'],
    enabled,
  });

  const { data: activeSession } = useQuery({
    queryKey: ['/api/appointment-sessions/active'],
    enabled,
  });

  const todayAppointments = (appointments || []).filter(appt => {
    if (appt.status !== 'scheduled') return false;
    const today = new Date().toISOString().split('T')[0];
    return appt.date === today;
  });

  useEffect(() => {
    clearOldDismissed();
  }, []);

  useEffect(() => {
    if (!navigator.geolocation || !navigator.permissions) {
      setLocationPermission('unknown');
      return;
    }
    navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
      setLocationPermission(result.state as any);
      result.addEventListener('change', () => {
        setLocationPermission(result.state as any);
      });
    }).catch(() => setLocationPermission('unknown'));
  }, []);

  const requestPermission = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      () => setLocationPermission('granted'),
      () => setLocationPermission('denied'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  const checkProximity = useCallback(async () => {
    if (checkingRef.current) return;
    if (!todayAppointments.length || !onArrival) return;
    if (activeSession) return;
    if (locationPermission !== 'granted') return;

    checkingRef.current = true;
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 5000,
        });
      });

      const userLat = position.coords.latitude;
      const userLng = position.coords.longitude;

      const dismissed = getDismissedIds();

      for (const appt of todayAppointments) {
        if (arrivedRef.current.has(appt.id)) continue;
        if (dismissed.has(appt.id)) continue;

        const address = appt.contact?.address;
        if (!address) continue;

        let coords = geocodeCacheRef.current.get(address);
        if (coords === undefined) {
          coords = await geocodeAddress(address);
          geocodeCacheRef.current.set(address, coords);
        }
        if (!coords) continue;

        const distance = haversineDistance(userLat, userLng, coords.lat, coords.lng);
        if (distance <= PROXIMITY_METERS) {
          arrivedRef.current.add(appt.id);
          onArrival(appt);
          break;
        }
      }
    } catch (e) {
      console.error('[GPS] Position error:', e);
    } finally {
      checkingRef.current = false;
    }
  }, [todayAppointments, onArrival, activeSession, locationPermission]);

  useEffect(() => {
    if (!enabled || !todayAppointments.length || activeSession) {
      setIsTracking(false);
      return;
    }

    if (locationPermission === 'prompt' || locationPermission === 'unknown') {
      requestPermission();
      return;
    }

    if (locationPermission !== 'granted') {
      setIsTracking(false);
      return;
    }

    setIsTracking(true);
    checkProximity();
    const interval = setInterval(checkProximity, CHECK_INTERVAL_MS);
    return () => {
      clearInterval(interval);
      setIsTracking(false);
    };
  }, [enabled, locationPermission, todayAppointments.length, activeSession, checkProximity, requestPermission]);

  return {
    locationPermission,
    requestPermission,
    isTracking,
    dismissAppointment: addDismissedId,
  };
}
