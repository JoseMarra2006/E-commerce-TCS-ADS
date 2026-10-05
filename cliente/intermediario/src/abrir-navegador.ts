function montarComando(url: string): Deno.Command {
  const opcoes = { stdin: "null", stdout: "null", stderr: "null" } as const;

  if (Deno.build.os === "windows") {
    return new Deno.Command("cmd", { args: ["/c", "start", "", url], ...opcoes });
  }

  if (Deno.build.os === "darwin") {
    return new Deno.Command("open", { args: [url], ...opcoes });
  }

  return new Deno.Command("xdg-open", { args: [url], ...opcoes });
}

export async function abrirNavegador(url: string): Promise<boolean> {
  try {
    const resultado = await montarComando(url).output();
    return resultado.success;
  } catch {
    return false;
  }
}
