export type Gender = 'MALE' | 'FEMALE' | 'OTHER' | 'UNKNOWN' | 'UNDISCLOSED';

export interface Person {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string | null;
  surname: string | null;
  displayName: string | null;
  gender: Gender;
  dateOfBirth: string | null;
  dateOfDeath: string | null;
  isBirthDateApproximate: boolean;
  placeOfBirth: string | null;
  currentCity: string | null;
  occupation: string | null;
  description: string | null;
  isLiving: boolean;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Present on responses that hydrate it (global list, get-by-id) - every family this person belongs to. */
  families?: { id: string; familyName: string }[];
}
