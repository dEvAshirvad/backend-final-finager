/** User from auth API (RFC 3339 date-time strings) */
export interface User {
  id: string;
  email: string;
  name: string;
  image?: string;
  role?: string;
  emailVerified: boolean;
  banned: boolean;
  banReason?: string;
  banExpires?: string;
  createdAt: string;
  updatedAt: string;
  caId?: string;
  isOnboarded: boolean;
}

/** Session from auth API (RFC 3339 date-time strings) */
export interface Session {
  id: string;
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  impersonatedBy?: string;
  ipAddress?: string;
  userAgent?: string;
  activeOrganizationId?: string;
}

declare global {
  namespace Express {
    interface Request {
      id: string;
      session?: Session;
      user?: User;
    }
  }
}

export interface QueryOptions {
  page: number;
  limit: number;
  sort?: string;
}

export interface PaginatedResult<T> {
  docs: T[];
  totalDocs: number;
  limit: number;
  totalPages: number;
  page: number;
  nextPage: boolean;
  prevPage: boolean;
}
