export const getBaseUrl = (): string | null => {
  const candidate =
    process.env.PUBLIC_BASE_URL ||
    process.env.RENDER_EXTERNAL_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    null;

  if (!candidate) return null;
  return candidate.replace(/\/+$/, "");
};
