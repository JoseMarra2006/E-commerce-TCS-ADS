import { Hono } from "@hono/hono";

const app = new Hono();

app.notFound((c) => c.json({ mensagem: "Rota não encontrada." }, 404));

Deno.serve({ hostname: "0.0.0.0", port: 8080 }, app.fetch);