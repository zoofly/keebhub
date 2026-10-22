// zod validators for Hono routes. Failures become 400 validation_failed
// with per-field messages; the parsed (transformed) value reaches the
// handler, and the input types flow to the hc client.
import type { Context } from "hono";
import { validator } from "hono/validator";
import type { z } from "zod";
import type { AppEnv } from "../env";
import { jsonError } from "./errors";

const fieldErrors = (error: z.ZodError): Record<string, string[]> => {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join(".") : "_";
    fields[key] = [...(fields[key] ?? []), issue.message];
  }
  return fields;
};

const fail = (c: Context<AppEnv>, error: z.ZodError) =>
  jsonError(c, 400, "validation_failed", "Invalid request", fieldErrors(error));

export const zJson = <T extends z.ZodType>(schema: T) =>
  validator("json", (value, c: Context<AppEnv>) => {
    const result = schema.safeParse(value);
    return result.success ? (result.data as z.output<T>) : fail(c, result.error);
  });

export const zQuery = <T extends z.ZodType>(schema: T) =>
  validator("query", (value, c: Context<AppEnv>) => {
    const result = schema.safeParse(value);
    return result.success ? (result.data as z.output<T>) : fail(c, result.error);
  });

export const zParam = <T extends z.ZodType>(schema: T) =>
  validator("param", (value, c: Context<AppEnv>) => {
    const result = schema.safeParse(value);
    return result.success ? (result.data as z.output<T>) : fail(c, result.error);
  });
