import { ImportJob, ImportJobStatus } from '@/domain/entities/ImportJob';

export interface IImportJobRepository {
  findAll(): Promise<ImportJob[]>;
  findById(jobId: string): Promise<ImportJob | null>;
  create(job: Omit<ImportJob, 'jobId'>): Promise<ImportJob>;
  updateStatus(jobId: string, status: ImportJobStatus, progressPct: number): Promise<void>;
  updateResult(jobId: string, partial: Partial<ImportJob>): Promise<void>;
}
