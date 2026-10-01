import { useState } from "react";
export function useSavedPlaces() {
  const [ids, setIds] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(
        localStorage.getItem("toursafe-saved") || "[]",
      );
      return Array.isArray(saved)
        ? saved.filter((v): v is string => typeof v === "string").slice(0, 100)
        : [];
    } catch {
      return [];
    }
  });
  const toggle = (id: string) =>
    setIds((old) => {
      const next = old.includes(id)
        ? old.filter((x) => x !== id)
        : [...old, id].slice(-100);
      try {
        localStorage.setItem("toursafe-saved", JSON.stringify(next));
      } catch {
        /* Session state still works if storage is unavailable. */
      }
      return next;
    });
  return { ids, toggle };
}
