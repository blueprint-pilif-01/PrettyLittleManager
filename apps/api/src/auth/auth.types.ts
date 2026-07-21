export type AccessTokenClaims = {
  sub: string;
  sid: string;
  mid: string;
  cid: string;
  typ: "access";
};

export type AuthResult = {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken: string;
  profile: {
    id: string;
    email: string;
    displayName: string;
    company: { id: string; name: string; slug: string };
    role: { key: string; name: string };
    permissions: string[];
  };
};
