import NextAuth, { type DefaultSession } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { verifyCRMLogin, getCRMUser } from '@/infrastructure/auth/CRMUserRepository';
import { UserRole } from '@/domain/value-objects/UserRole';

declare module 'next-auth' {
  interface User {
    role?: UserRole;
  }
  interface Session {
    user: {
      role?: UserRole;
    } & DefaultSession['user'];
  }
}

export const { handlers, signIn, signOut, auth } = NextAuth({
  trustHost: true,

  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = (credentials?.email as string)?.trim();
        const password = credentials?.password as string;
        if (!email || !password) return null;

        const crmUser = await verifyCRMLogin(email, password);
        if (!crmUser) return null;

        return {
          id: crmUser.email,
          email: crmUser.email,
          name: crmUser.name,
          role: crmUser.role,
        };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On first sign-in, user object is present
      if (user) {
        token['role'] = user.role;
        token['name'] = user.name;
      }
      // Fallback: if role not yet in token, fetch from CRM
      if (!token['role'] && token.email) {
        const crmUser = await getCRMUser(token.email as string);
        if (crmUser) token['role'] = crmUser.role;
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.role = token['role'] as UserRole | undefined;
        session.user.name = token['name'] as string | undefined;
      }
      return session;
    },
  },

  pages: {
    signIn: '/login',
    error: '/login',
  },

  session: {
    strategy: 'jwt',
  },
});
