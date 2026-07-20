interface Env {
  ASSETS: Fetcher
  FLY_BACKEND_URL: string
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith("/api/")) {
      try {
        const target = new URL(url.pathname + url.search, env.FLY_BACKEND_URL)
        console.log(`proxying ${request.method} ${url.pathname} -> ${target}`)
        return await fetch(new Request(target, request))
      } catch (err) {
        console.log(`proxy failed for ${url.pathname}: ${err}`)
        return new Response(
          JSON.stringify({ detail: "Backend unreachable. Try again shortly." }),
          { status: 502, headers: { "Content-Type": "application/json" } },
        )
      }
    }

    return env.ASSETS.fetch(request)
  },
}
