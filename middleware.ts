import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(req: NextRequest) {
  const token = await getToken({
    req,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (token) {
    return NextResponse.next();
  }

  const loginUrl = new URL('/login', req.nextUrl.origin);
  const callbackUrl = `${req.nextUrl.pathname}${req.nextUrl.search}`;
  loginUrl.searchParams.set('callbackUrl', callbackUrl);

  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/courses/:path*', '/run/:path*', '/create/:path*', '/collection/:path*', '/profile/:path*'],
};
