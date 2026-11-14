import type { FormEvent, Ref } from "react";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { BotaoLink } from "../componentes/BotaoLink.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CampoTextoLongo } from "../componentes/CampoTextoLongo.tsx";
import {
  contarCaracteres,
  DESCRICAO_PRODUTO_MAXIMA,
  NOME_PRODUTO_MAXIMO,
} from "../validacao/validacao-produto.ts";
import type {
  CampoProduto,
  CamposFormularioProduto,
  ErrosProduto,
} from "../validacao/validacao-produto.ts";
import type { FalhaExibida } from "./cadastro-produto.ts";
import estilos from "./FormularioProduto.module.css";

export interface ReferenciasFormularioProduto {
  nome: Ref<HTMLInputElement>;
  descricao: Ref<HTMLTextAreaElement>;
  quantidade: Ref<HTMLInputElement>;
}

interface PropriedadesFormularioProduto {
  valores: CamposFormularioProduto;
  erros: ErrosProduto;
  enviando: boolean;
  textoEnviar: string;
  textoEnviando: string;
  cancelarPara: string;
  identificador?: number;
  referencias?: ReferenciasFormularioProduto;
  aoAlterar: (campo: CampoProduto, valor: string) => void;
  aoSair: (campo: CampoProduto) => void;
  aoEnviar: (evento: FormEvent<HTMLFormElement>) => void;
}

interface PropriedadesAlertaFalhaProduto {
  falha: FalhaExibida;
  referencia?: Ref<HTMLDivElement>;
}

function textoContador(valor: string, maximo: number): string {
  return `${contarCaracteres(valor.trim())} de ${maximo} caracteres`;
}

export function AlertaFalhaProduto({ falha, referencia }: PropriedadesAlertaFalhaProduto) {
  return (
    <div ref={referencia} tabIndex={-1} className={estilos.alerta}>
      <Alerta tipo="erro" mensagem={falha.mensagem} />
      {falha.apoio !== null && <p className={estilos.apoio}>{falha.apoio}</p>}
    </div>
  );
}

export function FormularioProduto({
  valores,
  erros,
  enviando,
  textoEnviar,
  textoEnviando,
  cancelarPara,
  identificador,
  referencias,
  aoAlterar,
  aoSair,
  aoEnviar,
}: PropriedadesFormularioProduto) {
  return (
    <form
      className={estilos.formulario}
      onSubmit={aoEnviar}
      aria-busy={enviando ? true : undefined}
      noValidate
    >
      {identificador !== undefined && (
        <p className={estilos.identificador}>Identificador: {identificador}</p>
      )}
      <CampoTexto
        rotulo="Nome"
        valor={valores.nome}
        aoAlterar={(valor) => aoAlterar("nome", valor)}
        aoSair={() => aoSair("nome")}
        autoComplete="off"
        somenteLeitura={enviando}
        ajuda="De 2 a 100 caracteres."
        contador={textoContador(valores.nome, NOME_PRODUTO_MAXIMO)}
        erro={erros.nome}
        referencia={referencias?.nome}
      />
      <CampoTextoLongo
        rotulo="Descrição"
        valor={valores.descricao}
        aoAlterar={(valor) => aoAlterar("descricao", valor)}
        aoSair={() => aoSair("descricao")}
        somenteLeitura={enviando}
        ajuda="Até 500 caracteres. Pode ficar em branco."
        contador={textoContador(valores.descricao, DESCRICAO_PRODUTO_MAXIMA)}
        erro={erros.descricao}
        referencia={referencias?.descricao}
      />
      <CampoTexto
        rotulo="Quantidade em estoque"
        valor={valores.quantidade}
        aoAlterar={(valor) => aoAlterar("quantidade", valor)}
        aoSair={() => aoSair("quantidade")}
        inputMode="numeric"
        autoComplete="off"
        somenteLeitura={enviando}
        ajuda="Número inteiro de 0 a 1.000.000."
        erro={erros.quantidade}
        referencia={referencias?.quantidade}
      />
      <div className={estilos.botoes}>
        <Botao tipo="submit" carregando={enviando} textoCarregando={textoEnviando}>
          {textoEnviar}
        </Botao>
        <BotaoLink para={cancelarPara} variante="secundaria">Cancelar</BotaoLink>
      </div>
    </form>
  );
}
