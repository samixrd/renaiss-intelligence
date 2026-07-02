/**
 * Vercel Serverless SSR handler for TanStack Start.
 *
 * This function bridges Vercel's Node.js serverless runtime with
 * TanStack Start's Web-standard fetch() handler.  Vercel sends
 * Node.js IncomingMessage/ServerResponse objects, so we convert them
 * to/from the Web Request/Response used by TanStack Start.
 */

export default async function handler(req, res) {
  try {
    // Import the compiled TanStack Start server entry.
    const server = await import("../dist/server/server.js");
    const fetchHandler = server.default?.fetch ?? server.default?.default?.fetch;

    if (!fetchHandler) {
      res.statusCode = 500;
      res.end("SSR server entry not found");
      return;
    }

    // Build a Web Request from the Node.js IncomingMessage.
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const host = req.headers["x-forwarded-host"] || req.headers.host || "localhost";
    const url = new URL(req.url || "/", `${protocol}://${host}`);

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value.join(", ") : value);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const webRequest = new Request(url.toString(), {
      method: req.method,
      headers,
      body: hasBody ? req : undefined,
      duplex: hasBody ? "half" : undefined,
    });

    // Call TanStack Start's fetch handler.
    const webResponse = await fetchHandler(webRequest, {}, {});

    // Write the Web Response back to the Node.js ServerResponse.
    res.statusCode = webResponse.status;
    webResponse.headers.forEach((value, key) => {
      res.setHeader(key, value);
    });

    if (webResponse.body) {
      const reader = webResponse.body.getReader();
      const pump = async () => {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          res.write(value);
        }
        res.end();
      };
      await pump();
    } else {
      const text = await webResponse.text();
      res.end(text);
    }
  } catch (error) {
    console.error("SSR handler error:", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/html; charset=utf-8");
    res.end(`<!DOCTYPE html><html><body><h1>500 — Server Error</h1><pre>${String(error)}</pre></body></html>`);
  }
}
