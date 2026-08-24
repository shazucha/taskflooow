import { useEffect, useState } from "react";

/** Vráti hodnotu s oneskorením – filtrovanie sa nespúšťa pri každom stlačení klávesy. */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}
