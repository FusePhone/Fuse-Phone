import { createContext, useContext, useState, useCallback, useMemo } from "react";
import type { ReactNode } from "react";
import { formatPhoneDisplay } from "@/lib/utils";

interface DemoModeContextType {
  isDemoMode: boolean;
  setDemoMode: (value: boolean) => void;
  maskName: (name: string | null | undefined) => string;
  maskPhone: (phone: string | null | undefined) => string;
  maskEmail: (email: string | null | undefined) => string;
  maskAddress: (address: string | null | undefined) => string;
  maskCity: (city: string | null | undefined) => string;
  maskText: (text: string | null | undefined) => string;
  maskProjectTitle: (title: string | null | undefined, contactName?: string | null) => string;
}

const DEMO_FIRST_NAMES = [
  "Alex", "Jordan", "Taylor", "Morgan", "Casey", "Riley", "Avery", "Quinn",
  "Blake", "Drew", "Sage", "Reese", "Dakota", "Skyler", "Hayden", "Emerson",
  "Jamie", "Parker", "Cameron", "Logan", "Peyton", "Finley", "Rowan", "Kendall",
];

const DEMO_LAST_NAMES = [
  "Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis",
  "Rodriguez", "Martinez", "Anderson", "Taylor", "Thomas", "Moore", "Jackson", "Martin",
  "Lee", "White", "Harris", "Clark", "Lewis", "Robinson", "Walker", "Young",
];

const DEMO_STREETS = [
  "123 Oak Street", "456 Maple Ave", "789 Cedar Lane", "321 Pine Road",
  "654 Birch Drive", "987 Elm Court", "147 Willow Way", "258 Spruce Blvd",
  "369 Ash Place", "741 Cherry Circle", "852 Walnut Terrace", "963 Hickory Path",
];

const DEMO_CITIES = [
  "Springfield", "Riverside", "Fairview", "Greenville", "Madison",
  "Georgetown", "Franklin", "Clinton", "Arlington", "Salem",
  "Bristol", "Oxford",
];

function hashStr(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

const nameCache = new Map<string, string>();
const phoneCache = new Map<string, string>();
const emailCache = new Map<string, string>();
const addressCache = new Map<string, string>();
const cityCache = new Map<string, string>();

function getDemoName(realName: string): string {
  if (nameCache.has(realName)) return nameCache.get(realName)!;
  const h = hashStr(realName);
  const first = DEMO_FIRST_NAMES[h % DEMO_FIRST_NAMES.length];
  const last = DEMO_LAST_NAMES[(h >> 4) % DEMO_LAST_NAMES.length];
  const result = `${first} ${last}`;
  nameCache.set(realName, result);
  return result;
}

function getDemoPhone(realPhone: string): string {
  if (phoneCache.has(realPhone)) return phoneCache.get(realPhone)!;
  const h = hashStr(realPhone);
  const area = 200 + (h % 800);
  const mid = 200 + ((h >> 8) % 800);
  const last = 1000 + ((h >> 16) % 9000);
  const result = `(${area}) ${mid}-${last}`;
  phoneCache.set(realPhone, result);
  return result;
}

function getDemoEmail(realEmail: string): string {
  if (emailCache.has(realEmail)) return emailCache.get(realEmail)!;
  const h = hashStr(realEmail);
  const first = DEMO_FIRST_NAMES[h % DEMO_FIRST_NAMES.length].toLowerCase();
  const last = DEMO_LAST_NAMES[(h >> 4) % DEMO_LAST_NAMES.length].toLowerCase();
  const domains = ["email.com", "mail.com", "example.com"];
  const domain = domains[h % domains.length];
  const result = `${first}.${last}@${domain}`;
  emailCache.set(realEmail, result);
  return result;
}

function getDemoAddress(realAddress: string): string {
  if (addressCache.has(realAddress)) return addressCache.get(realAddress)!;
  const h = hashStr(realAddress);
  const result = DEMO_STREETS[h % DEMO_STREETS.length];
  addressCache.set(realAddress, result);
  return result;
}

function getDemoCity(realCity: string): string {
  if (cityCache.has(realCity)) return cityCache.get(realCity)!;
  const h = hashStr(realCity);
  const result = DEMO_CITIES[h % DEMO_CITIES.length];
  cityCache.set(realCity, result);
  return result;
}

const DemoModeContext = createContext<DemoModeContextType>({
  isDemoMode: false,
  setDemoMode: () => {},
  maskName: (n) => n || "",
  maskPhone: (p) => p || "",
  maskEmail: (e) => e || "",
  maskAddress: (a) => a || "",
  maskCity: (c) => c || "",
  maskText: (t) => t || "",
  maskProjectTitle: (t) => t || "",
});

const PHONE_REGEX = /(\+?1?\s*[-.]?\s*\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4})/g;
const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function DemoModeProvider({ children }: { children: ReactNode }) {
  const [isDemoMode, setDemoModeState] = useState(() => {
    try {
      return localStorage.getItem("fuse-demo-mode") === "true";
    } catch {
      return false;
    }
  });

  const setDemoMode = useCallback((value: boolean) => {
    setDemoModeState(value);
    try {
      localStorage.setItem("fuse-demo-mode", value ? "true" : "false");
    } catch {}
  }, []);

  const maskName = useCallback((name: string | null | undefined): string => {
    if (!name) return "";
    if (!isDemoMode) return name;
    return getDemoName(name);
  }, [isDemoMode]);

  const maskPhone = useCallback((phone: string | null | undefined): string => {
    if (!phone) return "";
    if (!isDemoMode) return formatPhoneDisplay(phone);
    return getDemoPhone(phone);
  }, [isDemoMode]);

  const maskEmail = useCallback((email: string | null | undefined): string => {
    if (!email) return "";
    if (!isDemoMode) return email;
    return getDemoEmail(email);
  }, [isDemoMode]);

  const maskAddress = useCallback((address: string | null | undefined): string => {
    if (!address) return "";
    if (!isDemoMode) return address;
    return getDemoAddress(address);
  }, [isDemoMode]);

  const maskCity = useCallback((city: string | null | undefined): string => {
    if (!city) return "";
    if (!isDemoMode) return city;
    return getDemoCity(city);
  }, [isDemoMode]);

  const maskText = useCallback((text: string | null | undefined): string => {
    if (!text) return "";
    if (!isDemoMode) return text;
    let result = text;
    result = result.replace(PHONE_REGEX, (match) => getDemoPhone(match));
    result = result.replace(EMAIL_REGEX, (match) => getDemoEmail(match));
    return result;
  }, [isDemoMode]);

  const maskProjectTitle = useCallback((title: string | null | undefined, contactName?: string | null): string => {
    if (!title) return "";
    if (!isDemoMode) return title;
    if (contactName) {
      const maskedName = getDemoName(contactName);
      const numberMatch = title.match(/(#\d+)$/);
      if (title.startsWith(contactName)) {
        return numberMatch ? `${maskedName} ${numberMatch[1]}` : maskedName;
      }
      return title.replace(contactName, maskedName);
    }
    const match = title.match(/^(.+?)\s*(#\d+)$/);
    if (match) {
      return `${getDemoName(match[1])} ${match[2]}`;
    }
    return getDemoName(title);
  }, [isDemoMode]);

  const value = useMemo(() => ({
    isDemoMode,
    setDemoMode,
    maskName,
    maskPhone,
    maskEmail,
    maskAddress,
    maskCity,
    maskText,
    maskProjectTitle,
  }), [isDemoMode, setDemoMode, maskName, maskPhone, maskEmail, maskAddress, maskCity, maskText, maskProjectTitle]);

  return (
    <DemoModeContext.Provider value={value}>
      {children}
    </DemoModeContext.Provider>
  );
}

export function useDemoMode() {
  return useContext(DemoModeContext);
}
