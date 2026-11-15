/** 登录用户档案（前后端 API JSON 一致） */
export type AuthUser = {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
};

/** GET /api/auth/config */
export type AuthConfig = {
  googleEnabled: boolean;
  googleClientId: string | null;
  devLoginEnabled: boolean;
};

/** GET /api/auth/memory */
export type UserMemoryContent = {
  contentMd: string;
};
