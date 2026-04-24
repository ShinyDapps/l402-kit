const MINTLIFY_ORIGIN = "https://shinydapps-bd9fa40b.mintlify.app";

export default {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Strip /docs prefix and proxy to Mintlify
    const mintlifyPath = url.pathname.replace(/^\/docs/, "") || "/";
    const target = `${MINTLIFY_ORIGIN}${mintlifyPath}${url.search}`;

    const proxied = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
      redirect: "follow",
    });

    const response = await fetch(proxied);

    // Rewrite any absolute Mintlify URLs in HTML responses back to l402kit.com/docs
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/html")) {
      let body = await response.text();
      body = body.replaceAll(MINTLIFY_ORIGIN, "https://l402kit.com/docs");
      return new Response(body, {
        status: response.status,
        headers: response.headers,
      });
    }

    return response;
  },
};
