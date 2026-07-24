import { FieldAlias, CreateFieldAliasInput } from '@/domain/entities/FieldAlias';
import { CanonicalField } from '@/domain/entities/BankMapping';

export interface IFieldAliasRepository {
  findAll(): Promise<FieldAlias[]>;
  findByCanonicalField(field: CanonicalField): Promise<FieldAlias[]>;
  findByText(text: string): Promise<FieldAlias | null>;
  save(alias: CreateFieldAliasInput): Promise<FieldAlias>;
  delete(aliasId: string): Promise<void>;
}
