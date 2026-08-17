import type { ObjectId } from './primitives';

export type CategoryKind = 'income' | 'expense';

export interface Category {
  id: ObjectId;
  userId: ObjectId;
  name: string;
  kind: CategoryKind;
  color?: string;
  createdAt: string;
  updatedAt: string;
}