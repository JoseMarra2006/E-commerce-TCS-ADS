import { useEffect, useReducer, useRef } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { BotaoLink } from "../componentes/BotaoLink.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CampoTextoLongo } from "../componentes/CampoTextoLongo.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import {
  contarCaracteres,
  DESCRICAO_PRODUTO_MAXIMA,
  NOME_PRODUTO_MAXIMO,
  primeiroCampoInvalido,
} from "../validacao/validacao-produto.ts";
import type { CampoProduto } from "../validacao/validacao-produto.ts";
import { criarEstadoAvisoProduto } from "./aviso-produto.ts";
import {
  criarEstadoCadastroProduto,
  enviarCadastroProduto,
  errosVisiveis,
  reduzirCadastroProduto,
  RESUMO_ERROS_PRODUTO,
  resumoVisivel,
} from "./cadastro-produto.ts";
import { CAMINHO_LISTA_PRODUTOS } from "./caminhos-produtos.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaNovoProduto.module.css";

function textoContador(valor: string, maximo: number): string {
  return `${contarCaracteres(valor.trim())} de ${maximo} caracteres`;
}

export function PaginaNovoProduto() {
  useTituloPagina("Novo produto");
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const montado = useMontado();
  const [estado, despachar] = useReducer(
    reduzirCadastroProduto,
    undefined,
    criarEstadoCadastroProduto,
  );

  const referenciaNome = useRef<HTMLInputElement>(null);
  const referenciaDescricao = useRef<HTMLTextAreaElement>(null);
  const referenciaQuantidade = useRef<HTMLInputElement>(null);
  const referenciaAlerta = useRef<HTMLDivElement>(null);
  const trava = useRef(false);
  const focoPendente = useRef<"campo" | "alerta" | null>(null);

  useEffect(() => {
    const pendente = focoPendente.current;
    if (pendente === null) {
      return;
    }
    focoPendente.current = null;
    if (pendente === "alerta") {
      referenciaAlerta.current?.focus();
      return;
    }
    const campo = primeiroCampoInvalido(errosVisiveis(estado));
    if (campo === "nome") {
      referenciaNome.current?.focus();
    } else if (campo === "descricao") {
      referenciaDescricao.current?.focus();
    } else if (campo === "quantidade") {
      referenciaQuantidade.current?.focus();
    }
  }, [estado]);

  if (sessao === null) {
    return null;
  }

  const { token } = sessao;
  const erros = errosVisiveis(estado);
  const enviando = estado.fase === "enviando";

  function alterar(campo: CampoProduto, valor: string) {
    despachar({ tipo: "alterar", campo, valor });
  }

  function sair(campo: CampoProduto) {
    despachar({ tipo: "sair_do_campo", campo });
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const resultado = await enviarCadastroProduto(
      {
        criarProduto: operacoes.criarProduto,
        token,
        trava,
        aoIniciar: () => despachar({ tipo: "iniciar_envio" }),
      },
      estado.valores,
    );

    if (resultado.tipo === "ignorado") {
      return;
    }
    if (resultado.tipo === "invalido") {
      focoPendente.current = "campo";
      despachar({ tipo: "envio_invalido" });
      return;
    }
    if (!montado.current) {
      return;
    }
    if (resultado.tipo === "criado") {
      navegar(CAMINHO_LISTA_PRODUTOS, { state: criarEstadoAvisoProduto("criado") });
      return;
    }
    if (resultado.tipo === "nao_autorizado") {
      despachar({ tipo: "fim_envio" });
      return;
    }
    focoPendente.current = "alerta";
    despachar({ tipo: "falha_envio", falha: resultado.falha });
  }

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Novo produto"
      descricao="Informe os dados do produto para cadastrá-lo no estoque."
    >
      {resumoVisivel(estado) && <Alerta tipo="erro" mensagem={RESUMO_ERROS_PRODUTO} />}

      {estado.erroServidor !== null && (
        <div ref={referenciaAlerta} tabIndex={-1} className={estilos.alerta}>
          <Alerta tipo="erro" mensagem={estado.erroServidor.mensagem} />
          {estado.erroServidor.apoio !== null && (
            <p className={estilos.apoio}>{estado.erroServidor.apoio}</p>
          )}
        </div>
      )}

      <form
        className={estilos.formulario}
        onSubmit={(evento) => void enviar(evento)}
        aria-busy={enviando ? true : undefined}
        noValidate
      >
        <CampoTexto
          rotulo="Nome"
          valor={estado.valores.nome}
          aoAlterar={(valor) => alterar("nome", valor)}
          aoSair={() => sair("nome")}
          autoComplete="off"
          somenteLeitura={enviando}
          ajuda="De 2 a 100 caracteres."
          contador={textoContador(estado.valores.nome, NOME_PRODUTO_MAXIMO)}
          erro={erros.nome}
          referencia={referenciaNome}
        />
        <CampoTextoLongo
          rotulo="Descrição"
          valor={estado.valores.descricao}
          aoAlterar={(valor) => alterar("descricao", valor)}
          aoSair={() => sair("descricao")}
          somenteLeitura={enviando}
          ajuda="Até 500 caracteres. Pode ficar em branco."
          contador={textoContador(estado.valores.descricao, DESCRICAO_PRODUTO_MAXIMA)}
          erro={erros.descricao}
          referencia={referenciaDescricao}
        />
        <CampoTexto
          rotulo="Quantidade em estoque"
          valor={estado.valores.quantidade}
          aoAlterar={(valor) => alterar("quantidade", valor)}
          aoSair={() => sair("quantidade")}
          inputMode="numeric"
          autoComplete="off"
          somenteLeitura={enviando}
          ajuda="Número inteiro de 0 a 1.000.000."
          erro={erros.quantidade}
          referencia={referenciaQuantidade}
        />
        <div className={estilos.botoes}>
          <Botao tipo="submit" carregando={enviando} textoCarregando="Cadastrando...">
            Cadastrar produto
          </Botao>
          <BotaoLink para={CAMINHO_LISTA_PRODUTOS} variante="secundaria">Cancelar</BotaoLink>
        </div>
      </form>
    </CartaoIngresso>
  );
}
