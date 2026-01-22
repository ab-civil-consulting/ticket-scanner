export const config = {
  matcher: ['/((?!_vercel|assets/).*)'],
};

export default function middleware(request: Request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    try {
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = atob(base64Credentials);
      const [username, password] = credentials.split(':');

      if (username === 'admin' && password === 'admin') {
        return;
      }
    } catch {
      // Invalid auth header format
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Ticket Scanner"',
      'Content-Type': 'text/plain',
    },
  });
}
