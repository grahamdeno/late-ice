// Maps an API path (with query string) to a flat file name for the static snapshot.
// Used by both the snapshot generator and the client in snapshot mode.
export function snapshotFile(url: string): string {
  const u = url.replace(/^\/api\//, "");
  return u.replace(/\//g, "__").replace(/\?/g, "_q_").replace(/&/g, "_and_").replace(/=/g, "-") + ".json";
}
