import { Role } from "@prisma/client";
import { DefaultSession, DefaultUser } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      officeId: string;
      role: Role;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    officeId: string;
    role: Role;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    officeId: string;
    role: Role;
  }
}
