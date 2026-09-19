// Frontend runtime config — reads from window globals set by index.html
// Mapbox token is injected server-side if configured (never hardcoded)
export const config = {
  mapboxToken: (window as any).__NEXORA_MAPBOX_TOKEN__ as string | undefined,
};
