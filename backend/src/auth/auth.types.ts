export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

export type JwtPayload = {
  sub: string;
  email: string;
};
