import { assert, assertEquals } from "@std/assert";

const TIPO_JSON = "application/json; charset=utf-8";
const PADRAO_UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PADRAO_CHAVE_SENSIVEL =
  /"(senha|senhaHash|senhaSalt|senha_hash|senha_salt|hash|salt|papel)"\s*:/;

export interface RespostaLida<T> {
  texto: string;
  corpo: T;
}

export interface CorpoUsuario {
  id: number;
  nome: string;
  email: string;
  admin: boolean;
}

export interface CorpoProduto {
  id: number;
  nome: string;
  descricao: string;
  quantidade: number;
}

export interface CorpoSessao {
  id: string;
  token: string;
  usuario: CorpoUsuario;
}

export function verificarCors(resposta: Response): void {
  assertEquals(resposta.headers.get("Access-Control-Allow-Origin"), "*");
  assertEquals(
    resposta.headers.get("Access-Control-Allow-Methods"),
    "GET, POST, PUT, PATCH, DELETE, OPTIONS",
  );
  assertEquals(
    resposta.headers.get("Access-Control-Allow-Headers"),
    "Content-Type, Authorization",
  );
}

async function lerJson(resposta: Response): Promise<RespostaLida<unknown>> {
  verificarCors(resposta);
  assertEquals(resposta.headers.get("Content-Type"), TIPO_JSON);
  const texto = await resposta.text();
  return { texto, corpo: JSON.parse(texto) };
}

function ehObjeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function verificarCorpoUsuario(corpo: unknown): CorpoUsuario {
  assert(ehObjeto(corpo), "o corpo de usuário deve ser um objeto");
  assertEquals(Object.keys(corpo), ["id", "nome", "email", "admin"]);
  const { id, nome, email, admin } = corpo;
  assert(
    typeof id === "number" && Number.isInteger(id) && id > 0,
    "id deve ser inteiro positivo",
  );
  assert(typeof nome === "string", "nome deve ser texto");
  assert(typeof email === "string", "email deve ser texto");
  assert(typeof admin === "boolean", "admin deve ser booleano");
  return { id, nome, email, admin };
}

export function verificarCorpoProduto(corpo: unknown): CorpoProduto {
  assert(ehObjeto(corpo), "o corpo de produto deve ser um objeto");
  assertEquals(Object.keys(corpo), ["id", "nome", "descricao", "quantidade"]);
  const { id, nome, descricao, quantidade } = corpo;
  assert(
    typeof id === "number" && Number.isInteger(id) && id > 0,
    "id deve ser inteiro positivo",
  );
  assert(typeof nome === "string", "nome deve ser texto");
  assert(typeof descricao === "string", "descricao deve ser texto");
  assert(
    typeof quantidade === "number" && Number.isInteger(quantidade) &&
      quantidade >= 0 && quantidade <= 1000000,
    "quantidade deve ser inteiro entre 0 e 1000000",
  );
  return { id, nome, descricao, quantidade };
}

export async function verificarRespostaProduto(
  resposta: Response,
  status: number,
  esperado: Partial<CorpoProduto> = {},
): Promise<RespostaLida<CorpoProduto>> {
  assertEquals(resposta.status, status);
  const lida = await lerJson(resposta);
  const produto = verificarCorpoProduto(lida.corpo);
  for (const chave of ["id", "nome", "descricao", "quantidade"] as const) {
    if (esperado[chave] !== undefined) {
      assertEquals(produto[chave], esperado[chave]);
    }
  }
  return { texto: lida.texto, corpo: produto };
}

export async function verificarRespostaListaProdutos(
  resposta: Response,
): Promise<RespostaLida<CorpoProduto[]>> {
  assertEquals(resposta.status, 200);
  const lida = await lerJson(resposta);
  assert(Array.isArray(lida.corpo), "a lista deve ser um array");
  const produtos = lida.corpo.map(verificarCorpoProduto);
  for (let i = 1; i < produtos.length; i++) {
    assert(produtos[i - 1].id < produtos[i].id, "ids devem ser crescentes");
  }
  return { texto: lida.texto, corpo: produtos };
}

export async function verificarRespostaErro(
  resposta: Response,
  status: number,
  mensagemEsperada?: string,
): Promise<RespostaLida<{ mensagem: string }>> {
  assertEquals(resposta.status, status);
  const lida = await lerJson(resposta);
  assert(ehObjeto(lida.corpo), "o corpo de erro deve ser um objeto");
  assertEquals(Object.keys(lida.corpo), ["mensagem"]);
  const mensagem = lida.corpo.mensagem;
  assert(
    typeof mensagem === "string" && mensagem.length > 0,
    "mensagem deve ser um texto não vazio",
  );
  if (mensagemEsperada !== undefined) {
    assertEquals(mensagem, mensagemEsperada);
  }
  return { texto: lida.texto, corpo: { mensagem } };
}

export async function verificarRespostaUsuario(
  resposta: Response,
  status: number,
  esperado: Partial<CorpoUsuario> = {},
): Promise<RespostaLida<CorpoUsuario>> {
  assertEquals(resposta.status, status);
  const lida = await lerJson(resposta);
  const usuario = verificarCorpoUsuario(lida.corpo);
  if (esperado.id !== undefined) {
    assertEquals(usuario.id, esperado.id);
  }
  if (esperado.nome !== undefined) {
    assertEquals(usuario.nome, esperado.nome);
  }
  if (esperado.email !== undefined) {
    assertEquals(usuario.email, esperado.email);
  }
  if (esperado.admin !== undefined) {
    assertEquals(usuario.admin, esperado.admin);
  }
  return { texto: lida.texto, corpo: usuario };
}

export async function verificarRespostaSessao(
  resposta: Response,
): Promise<RespostaLida<CorpoSessao>> {
  assertEquals(resposta.status, 201);
  const lida = await lerJson(resposta);
  assert(ehObjeto(lida.corpo), "o corpo de sessão deve ser um objeto");
  assertEquals(Object.keys(lida.corpo), ["id", "token", "usuario"]);
  const { id, token, usuario } = lida.corpo;
  assert(typeof id === "string" && PADRAO_UUID.test(id), "id deve ser UUID");
  assert(
    typeof token === "string" && token.split(".").length === 3 &&
      token.split(".").every((parte) => parte.length > 0),
    "token deve ter três partes",
  );
  assertEquals(resposta.headers.get("Location"), `/api/v1/sessions/${id}`);
  assertEquals(resposta.headers.get("Cache-Control"), "no-store");
  return {
    texto: lida.texto,
    corpo: { id, token, usuario: verificarCorpoUsuario(usuario) },
  };
}

export async function verificarRespostaVazia(
  resposta: Response,
): Promise<RespostaLida<null>> {
  assertEquals(resposta.status, 204);
  verificarCors(resposta);
  assertEquals(resposta.headers.get("Content-Type"), null);
  const texto = await resposta.text();
  assertEquals(texto, "");
  return { texto, corpo: null };
}

export function verificarSemDadosSensiveis(
  texto: string,
  senhasUsadas: string[],
): void {
  for (const senha of senhasUsadas) {
    assertEquals(texto.includes(senha), false, "a resposta contém uma senha");
  }
  assertEquals(
    PADRAO_CHAVE_SENSIVEL.test(texto),
    false,
    "a resposta contém uma chave sensível",
  );
}
