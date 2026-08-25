import type { Schema } from 'mongoose';

/**
 * Standard JSON serialization for tenant-scoped billing documents:
 * expose a string `id`, hide `_id`/`__v`, keep the business keys intact.
 */
export function toJSONTransform(_doc: unknown, ret: Record<string, unknown>): unknown {
  ret.id = String(ret._id);
  delete ret._id;
  delete ret.__v;
  return ret;
}

/** Add the shared transform to a schema's toJSON options. */
export function withJsonTransform(schema: Schema): Schema {
  const existing = schema.get('toJSON') as Record<string, unknown> | undefined;
  schema.set('toJSON', {
    ...(existing ?? {}),
    virtuals: true,
    versionKey: false,
    transform: toJSONTransform,
  });
  return schema;
}
