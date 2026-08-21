// PROVISIONAL generated-client boundary. Replace this file from the pinned backend
// OpenAPI artifact and enforce a drift check in CI before production release.
export interface paths {
  "/auth/login": {
    post: {
      requestBody: { content: { "application/json": { username: string; password: string } } };
      responses: {
        200: { content: { "application/json": { next: "mfa" | "authenticated" } } };
      };
    };
  };
  "/public/map": {
    get: {
      responses: {
        200: { content: { "application/json": import("@/lib/domain/map").PublicMapData } };
      };
    };
  };
}
