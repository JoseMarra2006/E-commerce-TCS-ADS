import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { primeiroCampoInvalido } from "../validacao/validacao-produto.ts";
import type { ErrosProduto } from "../validacao/validacao-produto.ts";

export interface FocoFormularioProduto {
  referencias: {
    nome: RefObject<HTMLInputElement | null>;
    descricao: RefObject<HTMLTextAreaElement | null>;
    quantidade: RefObject<HTMLInputElement | null>;
  };
  referenciaAlerta: RefObject<HTMLDivElement | null>;
  pedirFoco: (destino: "campo" | "alerta") => void;
}

export function useFocoFormularioProduto(errosAtuais: ErrosProduto): FocoFormularioProduto {
  const nome = useRef<HTMLInputElement>(null);
  const descricao = useRef<HTMLTextAreaElement>(null);
  const quantidade = useRef<HTMLInputElement>(null);
  const referenciaAlerta = useRef<HTMLDivElement>(null);
  const pendente = useRef<"campo" | "alerta" | null>(null);

  useEffect(() => {
    const destino = pendente.current;
    if (destino === null) {
      return;
    }
    pendente.current = null;
    if (destino === "alerta") {
      referenciaAlerta.current?.focus();
      return;
    }
    const campo = primeiroCampoInvalido(errosAtuais);
    if (campo === "nome") {
      nome.current?.focus();
    } else if (campo === "descricao") {
      descricao.current?.focus();
    } else if (campo === "quantidade") {
      quantidade.current?.focus();
    }
  }, [errosAtuais]);

  return {
    referencias: { nome, descricao, quantidade },
    referenciaAlerta,
    pedirFoco: (destino) => {
      pendente.current = destino;
    },
  };
}
