import { CanonicalField } from '@/domain/entities/BankMapping';

export interface FieldAlias {
  readonly aliasId: string;
  readonly aliasText: string;
  readonly canonicalField: CanonicalField;
  readonly confidence: number;
  readonly source: 'SYSTEM' | 'MANUAL';
  readonly createdBy: string;
  readonly createdAt: string;
}

export type CreateFieldAliasInput = Omit<FieldAlias, 'aliasId' | 'createdAt'>;
