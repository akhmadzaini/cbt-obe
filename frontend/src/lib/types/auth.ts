import type { Role } from "./common";

export type User = {
  id: string;
  username: string;
  fullName: string;
  role: Role;
};
