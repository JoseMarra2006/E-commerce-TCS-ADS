import "./auxiliares/vigia-arquivos-reais.ts";
import { assert, assertEquals, assertThrows } from "@std/assert";
import { criarCartaoLogados } from "../src/painel/publico/logados-cartao.js";
import {
  TEXTO_DESATUALIZADO,
  TEXTO_INDISPONIVEL,
  TEXTO_PARADO,
  TEXTO_VAZIO,
} from "../src/painel/publico/logados-visao.js";

const PROIBIDO = "HTML proibido no cartão de logados.";

class ElementoFalso {
  readonly tagName: string;
  filhos: ElementoFalso[] = [];
  texto = "";
  hidden = false;
  trocasDeFilhos = 0;
  readonly atributos = new Map<string, string>();
  readonly classes = new Set<string>();
  readonly classList = {
    add: (...nomes: string[]) => nomes.forEach((n) => this.classes.add(n)),
    remove: (...nomes: string[]) =>
      nomes.forEach((n) => this.classes.delete(n)),
    contains: (nome: string) => this.classes.has(nome),
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  get textContent(): string {
    return this.filhos.length > 0
      ? this.filhos.map((filho) => filho.textContent).join("")
      : this.texto;
  }

  set textContent(valor: string) {
    this.filhos = [];
    this.texto = String(valor);
  }

  append(...nos: unknown[]): void {
    for (const no of nos) {
      if (!(no instanceof ElementoFalso)) {
        throw new Error("Só elementos podem ser anexados.");
      }
      this.filhos.push(no);
    }
  }

  replaceChildren(...nos: unknown[]): void {
    this.trocasDeFilhos++;
    this.filhos = [];
    this.append(...nos);
  }

  setAttribute(nome: string, valor: string): void {
    if (/^on/i.test(nome) || nome.toLowerCase() === "style") {
      throw new Error(PROIBIDO);
    }
    this.atributos.set(nome, String(valor));
  }

  get innerHTML(): string {
    throw new Error(PROIBIDO);
  }

  set innerHTML(_valor: string) {
    throw new Error(PROIBIDO);
  }

  get outerHTML(): string {
    throw new Error(PROIBIDO);
  }

  set outerHTML(_valor: string) {
    throw new Error(PROIBIDO);
  }

  insertAdjacentHTML(): void {
    throw new Error(PROIBIDO);
  }
}

class DocumentoFalso {
  readonly criados: ElementoFalso[] = [];

  createElement(tag: string): ElementoFalso {
    const elemento = new ElementoFalso(tag);
    this.criados.push(elemento);
    return elemento;
  }

  write(): void {
    throw new Error(PROIBIDO);
  }
}

interface Elementos {
  contador: ElementoFalso;
  mensagem: ElementoFalso;
  aviso: ElementoFalso;
  areaTabela: ElementoFalso;
  corpo: ElementoFalso;
}

function montar() {
  const documento = new DocumentoFalso();
  const elementos: Elementos = {
    contador: new ElementoFalso("p"),
    mensagem: new ElementoFalso("p"),
    aviso: new ElementoFalso("p"),
    areaTabela: new ElementoFalso("div"),
    corpo: new ElementoFalso("tbody"),
  };
  const cartao = criarCartaoLogados(documento, elementos);
  return { documento, elementos, cartao };
}

function usuario(id: number, nome: string, email: string, tipo = "comum") {
  return {
    id,
    nome,
    email,
    tipo,
    sessoes: id,
    desde: new Date(2026, 0, 5, 7, 8, 9).toISOString(),
  };
}

function evento(usuarios: unknown[], estado = "disponivel"): string {
  return JSON.stringify({ estado, usuarios, atualizadoEm: null });
}

function textosDasLinhas(corpo: ElementoFalso): string[][] {
  return corpo.filhos.map((linha) =>
    linha.filhos.map((celula) => celula.textContent)
  );
}

function conferirExclusividade(elementos: Elementos): void {
  assert(
    elementos.mensagem.hidden !== elementos.areaTabela.hidden,
    "tabela e mensagem nunca visíveis ao mesmo tempo",
  );
}

Deno.test("o DOM simulado recusa qualquer HTML", () => {
  const elemento = new ElementoFalso("td");
  assertThrows(() => {
    elemento.innerHTML = "<b>x</b>";
  });
  assertThrows(() => {
    elemento.outerHTML = "<b>x</b>";
  });
  assertThrows(() => elemento.insertAdjacentHTML());
  assertThrows(() => elemento.setAttribute("onclick", "x"));
  assertThrows(() => elemento.setAttribute("style", "x"));
});

Deno.test("estado inicial: servidor parado, sem tabela", () => {
  const { elementos, documento } = montar();
  assertEquals(elementos.mensagem.textContent, TEXTO_PARADO);
  assertEquals(elementos.mensagem.hidden, false);
  assertEquals(elementos.areaTabela.hidden, true);
  assertEquals(elementos.aviso.hidden, true);
  assertEquals(elementos.contador.textContent, "Nenhum usuário logado");
  assertEquals(elementos.corpo.filhos, []);
  assertEquals(documento.criados, []);
});

Deno.test("texto de usuário aparece literalmente, só por textContent, sem criar elementos extras", () => {
  const { elementos, documento, cartao } = montar();
  cartao.definirStatusServidor("em_execucao");
  const nomes = [
    "<img src=x onerror=alert(1)>",
    "<script>alert(1)</script>",
    "&amp; &lt;b&gt;",
    "Aspas \"duplas\" e 'simples'",
    "Emoji 🚀👩🏽‍💻",
    "Quebra\nde linha",
    "N".repeat(50),
  ];
  const usuarios = nomes.map((nome, i) =>
    usuario(
      i + 1,
      nome,
      `${"e".repeat(20)}${i}@x.com.br`,
      i === 0 ? "administrador" : "comum",
    )
  );
  usuarios.push(usuario(99, "Trinta", "abcdefghijklmnopqrstuvwxyz@x.c"));
  assertEquals(usuarios.at(-1)?.email.length, 30);

  assertEquals(cartao.receberEvento(evento(usuarios)), true);
  assertEquals(elementos.areaTabela.hidden, false);
  assertEquals(elementos.mensagem.hidden, true);
  conferirExclusividade(elementos);
  assertEquals(
    elementos.contador.textContent,
    `${usuarios.length} usuários logados`,
  );

  const linhas = textosDasLinhas(elementos.corpo);
  assertEquals(linhas.length, usuarios.length);
  linhas.forEach((celulas, i) => {
    assertEquals(celulas, [
      usuarios[i].nome,
      usuarios[i].email,
      i === 0 ? "Administrador" : "Comum",
      String(usuarios[i].sessoes),
      "05/01/2026 07:08:09",
    ]);
  });
  assertEquals(documento.criados.length, usuarios.length * 7);
  const tags = new Set(documento.criados.map((e) => e.tagName));
  assertEquals([...tags].sort(), ["SPAN", "TD", "TR"]);
  for (const linha of elementos.corpo.filhos) {
    assertEquals(linha.filhos.length, 5);
    for (const celula of linha.filhos) {
      for (const filho of celula.filhos) {
        assertEquals(filho.tagName, "SPAN");
        assertEquals(filho.filhos, []);
      }
    }
  }
  const seloAdm = elementos.corpo.filhos[0].filhos[2].filhos[0];
  assert(seloAdm.classList.contains("selo-tipo-administrador"));
  assert(seloAdm.classList.contains("selo-tipo"));
  const seloComum = elementos.corpo.filhos[1].filhos[2].filhos[0];
  assertEquals(seloComum.classList.contains("selo-tipo-administrador"), false);
  assert(
    elementos.corpo.filhos[0].filhos[3].classList.contains("coluna-numero"),
  );
});

Deno.test("evento idêntico não reconstrói o tbody; evento diferente reconstrói", () => {
  const { elementos, cartao } = montar();
  cartao.definirStatusServidor("em_execucao");
  const primeiro = evento([usuario(1, "Ana", "ana@x.com")]);
  cartao.receberEvento(primeiro);
  const trocas = elementos.corpo.trocasDeFilhos;
  assertEquals(cartao.receberEvento(primeiro), false);
  assertEquals(cartao.receberEvento(primeiro), false);
  assertEquals(elementos.corpo.trocasDeFilhos, trocas);
  const mesmaListaOutroTexto = JSON.stringify({
    estado: "disponivel",
    usuarios: [usuario(1, "Ana", "ana@x.com")],
    atualizadoEm: "2026-01-01T00:00:00.000Z",
  });
  assertEquals(cartao.receberEvento(mesmaListaOutroTexto), true);
  assertEquals(elementos.corpo.trocasDeFilhos, trocas);
  assertEquals(
    cartao.receberEvento(evento([usuario(1, "Ana Nova", "ana@x.com")])),
    true,
  );
  assertEquals(elementos.corpo.trocasDeFilhos, trocas + 1);
  assertEquals(textosDasLinhas(elementos.corpo)[0][0], "Ana Nova");
});

Deno.test("cheia → vazia → indisponível → parada alterna as regiões corretas", () => {
  const { elementos, cartao } = montar();
  cartao.definirStatusServidor("em_execucao");

  cartao.receberEvento(
    evento([usuario(1, "Ana", "ana@x.com"), usuario(2, "Bia", "bia@x.com")]),
  );
  assertEquals(elementos.areaTabela.hidden, false);
  assertEquals(elementos.corpo.filhos.length, 2);
  assertEquals(elementos.contador.textContent, "2 usuários logados");
  conferirExclusividade(elementos);

  cartao.receberEvento(evento([]));
  assertEquals(elementos.areaTabela.hidden, true);
  assertEquals(elementos.mensagem.textContent, TEXTO_VAZIO);
  assertEquals(elementos.corpo.filhos, []);
  assertEquals(elementos.contador.textContent, "Nenhum usuário logado");
  conferirExclusividade(elementos);

  cartao.receberEvento(evento([usuario(1, "Ana", "ana@x.com")]));
  assertEquals(elementos.contador.textContent, "1 usuário logado");
  cartao.receberEvento(evento([], "indisponivel"));
  assertEquals(elementos.areaTabela.hidden, true);
  assertEquals(elementos.mensagem.textContent, TEXTO_INDISPONIVEL);
  assertEquals(elementos.corpo.filhos, []);
  conferirExclusividade(elementos);

  cartao.receberEvento(evento([usuario(1, "Ana", "ana@x.com")]));
  assertEquals(elementos.corpo.filhos.length, 1);
  cartao.definirStatusServidor("parada");
  assertEquals(elementos.areaTabela.hidden, true);
  assertEquals(elementos.mensagem.textContent, TEXTO_PARADO);
  assertEquals(elementos.corpo.filhos, []);
  assertEquals(elementos.contador.textContent, "Nenhum usuário logado");
  conferirExclusividade(elementos);

  cartao.definirStatusServidor("em_execucao");
  assertEquals(elementos.corpo.filhos.length, 1);
  conferirExclusividade(elementos);
});

Deno.test("conexão interrompida mantém a lista marcada como desatualizada; reconexão corrige", () => {
  const { elementos, cartao } = montar();
  cartao.definirStatusServidor("em_execucao");
  const lista = evento([usuario(1, "Ana", "ana@x.com")]);
  cartao.receberEvento(lista);
  const trocas = elementos.corpo.trocasDeFilhos;

  cartao.definirConexao(false);
  assertEquals(elementos.aviso.hidden, false);
  assertEquals(elementos.aviso.textContent, TEXTO_DESATUALIZADO);
  assert(elementos.areaTabela.classList.contains("tabela-desatualizada"));
  assertEquals(elementos.areaTabela.hidden, false);
  assertEquals(elementos.corpo.filhos.length, 1);
  assertEquals(elementos.corpo.trocasDeFilhos, trocas);

  cartao.receberEvento(lista);
  assertEquals(elementos.aviso.hidden, true);
  assertEquals(elementos.aviso.textContent, "");
  assertEquals(
    elementos.areaTabela.classList.contains("tabela-desatualizada"),
    false,
  );
  assertEquals(elementos.corpo.trocasDeFilhos, trocas);

  cartao.definirConexao(false);
  cartao.receberEvento(evento([]));
  assertEquals(elementos.aviso.hidden, true);
  assertEquals(elementos.mensagem.textContent, TEXTO_VAZIO);
});

Deno.test("eventos inválidos são ignorados e o último estado válido permanece", () => {
  const { elementos, cartao } = montar();
  cartao.definirStatusServidor("em_execucao");
  cartao.receberEvento(evento([usuario(1, "Ana", "ana@x.com")]));
  const trocas = elementos.corpo.trocasDeFilhos;
  for (
    const invalido of [
      "{",
      "",
      "null",
      JSON.stringify({ estado: "outro", usuarios: [] }),
      JSON.stringify({ estado: "disponivel", usuarios: "x" }),
      undefined,
      42,
    ]
  ) {
    assertEquals(cartao.receberEvento(invalido), false);
  }
  assertEquals(elementos.corpo.trocasDeFilhos, trocas);
  assertEquals(textosDasLinhas(elementos.corpo)[0][0], "Ana");

  cartao.receberEvento(
    evento([{ nome: "sem id" }, usuario(2, "Bia", "bia@x.com")]),
  );
  assertEquals(textosDasLinhas(elementos.corpo).map((l) => l[0]), ["Bia"]);
});

Deno.test("elementos ausentes ou quebrados nunca fazem o cartão lançar", () => {
  const documento = new DocumentoFalso();
  const cartao = criarCartaoLogados(documento, {
    contador: null,
    mensagem: null,
    aviso: null,
    areaTabela: null,
    corpo: null,
  });
  cartao.definirStatusServidor("em_execucao");
  cartao.definirConexao(false);
  assertEquals(
    cartao.receberEvento(evento([usuario(1, "Ana", "ana@x.com")])),
    false,
  );
  const semElementos = criarCartaoLogados(documento, undefined);
  semElementos.receberEvento("{");
  semElementos.definirStatusServidor(undefined);
});
