import { XMLParser } from "fast-xml-parser";
import { list, record, str } from "./data.js";
const cache = new Map<string, { expires: number; promise: Promise<unknown> }>();
export function buildUrl(
  base: string,
  params: Record<string, string | number>,
): string {
  const url = new URL(base);
  for (const [key, raw] of Object.entries(params)) {
    let value = String(raw);
    if (/servicekey/i.test(key) && /%[\dA-F]{2}/i.test(value)) {
      try {
        value = decodeURIComponent(value);
      } catch {
        /* preserve invalid input so upstream rejects it */
      }
    }
    url.searchParams.set(key, value);
  }
  return url.href;
}
export async function fetchData(
  url: string,
  options: { headers?: Record<string, string>; ttl?: number } = {},
): Promise<unknown> {
  const key = url + JSON.stringify(options.headers || {});
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.promise;
  const promise = (async () => {
    const response = await fetch(url, {
      headers: options.headers,
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) throw new Error(`UPSTREAM_HTTP_${response.status}`);
    const text = await response.text();
    if (text.length > 15_000_000)
      throw new Error("UPSTREAM_RESPONSE_TOO_LARGE");
    const data: unknown = text.trimStart().startsWith("<")
      ? new XMLParser({ parseTagValue: false }).parse(text)
      : JSON.parse(text);
    const root = record(data),
      wrapper = record(root.response);
    const header = record(wrapper.header);
    const code = str(header.resultCode);
    if (
      (code && !["00", "0000", "0", "NORMAL_SERVICE"].includes(code)) ||
      root.OpenAPI_ServiceResponse
    )
      throw new Error("UPSTREAM_API_ERROR");
    return data;
  })();
  if (cache.size >= 250) cache.delete(cache.keys().next().value as string);
  cache.set(key, {
    expires: Date.now() + (options.ttl ?? 5 * 60_000),
    promise,
  });
  try {
    return await promise;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}
export function publicBody(data: unknown): Record<string, unknown> {
  const body = record(record(data).response).body;
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new Error("UNEXPECTED_PUBLIC_API_FORMAT");
  return record(body);
}
export function publicItems(data: unknown): Record<string, unknown>[] {
  const body = publicBody(data);
  const items = body.items;
  if (items === undefined && String(body.totalCount) !== "0")
    throw new Error("UNEXPECTED_PUBLIC_API_ITEMS");
  return Array.isArray(items) ? list(items) : list(record(items).item ?? items);
}
