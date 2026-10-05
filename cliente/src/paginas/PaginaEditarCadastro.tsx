import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CampoSenha } from "../componentes/CampoSenha.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { useSessao } from "../contextos/use-sessao.ts";
import { validarFormularioEdicao } from "../validacao/validacao-campos.ts";
import type { ErrosCadastro } from "../validacao/validacao-campos.ts";
import { useMontado } from "./use-montado.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaAutenticacao.module.css";

interface FalhaExibida {
  tipo: "erro" | "aviso";
  mensagem: string;
}

export function PaginaEditarCadastro() {
  useTituloPagina("Editar cadastro");
  const { sessao, atualizarUsuario } = useSessao();
  const operacoes = useOperacoes();
  const navegar = useNavigate();
  const montado = useMontado();

  const [nome, setNome] = useState(sessao?.usuario.nome ?? "");
  const [email, setEmail] = useState(sessao?.usuario.email ?? "");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<ErrosCadastro>({});
  const [semAlteracao, setSemAlteracao] = useState(false);
  const [falha, setFalha] = useState<FalhaExibida | null>(null);
  const [enviando, setEnviando] = useState(false);

  const referenciaNome = useRef<HTMLInputElement>(null);
  const referenciaEmail = useRef<HTMLInputElement>(null);
  const referenciaSenha = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);

  if (sessao === null) {
    return null;
  }

  const { usuario, token } = sessao;

  function alterarNome(valor: string) {
    setNome(valor);
    setSemAlteracao(false);
    setErros((atuais) => ({ ...atuais, nome: undefined }));
  }

  function alterarEmail(valor: string) {
    setEmail(valor);
    setSemAlteracao(false);
    setErros((atuais) => ({ ...atuais, email: undefined }));
  }

  function alterarSenha(valor: string) {
    setSenha(valor);
    setSemAlteracao(false);
    setErros((atuais) => ({ ...atuais, senha: undefined }));
  }

  function focarPrimeiroInvalido(invalidos: ErrosCadastro) {
    if (invalidos.nome !== undefined) {
      referenciaNome.current?.focus();
    } else if (invalidos.email !== undefined) {
      referenciaEmail.current?.focus();
    } else {
      referenciaSenha.current?.focus();
    }
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emEnvio.current) {
      return;
    }
    setFalha(null);
    setSemAlteracao(false);

    const validacao = validarFormularioEdicao({ nome, email, senha }, usuario);
    if (!validacao.ok) {
      if ("nadaAlterado" in validacao) {
        setSemAlteracao(true);
      } else {
        setErros(validacao.erros);
        focarPrimeiroInvalido(validacao.erros);
      }
      return;
    }

    setErros({});
    emEnvio.current = true;
    setEnviando(true);
    try {
      const resultado = await operacoes.atualizarCadastro(usuario.id, token, validacao.dados);
      if (resultado.ok) {
        atualizarUsuario(resultado.dados);
        navegar("/perfil", { state: { mensagem: "Cadastro atualizado." } });
        return;
      }
      if (montado.current) {
        const conflito = resultado.tipo === "http" && resultado.status === 409;
        setFalha({ tipo: conflito ? "aviso" : "erro", mensagem: resultado.mensagem });
      }
    } finally {
      emEnvio.current = false;
      if (montado.current) {
        setEnviando(false);
      }
    }
  }

  return (
    <CartaoIngresso
      rotulo="Ingresso de acesso"
      titulo="Editar cadastro"
      descricao="Altere somente o que quiser. Deixe a senha em branco para mantê-la."
    >
      <form className={estilos.formulario} onSubmit={enviar} noValidate>
        <CampoTexto
          rotulo="Nome"
          valor={nome}
          aoAlterar={alterarNome}
          autoComplete="name"
          desabilitado={enviando}
          ajuda="De 3 a 50 caracteres."
          erro={erros.nome}
          referencia={referenciaNome}
        />
        <CampoTexto
          rotulo="E-mail"
          valor={email}
          aoAlterar={alterarEmail}
          tipo="email"
          autoComplete="email"
          desabilitado={enviando}
          ajuda="Até 30 caracteres, com @ e domínio."
          erro={erros.email}
          referencia={referenciaEmail}
        />
        <CampoSenha
          rotulo="Nova senha"
          valor={senha}
          aoAlterar={alterarSenha}
          autoComplete="new-password"
          desabilitado={enviando}
          ajuda="Opcional. De 6 a 20 caracteres, somente letras sem acento e números."
          erro={erros.senha}
          referencia={referenciaSenha}
        />
        <div className={estilos.botoes}>
          <Botao tipo="submit" carregando={enviando} textoCarregando="Salvando...">
            Salvar alterações
          </Botao>
          <Botao
            variante="secundaria"
            desabilitado={enviando}
            aoClicar={() => navegar("/perfil")}
          >
            Cancelar
          </Botao>
        </div>
      </form>

      {semAlteracao && <Alerta tipo="info" mensagem="Nenhuma alteração para salvar." />}
      {falha !== null && <Alerta tipo={falha.tipo} mensagem={falha.mensagem} />}
    </CartaoIngresso>
  );
}
