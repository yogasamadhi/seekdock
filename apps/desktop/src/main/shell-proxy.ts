export function createDevelopmentProxyRequest(
  request: Request,
  developmentUrl: string,
): Request {
  const source = new URL(request.url);
  const upstream = new URL(
    `${source.pathname}${source.search}`,
    developmentUrl,
  );
  return new Request(upstream, {
    headers: request.headers,
    method: request.method,
  });
}

export async function fetchDevelopmentShellRequest(
  request: Request,
  developmentUrl: string,
  fetchUpstream: (request: Request) => Promise<Response>,
): Promise<Response> {
  try {
    return await fetchUpstream(
      createDevelopmentProxyRequest(request, developmentUrl),
    );
  } catch {
    return new Response(null, {
      status: 502,
      statusText: "Development renderer request was cancelled",
    });
  }
}
