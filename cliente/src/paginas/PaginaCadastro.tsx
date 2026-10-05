import { useRef, useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router";
import { Alerta } from "../componentes/Alerta.tsx";
import { Botao } from "../componentes/Botao.tsx";
import { CampoSenha } from "../componentes/CampoSenha.tsx";
import { CampoTexto } from "../componentes/CampoTexto.tsx";
import { CartaoIngresso } from "../componentes/CartaoIngresso.tsx";
import { LinkTexto } from "../componentes/LinkTexto.tsx";
import { useOperacoes } from "../contextos/use-operacoes.ts";
import { validarFormularioCadastro } from "../validacao/validacao-campos.ts";
import type { ErrosCadastro } from "../validacao/validacao-campos.ts";
import { useTituloPagina } from "./use-titulo-pagina.ts";
import estilos from "./PaginaAutenticacao.module.css";

interface FalhaExibida {
  tipo: "erro" | "aviso";
  mensagem: string;
  conflito: boolean;
}

export function PaginaCadastro() {
  useTituloPagina("Criar conta");
  const operacoes = useOperacoes();
  const navegar = useNavigate();

  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erros, setErros] = useState<ErrosCadastro>({});
  const [falha, setFalha] = useState<FalhaExibida | null>(null);
  const [enviando, setEnviando] = useState(false);

  const referenciaNome = useRef<HTMLInputElement>(null);
  const referenciaEmail = useRef<HTMLInputElement>(null);
  const referenciaSenha = useRef<HTMLInputElement>(null);
  const emEnvio = useRef(false);

  function alterarNome(valor: string) {
    setNome(valor);
    setErros((atuais) => ({ ...atuais, nome: undefined }));
  }

  function alterarEmail(valor: string) {
    setEmail(valor);
    setErros((atuais) => ({ ...atuais, email: undefined }));
  }

  function alterarSenha(valor: string) {
    setSenha(valor);
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

  function irParaLogin(emailInformado: string, mensagem?: string) {
    navegar("/login", { state: mensagem === undefined ? { email: emailInformado } : { email: emailInformado, mensagem } });
  }

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (emEnvio.current) {
      return;
    }
    setFalha(null);

    const validacao = validarFormularioCadastro({ nome, email, senha });
    if (!validacao.ok) {
      setErros(validacao.erros);
      focarPrimeiroInvalido(validacao.erros);
      return;
    }

    setErros({});
    emEnvio.current = true;
    setEnviando(true);
    try {
      const resultado = await operacoes.cadastrar(validacao.dados);
      if (resultado.ok) {
        irParaLogin(validacao.dados.email, "Conta criada. Faça login para continuar.");
        return;
      }
      const conflito = resultado.tipo === "http" && resultado.status === 409;
      setFalha({
        tipo: conflito ? "aviso" : "erro",
        mensagem: resultado.mensagem,
        conflito,
      });
    } finally {
      emEnvio.current = false;
      setEnviando(false);
    }
  }

  return (
    <CartaoIngresso
      rotulo="Novo por aqui?"
      titulo="Criar conta"
      descricao="Cadastre-se para acessar a Bilheteria Relâmpago."
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
          rotulo="Senha"
          valor={senha}
          aoAlterar={alterarSenha}
          autoComplete="new-password"
          desabilitado={enviando}
          ajuda="De 6 a 20 caracteres, somente letras sem acento e números."
          erro={erros.senha}
          referencia={referenciaSenha}
        />
        <Botao tipo="submit" carregando={enviando} textoCarregando="Criando conta...">
          Criar conta
        </Botao>
      </form>

      {falha !== null && <Alerta tipo={falha.tipo} mensagem={falha.mensagem} />}
      {falha !== null && falha.conflito && (
        <Botao variante="secundaria" aoClicar={() => irParaLogin(email)}>
          Ir para o login
        </Botao>
      )}

      <p className={estilos.rodape}>
        Já tem cadastro? <LinkTexto para="/login">Entrar</LinkTexto>
      </p>
    </CartaoIngresso>
  );
}
