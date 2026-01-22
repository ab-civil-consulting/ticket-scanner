export const config = {
  matcher: '/((?!_next/static|_next/image|favicon.ico|assets/).*)',
};

export default function middleware(request) {
  const authHeader = request.headers.get('authorization');

  if (authHeader) {
    const base64Credentials = authHeader.split(' ')[1];
    const credentials = atob(base64Credentials);
    const [username, password] = credentials.split(':');

    if (username === 'admin' && password === 'admin') {
      return;
    }
  }

  return new Response('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Ticket Scanner"',
    },
  });
}
