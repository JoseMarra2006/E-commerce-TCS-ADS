import { assertEquals } from "@std/assert";
import {
  validarCorpoAtualizacaoParcial,
  validarCorpoCadastro,
  validarCorpoLogin,
  validarEmail,
  validarIdUsuario,
  validarNome,
  validarSenha,
} from "../src/modulos/usuarios/validacao-usuarios.ts";

const MENSAGEM_EMAIL_TAMANHO =
  "O campo email deve ter entre 5 e 30 caracteres.";
const MENSAGEM_EMAIL_PADRAO =
  'O campo email deve conter "@" e um domínio válido (ex.: nome@exemplo.com).';
const MENSAGEM_SENHA_TAMANHO =
  "O campo senha deve ter entre 6 e 20 caracteres.";
const MENSAGEM_SENHA_PADRAO =
  "O campo senha deve conter apenas letras sem acento e números, sem espaços ou caracteres especiais.";
const MENSAGEM_NOME_TAMANHO =
  "O campo nome deve ter entre 3 e 50 caracteres, sem contar espaços no início e no fim.";
const MENSAGEM_ID_INVALIDO =
  "O id do usuário na URL deve ser um número inteiro positivo.";
const MENSAGEM_UM_CAMPO =
  "Informe ao menos um dos campos: nome, email ou senha.";

const EMAIL_30 = "a".repeat(20) + "@teste.com";
const EMAIL_31 = "a".repeat(21) + "@teste.com";
const SENHA_20 = "a".repeat(20);
const SENHA_21 = "a".repeat(21);
const NOME_50 = "a".repeat(50);
const NOME_51 = "a".repeat(51);

Deno.test("validarEmail aceita 5 caracteres e recusa 4 por tamanho", () => {
  assertEquals(validarEmail("a@b.c"), { ok: true, dados: "a@b.c" });
  assertEquals(validarEmail("a@bc"), {
    ok: false,
    mensagem: MENSAGEM_EMAIL_TAMANHO,
  });
});

Deno.test("validarEmail aceita 30 caracteres e recusa 31 por tamanho", () => {
  assertEquals(validarEmail(EMAIL_30), { ok: true, dados: EMAIL_30 });
  assertEquals(validarEmail(EMAIL_31), {
    ok: false,
    mensagem: MENSAGEM_EMAIL_TAMANHO,
  });
});

Deno.test("validarEmail recusa formatos invalidos por padrao", () => {
  const invalidos = [
    "semarroba.com",
    "nome@dominio",
    "nome@.com",
    "nome @exemplo.com",
    "nome@@exemplo.com",
    "nome@ex@emplo.com",
  ];
  for (const invalido of invalidos) {
    assertEquals(validarEmail(invalido), {
      ok: false,
      mensagem: MENSAGEM_EMAIL_PADRAO,
    });
  }
});

Deno.test("validarEmail aceita maiusculas sem alterar", () => {
  assertEquals(validarEmail("NOME@EXEMPLO.COM"), {
    ok: true,
    dados: "NOME@EXEMPLO.COM",
  });
});

Deno.test("validarEmail nao aplica trim", () => {
  assertEquals(validarEmail(" nome@exemplo.com"), {
    ok: false,
    mensagem: MENSAGEM_EMAIL_PADRAO,
  });
});

Deno.test("validarEmail com 31 caracteres sem arroba retorna erro de tamanho", () => {
  const texto = "a".repeat(31);
  assertEquals(validarEmail(texto), {
    ok: false,
    mensagem: MENSAGEM_EMAIL_TAMANHO,
  });
});

Deno.test("validarSenha aceita 6 caracteres e recusa 5 por tamanho", () => {
  assertEquals(validarSenha("abc12"), {
    ok: false,
    mensagem: MENSAGEM_SENHA_TAMANHO,
  });
  assertEquals(validarSenha("abc123"), { ok: true, dados: "abc123" });
});

Deno.test("validarSenha aceita 20 caracteres e recusa 21 por tamanho", () => {
  assertEquals(validarSenha(SENHA_20), { ok: true, dados: SENHA_20 });
  assertEquals(validarSenha(SENHA_21), {
    ok: false,
    mensagem: MENSAGEM_SENHA_TAMANHO,
  });
});

Deno.test("validarSenha recusa caracteres fora do padrao", () => {
  const invalidas = [
    "senha 123",
    "senha@123",
    "sênha123",
    "senhaç12",
    "senha-123",
  ];
  for (const invalida of invalidas) {
    assertEquals(validarSenha(invalida), {
      ok: false,
      mensagem: MENSAGEM_SENHA_PADRAO,
    });
  }
});

Deno.test("validarSenha aceita letras maiusculas, minusculas e numeros", () => {
  assertEquals(validarSenha("SENHA123"), { ok: true, dados: "SENHA123" });
  assertEquals(validarSenha("senha123"), { ok: true, dados: "senha123" });
  assertEquals(validarSenha("123456"), { ok: true, dados: "123456" });
});

Deno.test("validarSenha nao aplica trim", () => {
  assertEquals(validarSenha(" abc123"), {
    ok: false,
    mensagem: MENSAGEM_SENHA_PADRAO,
  });
});

Deno.test("validarNome recusa 2 caracteres e aceita 3", () => {
  assertEquals(validarNome("Jo"), {
    ok: false,
    mensagem: MENSAGEM_NOME_TAMANHO,
  });
  assertEquals(validarNome("Ana"), { ok: true, dados: "Ana" });
});

Deno.test("validarNome aplica trim antes de validar e retornar", () => {
  assertEquals(validarNome("  Ana  "), { ok: true, dados: "Ana" });
});

Deno.test("validarNome recusa 2 caracteres apos o trim", () => {
  assertEquals(validarNome("  Jo  "), {
    ok: false,
    mensagem: MENSAGEM_NOME_TAMANHO,
  });
});

Deno.test("validarNome aceita 50 caracteres e recusa 51", () => {
  assertEquals(validarNome(NOME_50), { ok: true, dados: NOME_50 });
  assertEquals(validarNome(NOME_51), {
    ok: false,
    mensagem: MENSAGEM_NOME_TAMANHO,
  });
});

Deno.test("validarNome aceita 50 caracteres com espacos nas pontas", () => {
  assertEquals(validarNome(` ${NOME_50} `), { ok: true, dados: NOME_50 });
});

Deno.test("validarNome recusa texto somente com espacos", () => {
  assertEquals(validarNome("   "), {
    ok: false,
    mensagem: MENSAGEM_NOME_TAMANHO,
  });
});

Deno.test("validarNome conta caracteres com Array.from", () => {
  assertEquals(validarNome("Zé😀"), { ok: true, dados: "Zé😀" });
  assertEquals(Array.from("José").length, 4);
});

Deno.test("validarIdUsuario aceita valores validos", () => {
  assertEquals(validarIdUsuario("1"), { ok: true, dados: 1 });
  assertEquals(validarIdUsuario("123"), { ok: true, dados: 123 });
  assertEquals(validarIdUsuario("007"), { ok: true, dados: 7 });
});

Deno.test("validarIdUsuario recusa valores invalidos", () => {
  const invalidos = [
    "0",
    "-1",
    "1.5",
    "abc",
    " 1",
    "1 ",
    "",
    "1e3",
    "9007199254740993",
  ];
  for (const invalido of invalidos) {
    assertEquals(validarIdUsuario(invalido), {
      ok: false,
      mensagem: MENSAGEM_ID_INVALIDO,
    });
  }
});

Deno.test("validarCorpoCadastro aceita corpo valido e normaliza o nome", () => {
  const resultado = validarCorpoCadastro(
    JSON.stringify({
      nome: "  Ana  ",
      email: "ana@exemplo.com",
      senha: "abc123",
    }),
  );
  assertEquals(resultado, {
    ok: true,
    dados: { nome: "Ana", email: "ana@exemplo.com", senha: "abc123" },
  });
});

Deno.test("validarCorpoCadastro ignora campos desconhecidos", () => {
  const resultado = validarCorpoCadastro(
    JSON.stringify({
      id: 99,
      papel: "administrador",
      outro: "x",
      nome: "Ana",
      email: "ana@exemplo.com",
      senha: "abc123",
    }),
  );
  assertEquals(resultado, {
    ok: true,
    dados: { nome: "Ana", email: "ana@exemplo.com", senha: "abc123" },
  });
});

Deno.test("validarCorpoCadastro repassa mensagens de lerCorpoJson", () => {
  assertEquals(validarCorpoCadastro(null), {
    ok: false,
    mensagem: "O corpo da requisição é obrigatório.",
  });
  assertEquals(validarCorpoCadastro(""), {
    ok: false,
    mensagem: "O corpo da requisição é obrigatório.",
  });
  assertEquals(validarCorpoCadastro("{"), {
    ok: false,
    mensagem: "O corpo da requisição não é um JSON válido.",
  });
  assertEquals(validarCorpoCadastro("[]"), {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
  assertEquals(validarCorpoCadastro("null"), {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
  assertEquals(validarCorpoCadastro("123"), {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
  assertEquals(validarCorpoCadastro('"texto"'), {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});

Deno.test("validarCorpoCadastro exige cada campo", () => {
  assertEquals(
    validarCorpoCadastro(
      JSON.stringify({ email: "ana@exemplo.com", senha: "abc123" }),
    ),
    { ok: false, mensagem: "O campo nome é obrigatório." },
  );
  assertEquals(
    validarCorpoCadastro(JSON.stringify({ nome: "Ana", senha: "abc123" })),
    { ok: false, mensagem: "O campo email é obrigatório." },
  );
  assertEquals(
    validarCorpoCadastro(
      JSON.stringify({ nome: "Ana", email: "ana@exemplo.com" }),
    ),
    { ok: false, mensagem: "O campo senha é obrigatório." },
  );
});

Deno.test("validarCorpoCadastro recusa cada campo nulo", () => {
  assertEquals(
    validarCorpoCadastro(
      JSON.stringify({ nome: null, email: "ana@exemplo.com", senha: "abc123" }),
    ),
    { ok: false, mensagem: "O campo nome não pode ser nulo." },
  );
  assertEquals(
    validarCorpoCadastro(
      JSON.stringify({ nome: "Ana", email: null, senha: "abc123" }),
    ),
    { ok: false, mensagem: "O campo email não pode ser nulo." },
  );
  assertEquals(
    validarCorpoCadastro(
      JSON.stringify({ nome: "Ana", email: "ana@exemplo.com", senha: null }),
    ),
    { ok: false, mensagem: "O campo senha não pode ser nulo." },
  );
});

Deno.test("validarCorpoCadastro recusa cada campo com tipo errado", () => {
  const valoresErrados = [1, true, [1], { a: 1 }];
  for (const valor of valoresErrados) {
    assertEquals(
      validarCorpoCadastro(
        JSON.stringify({
          nome: valor,
          email: "ana@exemplo.com",
          senha: "abc123",
        }),
      ),
      { ok: false, mensagem: "O campo nome deve ser um texto." },
    );
    assertEquals(
      validarCorpoCadastro(
        JSON.stringify({ nome: "Ana", email: valor, senha: "abc123" }),
      ),
      { ok: false, mensagem: "O campo email deve ser um texto." },
    );
    assertEquals(
      validarCorpoCadastro(
        JSON.stringify({ nome: "Ana", email: "ana@exemplo.com", senha: valor }),
      ),
      { ok: false, mensagem: "O campo senha deve ser um texto." },
    );
  }
});

Deno.test("validarCorpoCadastro respeita a ordem nome, email, senha", () => {
  assertEquals(
    validarCorpoCadastro(JSON.stringify({ nome: 1, email: 2, senha: 3 })),
    { ok: false, mensagem: "O campo nome deve ser um texto." },
  );
  assertEquals(
    validarCorpoCadastro(JSON.stringify({ nome: "Ana", email: 2, senha: 3 })),
    { ok: false, mensagem: "O campo email deve ser um texto." },
  );
});

Deno.test("validarCorpoLogin aceita corpo valido e ignora campos extras", () => {
  const resultado = validarCorpoLogin(
    JSON.stringify({ nome: "Ana", email: "ana@exemplo.com", senha: "abc123" }),
  );
  assertEquals(resultado, {
    ok: true,
    dados: { email: "ana@exemplo.com", senha: "abc123" },
  });
});

Deno.test("validarCorpoLogin recusa email e senha ausentes, nulos, com tipo errado ou fora do formato", () => {
  assertEquals(validarCorpoLogin(JSON.stringify({ senha: "abc123" })), {
    ok: false,
    mensagem: "O campo email é obrigatório.",
  });
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: null, senha: "abc123" })),
    { ok: false, mensagem: "O campo email não pode ser nulo." },
  );
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: 1, senha: "abc123" })),
    { ok: false, mensagem: "O campo email deve ser um texto." },
  );
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: "invalido", senha: "abc123" })),
    { ok: false, mensagem: MENSAGEM_EMAIL_PADRAO },
  );
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: "ana@exemplo.com" })),
    {
      ok: false,
      mensagem: "O campo senha é obrigatório.",
    },
  );
  assertEquals(
    validarCorpoLogin(
      JSON.stringify({ email: "ana@exemplo.com", senha: null }),
    ),
    { ok: false, mensagem: "O campo senha não pode ser nulo." },
  );
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: "ana@exemplo.com", senha: 1 })),
    { ok: false, mensagem: "O campo senha deve ser um texto." },
  );
  assertEquals(
    validarCorpoLogin(JSON.stringify({ email: "ana@exemplo.com", senha: "a" })),
    { ok: false, mensagem: MENSAGEM_SENHA_TAMANHO },
  );
});

Deno.test("validarCorpoAtualizacaoParcial exige ao menos um campo relevante", () => {
  assertEquals(validarCorpoAtualizacaoParcial("{}"), {
    ok: false,
    mensagem: MENSAGEM_UM_CAMPO,
  });
  assertEquals(validarCorpoAtualizacaoParcial(JSON.stringify({ foo: 1 })), {
    ok: false,
    mensagem: MENSAGEM_UM_CAMPO,
  });
  assertEquals(validarCorpoAtualizacaoParcial(JSON.stringify({ id: 5 })), {
    ok: false,
    mensagem: MENSAGEM_UM_CAMPO,
  });
  assertEquals(
    validarCorpoAtualizacaoParcial(JSON.stringify({ papel: "administrador" })),
    { ok: false, mensagem: MENSAGEM_UM_CAMPO },
  );
});

Deno.test("validarCorpoAtualizacaoParcial retorna somente as chaves presentes", () => {
  const resultado = validarCorpoAtualizacaoParcial(
    JSON.stringify({ nome: "  Ana  " }),
  );
  assertEquals(resultado, { ok: true, dados: { nome: "Ana" } });
});

Deno.test("validarCorpoAtualizacaoParcial valida o campo senha quando presente", () => {
  assertEquals(
    validarCorpoAtualizacaoParcial(JSON.stringify({ senha: "abc" })),
    {
      ok: false,
      mensagem: MENSAGEM_SENHA_TAMANHO,
    },
  );
});

Deno.test("validarCorpoAtualizacaoParcial recusa nome nulo", () => {
  assertEquals(validarCorpoAtualizacaoParcial(JSON.stringify({ nome: null })), {
    ok: false,
    mensagem: "O campo nome não pode ser nulo.",
  });
});

Deno.test("validarCorpoAtualizacaoParcial recusa email fora do padrao", () => {
  assertEquals(
    validarCorpoAtualizacaoParcial(JSON.stringify({ email: "invalido" })),
    { ok: false, mensagem: MENSAGEM_EMAIL_PADRAO },
  );
});

Deno.test("validarCorpoAtualizacaoParcial aceita os tres campos e normaliza o nome", () => {
  const resultado = validarCorpoAtualizacaoParcial(
    JSON.stringify({
      nome: "  Ana  ",
      email: "ana@exemplo.com",
      senha: "abc123",
    }),
  );
  assertEquals(resultado, {
    ok: true,
    dados: { nome: "Ana", email: "ana@exemplo.com", senha: "abc123" },
  });
});

Deno.test("validarCorpoAtualizacaoParcial repassa mensagens de lerCorpoJson", () => {
  assertEquals(validarCorpoAtualizacaoParcial(null), {
    ok: false,
    mensagem: "O corpo da requisição é obrigatório.",
  });
  assertEquals(validarCorpoAtualizacaoParcial("[]"), {
    ok: false,
    mensagem: "O corpo da requisição deve ser um objeto JSON.",
  });
});
