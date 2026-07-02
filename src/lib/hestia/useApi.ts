import { useCallback, useEffect, useRef, useState } from "react";
import type { ApiState } from "./api";

/**
 * Runs `fn` on mount and whenever deps change; also exposes a `retry`
 * that re-executes the call and updates state with the fresh result.
 * `refreshing` fica true durante um retry manual (mantendo o estado anterior visível).
 */
export function useApi<T>(
  fn: () => Promise<ApiState<T>>,
  deps: React.DependencyList = [],
): ApiState<T> & { retry: () => void; refreshing: boolean } {
  const [state, setState] = useState<ApiState<T>>({ status: "loading" });
  const [refreshing, setRefreshing] = useState(false);
  const aliveRef = useRef(true);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const run = useCallback((manual: boolean) => {
    if (manual) setRefreshing(true);
    else setState({ status: "loading" });
    fnRef.current().then((s) => {
      if (!aliveRef.current) return;
      setState(s);
      if (manual) setRefreshing(false);
    });
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    run(false);
    return () => {
      aliveRef.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  const retry = useCallback(() => run(true), [run]);

  return { ...state, retry, refreshing } as ApiState<T> & {
    retry: () => void;
    refreshing: boolean;
  };
}
