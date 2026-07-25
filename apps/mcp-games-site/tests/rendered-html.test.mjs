import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html", host: "localhost" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the MCP Games flagship", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>MCP Games/);
  assert.match(html, /Make the next/);
  assert.match(html, /move/);
  assert.match(html, /Only what we can verify/);
  assert.match(html, /Start a server-backed run/);
  assert.doesNotMatch(html, /NOVA|Serotonin|BIOFEEDBACK|XP/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});
