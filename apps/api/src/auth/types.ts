export const USER_ROLES = ["ADMIN", "CLINICIAN", "NURSE", "STAFF"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  clinicId: string;
}
