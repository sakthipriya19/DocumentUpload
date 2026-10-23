export type Access = 'owner' | 'editor' | 'viewer';
export type ShareRole = 'editor' | 'viewer';

export interface User {
  id: number;
  email: string;
  name: string;
}

export interface DocSummary {
  id: number;
  title: string;
  updatedAt: string;
  ownerName: string;
  ownerEmail: string;
  access: Access;
}

export interface ShareEntry {
  userId: number;
  email: string;
  name: string;
  role: ShareRole;
}

export interface DocFull extends DocSummary {
  content: string;
  shares: ShareEntry[];
}
