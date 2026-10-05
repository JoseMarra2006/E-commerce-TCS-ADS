import { useEffect, useRef } from "react";
import type { RefObject } from "react";

export function useMontado(): RefObject<boolean> {
  const montado = useRef(false);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  return montado;
}
