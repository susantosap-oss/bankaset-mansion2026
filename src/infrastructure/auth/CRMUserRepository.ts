import { compare } from 'bcryptjs';
import { UserRole } from '@/domain/value-objects/UserRole';
import { getGoogleSheetClient } from '@/infrastructure/gsheet/GoogleSheetClient';

export interface CRMUser {
  email: string;
  name: string;
  role: UserRole;
  active: boolean;
}

// CRM AGENTS sheet column indices (0-based):
// A=0 ID | B=1 Nama | C=2 Email | D=3 Password_Hash | E=4 No_WA
// F=5 Role | G=6 Status | ...
const COL_NAMA     = 1;
const COL_EMAIL    = 2;
const COL_PASSWORD = 3;
const COL_ROLE     = 5;
const COL_STATUS   = 6;

// Map CRM roles → Asset Bank roles
function mapCRMRole(crmRole: string): UserRole {
  const r = crmRole.toLowerCase().trim();
  if (r === 'superadmin')                return 'SUPERUSER';
  if (r === 'principal' || r === 'kantor') return 'PRINCIPAL';
  if (r === 'business_manager' || r === 'admin') return 'ADMIN';
  return 'AGENT'; // agen | koordinator | unknown
}

async function readAgents() {
  const crmSheetId = process.env.CRM_SHEET_ID;
  if (!crmSheetId) return null;
  const rows = await getGoogleSheetClient().readSheet(crmSheetId, 'AGENTS');
  return rows.slice(1); // skip header
}

function rowToCRMUser(row: string[]): CRMUser | null {
  const status = row[COL_STATUS]?.toLowerCase().trim();
  if (status === 'nonaktif' || status === 'inactive' || status === 'false') return null;
  return {
    email: row[COL_EMAIL],
    name: row[COL_NAMA] ?? '',
    role: mapCRMRole(row[COL_ROLE] ?? ''),
    active: true,
  };
}

/** Verify email + plain-text password (hashed to MD5 for comparison) */
export async function verifyCRMLogin(email: string, password: string): Promise<CRMUser | null> {
  try {
    const dataRows = await readAgents();
    if (!dataRows) return null;

    const found = dataRows.find(
      (row) => row[COL_EMAIL]?.toLowerCase().trim() === email.toLowerCase().trim(),
    );
    if (!found) return null;

    const storedHash = found[COL_PASSWORD]?.trim() ?? '';
    if (!storedHash) return null;
    const valid = await compare(password, storedHash);
    if (!valid) return null;

    return rowToCRMUser(found);
  } catch (err) {
    console.error('[CRMUserRepository] verifyCRMLogin error:', err);
    return null;
  }
}

export async function getCRMUser(email: string): Promise<CRMUser | null> {
  try {
    const dataRows = await readAgents();
    if (!dataRows) return null;
    const found = dataRows.find(
      (row) => row[COL_EMAIL]?.toLowerCase().trim() === email.toLowerCase().trim(),
    );
    if (!found) return null;
    return rowToCRMUser(found);
  } catch (err) {
    console.error('[CRMUserRepository] getCRMUser error:', err);
    return null;
  }
}
