interface Env {
  ASSETS: { fetch(req: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // Cloudflare terminates TLS at the edge — check cf-visitor for original scheme
    const cfVisitor = request.headers.get("cf-visitor");
    const isHttp =
      url.protocol === "http:" ||
      (cfVisitor ? JSON.parse(cfVisitor).scheme === "http" : false);

    if (isHttp) {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
