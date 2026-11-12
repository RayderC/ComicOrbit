"use client";

import { createContext, useContext } from "react";

export type Me = { id: number; username: string; isAdmin: boolean };

export const MeContext = createContext<Me | null>(null);

/** The signed-in person, from the app's layout. */
export function useMe(): Me {
  const v = useContext(MeContext);
  if (!v) throw new Error("useMe outside MeContext");
  return v;
}
