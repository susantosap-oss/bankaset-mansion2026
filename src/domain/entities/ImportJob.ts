export type ImportJobStatus =
  | 'PENDING'
  | 'FILTERING_GEO'
  | 'EXTRACTING'
  | 'NORMALIZING'
  | 'AWAITING_REVIEW'
  | 'IMPORTED'
  | 'FAILED';

export type FileType = 'EXCEL' | 'CSV' | 'PDF_DIGITAL' | 'PDF_SCANNED';

export interface ImportJobError {
  row: number;
  column?: string;
  reason: string;
}

export interface ImportJob {
  readonly jobId: string;
  readonly bankName: string;
  readonly fileName: string;
  readonly fileType: FileType;
  readonly totalPages: number;
  readonly filteredPages: number;
  readonly totalRowsFound: number;
  readonly rowsAccepted: number;
  readonly rowsRejectedGeo: number;
  readonly rowsRejectedType: number;
  readonly rowsFailedNormalize: number;
  readonly status: ImportJobStatus;
  readonly progressPct: number;
  readonly errorLog: ImportJobError[];
  readonly createdAt: string;
  readonly completedAt: string | null;
  readonly createdBy: string;
}
