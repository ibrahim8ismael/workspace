import type { Connection, Model, Schema } from 'mongoose';

export function registerModel<T>(
  connection: Connection,
  name: string,
  schema: Schema<T>,
): Model<T> {
  return (connection.models[name] as Model<T> | undefined) ?? connection.model<T>(name, schema);
}
export const schemaOptions = {
  versionKey: false,
  strict: 'throw' as const,
  autoIndex: false,
} as const;
