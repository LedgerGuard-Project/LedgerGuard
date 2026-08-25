import { Schema, type Connection, type Document, type Model, type Types } from 'mongoose';
import { UserRole, type UserStatus, type User } from '@ledgerguard/shared';
import { hashPassword } from '../security/password';
import { createBillingModels, type BillingModels } from '../models/billing';

export interface TenantUserDocument extends Omit<User, 'id' | 'createdAt' | 'updatedAt'>, Document {
  _id: Types.ObjectId;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface TenantModels {
  /** Per-tenant scoped User model. */
  User: Model<TenantUserDocument>;
  /** Phase 2 billing/ledger models bound to the same tenant connection. */
  billing: BillingModels;
}

/** Detect already-hashed bcrypt values (cost 04-31) so pre-save never re-hashes them. */
function isBcryptHash(value: string): boolean {
  return /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/.test(value);
}

/** Build tenant-scoped models bound to a dedicated per-tenant connection. */
export function createTenantModels(connection: Connection): TenantModels {
  const userModel: Model<TenantUserDocument> | undefined = connection.models['TenantUser']
    ? (connection.models['TenantUser'] as Model<TenantUserDocument>)
    : undefined;

  if (!userModel) {
    const userSchema = new Schema<TenantUserDocument>(
      {
        name: { type: String, required: true, trim: true, maxlength: 120 },
        email: {
          type: String,
          required: true,
          unique: true,
          lowercase: true,
          trim: true,
          index: true,
        },
        passwordHash: { type: String, required: true },
        role: { type: String, enum: Object.values(UserRole), default: UserRole.Viewer },
        tenantId: { type: String, required: true },
        status: {
          type: String,
          enum: ['active', 'invited', 'disabled'],
          default: 'active',
        },
        lastLoginAt: { type: Date },
      },
      {
        timestamps: true,
        toJSON: {
          virtuals: true,
          versionKey: false,
          transform: (_doc: unknown, ret: Record<string, unknown>): unknown => {
            ret.id = String(ret._id);
            delete ret._id;
            delete ret.passwordHash;
            delete ret.__v;
            return ret;
          },
        },
      },
    );

    userSchema.pre('save', async function preSave(next) {
      if (this.isModified('passwordHash') && this.passwordHash) {
        // Skip values that are already bcrypt hashes to avoid double-hashing.
        if (!isBcryptHash(this.passwordHash)) {
          this.passwordHash = await hashPassword(this.passwordHash);
        }
      }
      next();
    });

    const modelName = 'TenantUser';
    // Avoid double-compiling the same connection when hot-reloading.
    connection.model<TenantUserDocument>(modelName, userSchema);
  }

  const User = connection.models['TenantUser'] as Model<TenantUserDocument>;
  return {
    User,
    billing: createBillingModels(connection),
  };
}