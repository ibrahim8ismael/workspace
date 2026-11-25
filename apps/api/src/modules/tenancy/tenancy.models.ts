import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Schema } from 'mongoose';
import type { Connection, Model } from 'mongoose';
import type { WorkspaceLayoutPlacementDto, WorkspaceLayoutPreset } from '@gather/contracts';
import { registerModel, schemaOptions } from '../../platform/database/models.js';
import type { WorkspaceRole } from '@gather/contracts';

export interface WorkspaceRecord {
  _id: string;
  name: string;
  slug: string;
  ownerId: string;
  status: 'active' | 'suspended';
  policyVersion: number;
  revision?: number;
  memberCount: number;
  createdAt: Date;
}
export interface MembershipRecord {
  _id: string;
  workspaceId: string;
  userId: string;
  role: WorkspaceRole;
  status: 'active' | 'revoked';
  policyVersion: number;
  membershipGrantId?: string;
  joinedAt: Date;
}
export interface InvitationRecord {
  _id: string;
  workspaceId: string;
  email: string;
  tokenDigest: string;
  createdBy: string;
  expiresAt: Date;
  consumedAt: Date | null;
  acceptedBy: string | null;
  revokedAt: Date | null;
  createdAt: Date;
}
export interface OperationRecord {
  _id: string;
  fingerprint: string;
  result: unknown;
  createdAt: Date;
}
export interface OfficeRecord {
  _id: string;
  workspaceId: string;
  mapVersion: string;
  layoutRevision?: number;
  draftPreset?: WorkspaceLayoutPreset;
  publishedPreset?: WorkspaceLayoutPreset;
  draftLayout?: WorkspaceLayoutPlacementDto[];
  publishedLayout?: WorkspaceLayoutPlacementDto[];
  createdAt: Date;
}
const workspaceSchema = new Schema<WorkspaceRecord>(
  {
    _id: { type: String, required: true },
    name: { type: String, required: true },
    slug: { type: String, required: true },
    ownerId: { type: String, required: true },
    status: { type: String, enum: ['active', 'suspended'], required: true },
    policyVersion: { type: Number, required: true },
    revision: { type: Number, required: false, default: 0 },
    memberCount: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
workspaceSchema.index({ slug: 1 }, { unique: true });
const membershipSchema = new Schema<MembershipRecord>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true },
    userId: { type: String, required: true },
    role: { type: String, enum: ['owner', 'admin', 'member'], required: true },
    status: { type: String, enum: ['active', 'revoked'], required: true },
    policyVersion: { type: Number, required: true },
    membershipGrantId: { type: String, required: false },
    joinedAt: { type: Date, required: true },
  },
  schemaOptions,
);
membershipSchema.index({ workspaceId: 1, userId: 1 }, { unique: true });
// Ownership changes serialize against workspace policy in one transaction.
membershipSchema.index({ workspaceId: 1, role: 1, status: 1 });
membershipSchema.index({ userId: 1, status: 1 });
const invitationSchema = new Schema<InvitationRecord>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true },
    email: { type: String, required: true },
    tokenDigest: { type: String, required: true, select: false },
    createdBy: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date, default: null },
    acceptedBy: { type: String, default: null },
    revokedAt: { type: Date, default: null },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
invitationSchema.index({ tokenDigest: 1 }, { unique: true });
invitationSchema.index({ workspaceId: 1, email: 1 });
invitationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const operationSchema = new Schema<OperationRecord>(
  {
    _id: { type: String, required: true },
    fingerprint: { type: String, required: true },
    result: { type: Schema.Types.Mixed, required: true },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
const layoutPlacementSchema = new Schema<WorkspaceLayoutPlacementDto>(
  {
    id: { type: String, required: true },
    name: { type: String },
    templateId: {
      type: String,
      enum: [
        'reception',
        'small',
        'large',
        'desks',
        'private-office',
        'team-studio',
        'lounge',
        'garden',
      ],
      required: true,
    },
    origin: {
      tx: { type: Number, required: true },
      ty: { type: Number, required: true },
    },
  },
  { _id: false, strict: 'throw' },
);
const officeSchema = new Schema<OfficeRecord>(
  {
    _id: { type: String, required: true },
    workspaceId: { type: String, required: true },
    mapVersion: { type: String, required: true },
    layoutRevision: { type: Number, default: 0 },
    draftPreset: {
      type: String,
      enum: [
        'repo-campus-hall',
        'repo-campus',
        'studio-expandable',
        'studio-orthogonal',
        'studio',
        'startup',
        'corporate',
      ],
    },
    publishedPreset: {
      type: String,
      enum: [
        'repo-campus-hall',
        'repo-campus',
        'studio-expandable',
        'studio-orthogonal',
        'studio',
        'startup',
        'corporate',
      ],
    },
    draftLayout: { type: [layoutPlacementSchema], default: undefined },
    publishedLayout: { type: [layoutPlacementSchema], default: undefined },
    createdAt: { type: Date, required: true },
  },
  schemaOptions,
);
officeSchema.index({ workspaceId: 1 }, { unique: true });

workspaceSchema.set('collection', 'workspaces');
membershipSchema.set('collection', 'memberships');
invitationSchema.set('collection', 'invitations');
operationSchema.set('collection', 'operations');
officeSchema.set('collection', 'offices');

@Injectable()
export class TenancyModels {
  readonly workspaces: Model<WorkspaceRecord>;
  readonly memberships: Model<MembershipRecord>;
  readonly invitations: Model<InvitationRecord>;
  readonly operations: Model<OperationRecord>;
  readonly offices: Model<OfficeRecord>;
  constructor(@InjectConnection() connection: Connection) {
    this.workspaces = registerModel(connection, 'Workspace', workspaceSchema);
    this.memberships = registerModel(connection, 'Membership', membershipSchema);
    this.invitations = registerModel(connection, 'Invitation', invitationSchema);
    this.operations = registerModel(connection, 'Operation', operationSchema);
    this.offices = registerModel(connection, 'Office', officeSchema);
  }
  async createIndexes() {
    for (const model of [
      this.workspaces,
      this.memberships,
      this.invitations,
      this.operations,
      this.offices,
    ])
      await model.createIndexes();
  }
}
