function montarComando(url: string): Deno.Command {
  if (Deno.build.os === "windows") {
    return new Deno.Command("cmd", {
      args: ["/c", "start", "", url],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    });
  }

  if (Deno.build.os === "darwin") {
    return new Deno.Command("open", {
      args: [url],
      stdin: "null",
      stdout: "null",
      stderr: "null",
    });
  }

  return new Deno.Command("xdg-open", {
    args: [url],
    stdin: "null",
    stdout: "null",
    stderr: "null",
  });
}

export async function abrirNavegador(url: string): Promise<boolean> {
  try {
    const comando = montarComando(url);
    const resultado = await comando.output();
    return resultado.success;
  } catch {
    return false;
  }
}
