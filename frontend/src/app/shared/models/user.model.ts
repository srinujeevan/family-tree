export type UserRole = 'SUPER_ADMIN' | 'ADMIN' | 'USER';

export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  isActive: boolean;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}
