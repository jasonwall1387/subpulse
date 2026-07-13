import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const ClockTickContext = createContext(0);

export function useClockTick(): number {
  return useContext(ClockTickContext);
}

/** 30s ticker so relative countdown copy stays fresh. */
export function ClockTickProvider({ children }: { children: ReactNode }) {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return (
    <ClockTickContext.Provider value={tick}>{children}</ClockTickContext.Provider>
  );
}
