import { Schema, type Connection, type Document, type Model } from 'mongoose';
import { withJsonTransform } from '../../models/billing/schemaUtils';

/**
 * Phase 3 analytics-domain models. Like billing models they are built per
 * tenant connection and every business key is compound-unique per tenant.
 */

// ------------------------------------------------------------ AnomalyRecord --

export interface AnomalyRecordDocument extends Document {
  anomalyId: string;
  tenantId: string;
  kind: string;
  severity: 'INFO' | 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  detectedAt: Date;
  customerId?: string;
  amountMinor?: number;
  currency?: string;
  reason: string;
  status: 'open' | 'reviewed' | 'acknowledged' | 'dismissed';
  reviewedBy?: string;
  reviewedAt?: Date;
  createdAt: Date;
}

const anomalySchema = new Schema<AnomalyRecordDocument>(
  {
    anomalyId: { type: String, required: true },
    tenantId: { type: String, required: true },
    kind: { type: String, required: true },
    severity: { type: String, enum: ['INFO', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], required: true },
    detectedAt: { type: Date, required: true },
    customerId: { type: String },
    amountMinor: { type: Number },
    currency: { type: String },
    reason: { type: String, required: true },
    status: { type: String, enum: ['open', 'reviewed', 'acknowledged', 'dismissed'], default: 'open' },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
  },
  { timestamps: true },
);
withJsonTransform(anomalySchema);
anomalySchema.index({ tenantId: 1, anomalyId: 1 }, { unique: true });
// Detection runs filter by recency + severity; the review screen filters by status.
anomalySchema.index({ tenantId: 1, detectedAt: -1 });
anomalySchema.index({ tenantId: 1, status: 1, severity: 1 });

export function buildAnomalyModel(connection: Connection): Model<AnomalyRecordDocument> {
  if (connection.models['AnalyticsAnomaly']) return connection.models['AnalyticsAnomaly'] as Model<AnomalyRecordDocument>;
  return connection.model<AnomalyRecordDocument>('AnalyticsAnomaly', anomalySchema);
}

// --------------------------------------------------------------- AlertRule --

export interface AlertRuleDocument extends Document {
  ruleId: string;
  tenantId: string;
  name: string;
  /** Metric key evaluated by the alert engine. */
  metric: 'revenue_below' | 'outstanding_above' | 'failure_rate_above' | 'refund_above' | 'large_transaction';
  /** Money thresholds in minor units; rate thresholds in basis points (10% = 1000). */
  thresholdMinor: number;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  enabled: boolean;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
}

const alertRuleSchema = new Schema<AlertRuleDocument>(
  {
    ruleId: { type: String, required: true },
    tenantId: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    metric: {
      type: String,
      enum: ['revenue_below', 'outstanding_above', 'failure_rate_above', 'refund_above', 'large_transaction'],
      required: true,
    },
    thresholdMinor: { type: Number, required: true, min: 0 },
    severity: { type: String, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'], default: 'MEDIUM' },
    enabled: { type: Boolean, default: true },
    createdBy: { type: String, required: true },
  },
  { timestamps: true },
);
withJsonTransform(alertRuleSchema);
alertRuleSchema.index({ tenantId: 1, ruleId: 1 }, { unique: true });
alertRuleSchema.index({ tenantId: 1, enabled: 1 });

export function buildAlertRuleModel(connection: Connection): Model<AlertRuleDocument> {
  if (connection.models['AnalyticsAlertRule']) return connection.models['AnalyticsAlertRule'] as Model<AlertRuleDocument>;
  return connection.model<AlertRuleDocument>('AnalyticsAlertRule', alertRuleSchema);
}

// -------------------------------------------------------------- SavedReport --

export interface SavedReportDocument extends Document {
  reportConfigId: string;
  tenantId: string;
  createdBy: string;
  name: string;
  reportType: string;
  /** Whitelisted shape enforced by zod at the route layer — never raw Mongo filters. */
  configuration: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const savedReportSchema = new Schema<SavedReportDocument>(
  {
    reportConfigId: { type: String, required: true },
    tenantId: { type: String, required: true },
    createdBy: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    reportType: {
      type: String,
      enum: ['revenue', 'payments', 'invoices', 'customers', 'refunds', 'cashflow', 'ledger', 'financial-health', 'anomalies'],
      required: true,
    },
    configuration: { type: Schema.Types.Mixed, required: true },
  },
  { timestamps: true },
);
withJsonTransform(savedReportSchema);
savedReportSchema.index({ tenantId: 1, reportConfigId: 1 }, { unique: true });
savedReportSchema.index({ tenantId: 1, createdBy: 1 });

export function buildSavedReportModel(connection: Connection): Model<SavedReportDocument> {
  if (connection.models['AnalyticsSavedReport']) return connection.models['AnalyticsSavedReport'] as Model<SavedReportDocument>;
  return connection.model<SavedReportDocument>('AnalyticsSavedReport', savedReportSchema);
}

// ------------------------------------------------------------- ExportRecord --

export interface ExportRecordDocument extends Document {
  exportId: string;
  tenantId: string;
  requestedBy: string;
  reportType: string;
  format: 'csv';
  status: 'queued' | 'processing' | 'completed' | 'failed';
  dateFrom?: string;
  dateTo?: string;
  rowCount?: number;
  error?: string;
  createdAt: Date;
}

const exportRecordSchema = new Schema<ExportRecordDocument>(
  {
    exportId: { type: String, required: true },
    tenantId: { type: String, required: true },
    requestedBy: { type: String, required: true },
    reportType: { type: String, required: true },
    format: { type: String, enum: ['csv'], default: 'csv' },
    status: { type: String, enum: ['queued', 'processing', 'completed', 'failed'], default: 'completed' },
    dateFrom: { type: String },
    dateTo: { type: String },
    rowCount: { type: Number },
    error: { type: String },
  },
  { timestamps: true },
);
withJsonTransform(exportRecordSchema);
exportRecordSchema.index({ tenantId: 1, exportId: 1 }, { unique: true });
exportRecordSchema.index({ tenantId: 1, createdAt: -1 });

export function buildExportRecordModel(connection: Connection): Model<ExportRecordDocument> {
  if (connection.models['AnalyticsExportRecord']) return connection.models['AnalyticsExportRecord'] as Model<ExportRecordDocument>;
  return connection.model<ExportRecordDocument>('AnalyticsExportRecord', exportRecordSchema);
}

// ------------------------------------------------------------------- factory --

export interface AnalyticsModels {
  Anomaly: Model<AnomalyRecordDocument>;
  AlertRule: Model<AlertRuleDocument>;
  SavedReport: Model<SavedReportDocument>;
  ExportRecord: Model<ExportRecordDocument>;
}

export function createAnalyticsModels(connection: Connection): AnalyticsModels {
  return {
    Anomaly: buildAnomalyModel(connection),
    AlertRule: buildAlertRuleModel(connection),
    SavedReport: buildSavedReportModel(connection),
    ExportRecord: buildExportRecordModel(connection),
  };
}