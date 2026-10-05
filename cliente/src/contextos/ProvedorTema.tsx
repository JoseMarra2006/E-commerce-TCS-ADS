import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ContextoTema } from "./contexto-tema.ts";
import { alternarTema, resolverTema } from "./tema.ts";
import type { Tema } from "./tema.ts";

interface PropriedadesProvedorTema {
  children: ReactNode;
}

const CONSULTA_ESCURO = "(prefers-color-scheme: dark)";

function sistemaEstaEscuro(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia(CONSULTA_ESCURO).matches;
}

export function ProvedorTema({ children }: PropriedadesProvedorTema) {
  const [escolhaManual, setEscolhaManual] = useState<Tema | null>(null);
  const [sistemaEscuro, setSistemaEscuro] = useState<boolean>(sistemaEstaEscuro);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") {
      return undefined;
    }
    const consulta = window.matchMedia(CONSULTA_ESCURO);
    const aoMudar = (evento: MediaQueryListEvent) => {
      setSistemaEscuro(evento.matches);
    };
    consulta.addEventListener("change", aoMudar);
    return () => {
      consulta.removeEventListener("change", aoMudar);
    };
  }, []);

  useEffect(() => {
    const raiz = document.documentElement;
    if (escolhaManual === null) {
      raiz.removeAttribute("data-tema");
    } else {
      raiz.setAttribute("data-tema", escolhaManual);
    }
  }, [escolhaManual]);

  const tema = resolverTema(escolhaManual, sistemaEscuro);

  const alternar = useCallback(() => {
    setEscolhaManual(alternarTema(tema));
  }, [tema]);

  const valor = useMemo(() => ({ tema, alternar }), [tema, alternar]);

  return <ContextoTema value={valor}>{children}</ContextoTema>;
}
