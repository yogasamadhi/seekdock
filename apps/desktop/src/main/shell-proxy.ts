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
