import { BankMapping, CreateBankMappingInput } from '@/domain/entities/BankMapping';

export interface IBankMappingRepository {
  findAll(): Promise<BankMapping[]>;
  findByBank(bankName: string): Promise<BankMapping | null>;
  save(mapping: CreateBankMappingInput): Promise<BankMapping>;
  update(bankName: string, partial: Partial<CreateBankMappingInput>): Promise<BankMapping>;
  delete(bankName: string): Promise<void>;
}
