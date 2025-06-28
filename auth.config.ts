import bcrypt from "bcryptjs";
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Github from "next-auth/providers/github";
import Google from "next-auth/providers/google";
import { db } from "@/lib/db";
import { LoginSchema } from "@/schemas";
import { getUserByEmail, getUserById } from "@/data/user";
import { getTwoFactorConfirmationByUserId } from "@/data/two-factor-confirmation";
import { getAccountByUserId } from "./data/account";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { UserStatus, UserRole } from "@prisma/client";

// 👇 Force Node.js runtime to avoid bcryptjs issues in Edge
export const runtime = 'nodejs';

export default {
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  events: {
    async linkAccount({ user }) {
      await db.user.update({
        where: { id: user.id },
        data: { emailVerified: new Date() },
      });
    },
  },
  providers: [
     Google({
       clientId: process.env.GOOGLE_CLIENT_ID,
       clientSecret: process.env.GOOGLE_CLIENT_SECRET,
     }),
     Github({
       clientId: process.env.GITHUB_CLIENT_ID,
       clientSecret: process.env.GITHUB_CLIENT_SECRET,
     }),
    Credentials({
      async authorize(credentials) {
        const validatedFields = LoginSchema.safeParse(credentials);
        if (!validatedFields.success) return null;

        const { email, password } = validatedFields.data;
        const user = await getUserByEmail(email);
        if (!user || !user.password) return null;

        const passwordsMatch = await bcrypt.compare(password, user.password);
        if (!passwordsMatch) return null;

        return user;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      // Allow OAuth users to sign in without email verification
      if (account?.provider !== "credentials") return true;

      if (!user?.id) {
        console.error("User ID is missing during sign in.");
        return false;
      }

      const existingUser = await getUserById(user.id);
      if (!existingUser) {
        console.error("User not found during sign in.");
        return false;
      }

      if (!existingUser.emailVerified) {
        console.warn("User tried to sign in without email verification.");
        return false;
      }

      if (existingUser.isTwoFactorEnabled) {
        const twoFactorConfirmation = await getTwoFactorConfirmationByUserId(existingUser.id);
        if (!twoFactorConfirmation) {
          console.warn("2FA confirmation missing.");
          return false;
        }

        // Delete two-factor confirmation for next login
        await db.twoFactorConfirmation.delete({
          where: { id: twoFactorConfirmation.id },
        });
      }

      return true;
    },
    async session({ token, session }) {
  if (token.sub && session.user) {
    session.user.id = token.sub;
  }
  if (session.user) {
    session.user.role = token.role as UserRole;
    session.user.status = token.status as UserStatus;
    session.user.isTwoFactorEnabled = token.isTwoFactorEnabled as boolean;
    session.user.isOAuth = token.isOAuth as boolean;
    session.user.name = token.name ?? "";
    session.user.email = token.email ?? "";  // ✅ Fix here
  }
  return session;
},
    async jwt({ token }) {
      if (!token.sub) return token;

      const existingUser = await getUserById(token.sub);
      if (!existingUser) return token;

      const existingAccount = await getAccountByUserId(existingUser.id);
      token.isOAuth = !!existingAccount;
      token.name = existingUser.name;
      token.email = existingUser.email;
      token.role = existingUser.role;
      token.status = existingUser.status;
      token.isTwoFactorEnabled = existingUser.isTwoFactorEnabled;

      return token;
    },
  },
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
} satisfies NextAuthConfig;
