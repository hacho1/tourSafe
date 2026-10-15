import { createContext, useContext } from "react";

export const EmergencyContext = createContext<(() => void) | null>(null);
export const useEmergency = () => useContext(EmergencyContext);
