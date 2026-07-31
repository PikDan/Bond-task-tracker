import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { setCurrentUserId } from "../api/mutator";

const STORAGE_KEY = "tracker.userId";

interface UserContextValue {
  userId: string;
  setUserId: (userId: string) => void;
}

const UserContext = createContext<UserContextValue | null>(null);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userId, setUserIdState] = useState(() => localStorage.getItem(STORAGE_KEY) ?? "");

  useEffect(() => {
    setCurrentUserId(userId);
  }, [userId]);

  function setUserId(next: string) {
    localStorage.setItem(STORAGE_KEY, next);
    setUserIdState(next);
  }

  return <UserContext.Provider value={{ userId, setUserId }}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used within a UserProvider");
  return ctx;
}
