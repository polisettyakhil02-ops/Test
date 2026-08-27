import type { SystemRole } from "./common.types.js";

/** The minimal, non-sensitive identity attached to `req.user` by `auth.middleware.ts` — never the full Mongoose User document, so a handler can't accidentally leak `passwordHash` et al. downstream. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  roles: SystemRole[];
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

export {};
