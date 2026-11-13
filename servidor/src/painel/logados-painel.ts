import {
  type ControladorServidor,
  EVENTO_LOGADOS,
} from "../controlador-servidor.ts";
import type { InstantaneoLogados } from "../logados/monitor-usuarios-logados.ts";

export const EVENTO_SSE_LOGADOS = "logados";

export interface FonteUsuariosLogados {
  obter: () => InstantaneoLogados;
  inscrever: (ouvinte: (instantaneo: InstantaneoLogados) => void) => () => void;
}

export function criarFonteLogadosDoControlador(
  controlador: ControladorServidor,
): FonteUsuariosLogados {
  return {
    obter: () => controlador.obterUsuariosLogados(),
    inscrever: (ouvinte) => {
      const ouvinteEvento = (evento: Event) => {
        ouvinte((evento as CustomEvent<InstantaneoLogados>).detail);
      };
      controlador.addEventListener(EVENTO_LOGADOS, ouvinteEvento);
      return () => {
        controlador.removeEventListener(EVENTO_LOGADOS, ouvinteEvento);
      };
    },
  };
}

export function serializarLogadosParaSse(
  instantaneo: InstantaneoLogados,
): string {
  const projetado = {
    estado: instantaneo.estado,
    usuarios: instantaneo.usuarios.map((usuario) => ({
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      tipo: usuario.tipo,
      sessoes: usuario.sessoes,
      desde: usuario.desde,
    })),
    atualizadoEm: instantaneo.atualizadoEm,
  };

  return JSON.stringify(projetado)
    .replaceAll("\u2028", "\\u2028")
    .replaceAll("\u2029", "\\u2029");
}
