export type PermissionRole = 'OWNER' | 'EDITOR' | 'VIEWER';

export interface Family {
  id: string;
  familyName: string;
  description: string | null;
  rootPersonId: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  memberCount: number;
}
