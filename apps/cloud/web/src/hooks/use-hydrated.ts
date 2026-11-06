import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False on the server and through hydration, true from the render right
 * after. For parts that should mount on the client only: skullet draws a
 * skeleton from the shape it remembered on the last visit (localStorage), but
 * a server-rendered one keeps the server's guess until its data lands.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
