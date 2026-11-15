import { assert, assertEquals, assertMatch } from "@std/assert";
import { iniciarServidorReal, type ServidorReal } from "./ambiente.ts";

export const PREFIXO = "/api/v1";
export const EMAIL_ADM = "adm@teste.com";
export const SENHA_ADM = "admin123";
export const NOME_ADM = "Admin";
export const SENHA_PADRAO = "SenhaColega1";

export interface OpcoesRequisicao {
  token?: string;
  corpo?: unknown;
  corpoBruto?: string;
  tipoConteudo?: string;
  autorizacao?: string;
}

export interface RespostaColega {
  status: number;
  cabecalhos: Headers;
  texto: string;
}

export interface SessaoColega {
  id: string;
  token: string;
  usuario: Record<string, unknown>;
  idUsuario: number;
}

export interface Contexto {
  servidor: ServidorReal;
  porta: number;
}

export async function comServidor(
  corpo: (contexto: Contexto) => Promise<void>,
): Promise<void> {
  const servidor = await iniciarServidorReal();
  try {
    await corpo({ servidor, porta: servidor.porta });
  } finally {
    await servidor.encerrar();
  }
}

export async function requisitar(
  porta: number,
  metodo: string,
  caminho: string,
  opcoes: OpcoesRequisicao = {},
): Promise<RespostaColega> {
  const cabecalhos = new Headers();
  let corpo: string | undefined;
  if (opcoes.corpoBruto !== undefined) {
    corpo = opcoes.corpoBruto;
  } else if (opcoes.corpo !== undefined) {
    corpo = JSON.stringify(opcoes.corpo);
  }
  if (corpo !== undefined) {
    cabecalhos.set("Content-Type", opcoes.tipoConteudo ?? "application/json");
  }
  if (opcoes.autorizacao !== undefined) {
    cabecalhos.set("Authorization", opcoes.autorizacao);
  } else if (opcoes.token !== undefined) {
    cabecalhos.set("Authorization", `Bearer ${opcoes.token}`);
  }
  const resposta = await fetch(
    `http://127.0.0.1:${porta}${PREFIXO}${caminho}`,
    {
      method: metodo,
      headers: cabecalhos,
      body: corpo,
    },
  );
  const texto = await resposta.text();
  return { status: resposta.status, cabecalhos: resposta.headers, texto };
}

export function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

export function lerObjeto(resposta: RespostaColega): Record<string, unknown> {
  const dados: unknown = JSON.parse(resposta.texto);
  assert(ehObjeto(dados), `corpo deveria ser objeto JSON: ${resposta.texto}`);
  return dados;
}

export function lerLista(resposta: RespostaColega): Record<string, unknown>[] {
  const dados: unknown = JSON.parse(resposta.texto);
  assert(
    Array.isArray(dados),
    `corpo deveria ser array JSON: ${resposta.texto}`,
  );
  return dados.map((item: unknown) => {
    assert(ehObjeto(item), "item da lista deveria ser objeto JSON");
    return item;
  });
}

export function conferirCors(resposta: RespostaColega): void {
  assertEquals(resposta.cabecalhos.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    resposta.cabecalhos.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    resposta.cabecalhos.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
}

export function conferirJson(resposta: RespostaColega): void {
  assertMatch(
    resposta.cabecalhos.get("Content-Type") ?? "",
    /^application\/json(\s*;\s*charset=utf-8)?$/i,
  );
}

export function conferirStatus(
  resposta: RespostaColega,
  status: number,
): void {
  assertEquals(
    resposta.status,
    status,
    `status inesperado, corpo: ${resposta.texto}`,
  );
  conferirCors(resposta);
}

export function conferirErro(
  resposta: RespostaColega,
  status: number,
): string {
  conferirStatus(resposta, status);
  conferirJson(resposta);
  const corpo = lerObjeto(resposta);
  const mensagem = corpo.mensagem;
  assert(typeof mensagem === "string", "o erro deveria ter mensagem em texto");
  assert(mensagem.trim().length > 0, "a mensagem de erro não pode ser vazia");
  return mensagem;
}

export function conferirSemCorpo(
  resposta: RespostaColega,
  status: number,
): void {
  conferirStatus(resposta, status);
  assertEquals(resposta.texto, "");
}

export function conferirUsuario(
  valor: unknown,
  esperado: { id?: number; nome?: string; email?: string; admin: boolean },
): Record<string, unknown> {
  assert(ehObjeto(valor), "o usuário deveria ser objeto JSON");
  assert(Number.isSafeInteger(valor.id), "id do usuário deveria ser inteiro");
  assertEquals(typeof valor.nome, "string");
  assertEquals(typeof valor.email, "string");
  assertEquals(valor.admin, esperado.admin);
  assertEquals("senha" in valor, false, "a senha nunca deve voltar");
  if (esperado.id !== undefined) {
    assertEquals(valor.id, esperado.id);
  }
  if (esperado.nome !== undefined) {
    assertEquals(valor.nome, esperado.nome);
  }
  if (esperado.email !== undefined) {
    assertEquals(valor.email, esperado.email);
  }
  return valor;
}

export function conferirProduto(
  valor: unknown,
  esperado: {
    id?: number;
    nome?: string;
    descricao?: string;
    quantidade?: number;
  } = {},
): Record<string, unknown> {
  assert(ehObjeto(valor), "o produto deveria ser objeto JSON");
  assert(Number.isSafeInteger(valor.id), "id do produto deveria ser inteiro");
  assertEquals(typeof valor.nome, "string");
  assertEquals(typeof valor.descricao, "string");
  assert(
    Number.isSafeInteger(valor.quantidade),
    "quantidade deveria ser inteiro",
  );
  for (const campo of ["id", "nome", "descricao", "quantidade"] as const) {
    if (esperado[campo] !== undefined) {
      assertEquals(valor[campo], esperado[campo]);
    }
  }
  return valor;
}

export function lerId(valor: Record<string, unknown>): number {
  const id = valor.id;
  assert(typeof id === "number" && Number.isSafeInteger(id));
  return id;
}

export function emailUnico(prefixo: string): string {
  return `${prefixo}${crypto.randomUUID().slice(0, 8)}@teste.com`;
}

export async function entrar(
  porta: number,
  email: string,
  senha: string,
): Promise<SessaoColega> {
  const resposta = await requisitar(porta, "POST", "/sessions", {
    corpo: { email, senha },
  });
  conferirStatus(resposta, 201);
  conferirJson(resposta);
  const corpo = lerObjeto(resposta);
  assert(typeof corpo.id === "string" && corpo.id.length > 0);
  assert(typeof corpo.token === "string" && corpo.token.length > 0);
  assert(ehObjeto(corpo.usuario));
  assertEquals(
    resposta.cabecalhos.get("Location"),
    `${PREFIXO}/sessions/${corpo.id}`,
  );
  return {
    id: corpo.id,
    token: corpo.token,
    usuario: corpo.usuario,
    idUsuario: lerId(corpo.usuario),
  };
}

export function entrarComoAdm(porta: number): Promise<SessaoColega> {
  return entrar(porta, EMAIL_ADM, SENHA_ADM);
}

export async function cadastrar(
  porta: number,
  prefixo: string,
  nome = "Colega Teste",
): Promise<{ id: number; email: string; nome: string }> {
  const email = emailUnico(prefixo);
  const resposta = await requisitar(porta, "POST", "/users", {
    corpo: { nome, email, senha: SENHA_PADRAO },
  });
  conferirStatus(resposta, 201);
  const corpo = conferirUsuario(lerObjeto(resposta), {
    nome,
    email,
    admin: false,
  });
  const id = lerId(corpo);
  assertEquals(resposta.cabecalhos.get("Location"), `${PREFIXO}/users/${id}`);
  return { id, email, nome };
}

export async function cadastrarEEntrar(
  porta: number,
  prefixo: string,
): Promise<SessaoColega & { email: string }> {
  const { email } = await cadastrar(porta, prefixo);
  const sessao = await entrar(porta, email, SENHA_PADRAO);
  return { ...sessao, email };
}

export async function criarProduto(
  porta: number,
  token: string,
  dados: { nome: string; descricao: string; quantidade: number },
): Promise<Record<string, unknown>> {
  const resposta = await requisitar(porta, "POST", "/products", {
    token,
    corpo: dados,
  });
  conferirStatus(resposta, 201);
  conferirJson(resposta);
  const produto = conferirProduto(lerObjeto(resposta), dados);
  assertEquals(
    resposta.cabecalhos.get("Location"),
    `${PREFIXO}/products/${lerId(produto)}`,
  );
  return produto;
}
