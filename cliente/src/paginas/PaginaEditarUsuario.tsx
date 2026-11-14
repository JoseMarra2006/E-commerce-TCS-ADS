import { useEffect, useReducer, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Navigate, useNavigate, useParams } from "react-router";
import { obterMensagemPadraoStatus } from "../api/cliente-http.ts";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CampoSenha } from "../componentes/CampoSenha.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { criarEstadoAvisoUsuarioAtualizado } from "./aviso-usuario.ts";
import { CAMINHO_LISTA_USUARIOS, caminhoDetalheUsuario } from "./caminhos-usuarios.ts";
import {
  decidirDestinoDetalhe,
  MENSAGEM_ID_ROTA_INVALIDO,
  TITULO_NAO_ENCONTRADO,
} from "./detalhe-usuario.ts";
import {
  criarEstadoEdicaoUsuario,
  ehFormularioEditavel,
  OBSERVACAO_TIPO_USUARIO,
  podeEnviar,
  primeiroCampoInvalido,
  reduzirEdicaoUsuario,
  validarEdicaoUsuario,
} from "./edicao-usuario.ts";
import type { CampoEdicaoUsuario } from "./edicao-usuario.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilosFormulario from "./PaginaAutenticacao.module.css";
import estilos from "./PaginaEditarUsuario.module.css";

const ID_SEM_ALVO = 0;

export function PaginaEditarUsuario() {
  useTituloPagina("Editar usuário");
  const { id: parametro } = useParams();
  const { sessao } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const montado = useMontado();
  const [tentativa, setTentativa] = useState(0);

  const destino = decidirDestinoDetalhe(parametro, sessao?.usuario.id ?? ID_SEM_ALVO);
  const idAlvo = destino.tipo === "carregar" ? destino.id : ID_SEM_ALVO;
  const [estado, despachar] = useReducer(reduzirEdicaoUsuario, idAlvo, criarEstadoEdicaoUsuario);
  const token = sessao?.token;

  const referenciaNome = useRef<HTMLInputElement>(null);
  const referenciaEmail = useRef<HTMLInputElement>(null);
  const referenciaSenha = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);
  const focoPendente = useRef(false);
  const idAtual = useRef(idAlvo);

  if (idAlvo !== ID_SEM_ALVO && estado.id !== idAlvo) {
    despachar({ tipo: "iniciar", id: idAlvo });
  }

  useEffect(() => {
    if (idAlvo === ID_SEM_ALVO || token === undefined) {
      return undefined;
    }
    let ativa = true;

    void operacoes.lerCadastro(idAlvo, token).then((resultado) => {
      if (!ativa) {
        return;
      }
      despachar(
        resultado.ok
          ? { tipo: "carregado", id: idAlvo, usuario: resultado.dados }
          : {
            tipo: "falha_carregamento",
            id: idAlvo,
            falha: resultado,
            mensagemPadrao404: obterMensagemPadraoStatus(404),
          },
      );
    });

    return () => {
      ativa = false;
    };
  }, [idAlvo, token, operacoes, tentativa]);

  useEffect(() => {
    idAtual.current = idAlvo;
  }, [idAlvo]);

  useEffect(() => {
    if (!focoPendente.current || estado.fase !== "erro_campo") {
      return;
    }
    focoPendente.current = false;
    const referencias: Record<CampoEdicaoUsuario, typeof referenciaNome> = {
      nome: referenciaNome,
      email: referenciaEmail,
      senha: referenciaSenha,
    };
    const campo = primeiroCampoInvalido(estado.erros);
    if (campo !== null) {
      referencias[campo].current?.focus();
    }
  }, [estado]);

  if (sessao === null) {
    return null;
  }

  if (destino.tipo === "perfil") {
    return <Navigate to="/perfil" replace />;
  }

  const visivel = estado.id === idAlvo ? estado : criarEstadoEdicaoUsuario(idAlvo);
  const voltarLista = <LinkTexto para={CAMINHO_LISTA_USUARIOS}>Voltar para a lista</LinkTexto>;

  function alterar(campo: CampoEdicaoUsuario, valor: string) {
    despachar({ tipo: "alterar", id: idAlvo, campo, valor });
  }

  function tentarCarregarNovamente() {
    despachar({ tipo: "iniciar", id: idAlvo });
    setTentativa((atual) => atual + 1);
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emEnvio.current || token === undefined || !ehFormularioEditavel(visivel)) {
      return;
    }

    const validacao = validarEdicaoUsuario(visivel.valores, visivel.atual);
    if (!validacao.ok) {
      if ("nadaAlterado" in validacao) {
        despachar({ tipo: "sem_alteracao", id: idAlvo });
      } else {
        focoPendente.current = true;
        despachar({ tipo: "invalido", id: idAlvo, erros: validacao.erros });
      }
      return;
    }

    const id = idAlvo;
    emEnvio.current = true;
    despachar({ tipo: "salvar", id });
    const resultado = await operacoes.atualizarCadastro(id, token, validacao.dados);
    emEnvio.current = false;
    if (!montado.current || idAtual.current !== id) {
      return;
    }

    if (resultado.ok) {
      despachar({ tipo: "salvo", id, usuario: resultado.dados });
      if (resultado.dados.id === id) {
        navegar(caminhoDetalheUsuario(id), { state: criarEstadoAvisoUsuarioAtualizado() });
      }
      return;
    }

    focoPendente.current = true;
    despachar({
      tipo: "falha_salvar",
      id,
      falha: resultado,
      mensagemPadrao404: obterMensagemPadraoStatus(404),
    });
  }

  function conteudo() {
    if (destino.tipo === "invalido") {
      return (
        <>
          <Alerta tipo="erro" mensagem={MENSAGEM_ID_ROTA_INVALIDO} />
          <div className={estilos.acoes}>{voltarLista}</div>
        </>
      );
    }

    if (visivel.fase === "carregando" || visivel.fase === "concluido") {
      return (
        <p role="status" className={estilos.situacao}>
          {visivel.fase === "carregando" ? "Carregando dados do usuário..." : "Salvando..."}
        </p>
      );
    }

    if (visivel.fase === "nao_encontrado") {
      return (
        <>
          <div role="alert" className={estilos.naoEncontrado}>
            <h2 className={estilos.tituloNaoEncontrado}>{TITULO_NAO_ENCONTRADO}</h2>
            <p>{visivel.explicacao}</p>
          </div>
          <div className={estilos.acoes}>{voltarLista}</div>
        </>
      );
    }

    if (visivel.fase === "falha_carregamento") {
      return (
        <>
          <Alerta tipo="erro" mensagem={visivel.mensagem} />
          <div className={estilos.acoes}>
            <Botao variante="secundaria" aoClicar={tentarCarregarNovamente}>
              Tentar novamente
            </Botao>
            {voltarLista}
          </div>
        </>
      );
    }

    const salvando = visivel.fase === "salvando";
    const erros = visivel.fase === "erro_campo" ? visivel.erros : {};

    return (
      <>
        <form
          className={estilosFormulario.formulario}
          onSubmit={(evento) => void enviar(evento)}
          noValidate
        >
          <CampoTexto
            rotulo="Nome"
            valor={visivel.valores.nome}
            aoAlterar={(valor) => alterar("nome", valor)}
            autoComplete="off"
            desabilitado={salvando}
            ajuda="De 3 a 50 caracteres."
            erro={erros.nome}
            referencia={referenciaNome}
          />
          <CampoTexto
            rotulo="E-mail"
            valor={visivel.valores.email}
            aoAlterar={(valor) => alterar("email", valor)}
            tipo="email"
            autoComplete="off"
            desabilitado={salvando}
            ajuda="Até 30 caracteres, com @ e domínio."
            erro={erros.email}
            referencia={referenciaEmail}
          />
          <CampoSenha
            rotulo="Nova senha"
            valor={visivel.valores.senha}
            aoAlterar={(valor) => alterar("senha", valor)}
            autoComplete="new-password"
            desabilitado={salvando}
            ajuda="Deixe em branco para manter a senha atual. De 6 a 20 caracteres, somente letras sem acento e números."
            erro={erros.senha}
            referencia={referenciaSenha}
          />
          <p className={estilos.observacao}>{OBSERVACAO_TIPO_USUARIO}</p>
          <div className={estilosFormulario.botoes}>
            <Botao
              tipo="submit"
              carregando={salvando}
              textoCarregando="Salvando..."
              desabilitado={!podeEnviar(visivel) && !salvando}
            >
              Salvar alterações
            </Botao>
            <Botao
              variante="secundaria"
              desabilitado={salvando}
              aoClicar={() => navegar(caminhoDetalheUsuario(idAlvo))}
            >
              Cancelar
            </Botao>
          </div>
        </form>

        {visivel.fase === "pronto" && visivel.aviso !== null && (
          <Alerta tipo="info" mensagem={visivel.aviso} />
        )}
        {visivel.fase === "erro_geral" && <Alerta tipo="erro" mensagem={visivel.mensagem} />}
      </>
    );
  }

  return (
    <CartaoIngresso
      rotulo="Administração"
      titulo="Editar usuário"
      descricao="Altere somente o que quiser. A senha atual do usuário nunca é exibida."
    >
      {conteudo()}
    </CartaoIngresso>
  );
}
