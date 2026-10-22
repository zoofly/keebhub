/** Current time in unix seconds (what the database stores). */
export const nowSeconds = (): number => Math.floor(Date.now() / 1000);

/** Unix seconds -> ISO 8601 string (what the API returns). */
export const toIso = (seconds: number): string => new Date(seconds * 1000).toISOString();
