import { Types } from 'mongoose';
import { SortOrder } from 'mongoose';
import fs from 'node:fs';
import {
  ContactModel,
  type Contact,
  type ContactCreate,
  type ContactUpdate,
} from './contacts.model';
import {
  createPaginationResult,
  type PaginationResult,
} from '@/lib/pagination';

/** Warnings for missing fields important for GST/AR/AP compliance */
export interface ContactWarnings {
  missingGstin: boolean;
  missingPan: boolean;
  missingPlaceOfSupply: boolean;
  missingLegalName: boolean;
  missingAddress: boolean;
  messages: string[];
}

/** Auto-fill name from email/phone if missing */
export function autoFillName(data: {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
}): string {
  const n = (data.name ?? '').trim();
  if (n) return n;
  const e = (data.email ?? '').trim();
  if (e) return e.split('@')[0] || e;
  const p = (data.phone ?? '').trim();
  if (p) return `Contact ${p.slice(-4)}`;
  return 'New Contact';
}

const CONTACT_EXPORT_FIELDS = [
  'name',
  'type',
  'legalName',
  'gstin',
  'pan',
  'email',
  'phone',
  'address',
  'city',
  'state',
  'stateCode',
  'pincode',
  'placeOfSupply',
  'creditLimit',
  'paymentTermsDays',
  'tags',
  'notes',
  'isActive',
  'arApType',
] as const;

/** Common column aliases for auto-mapping during import */
const FIELD_ALIASES: Record<string, string> = {
  name: 'name',
  'contact name': 'name',
  'customer name': 'name',
  'vendor name': 'name',
  type: 'type',
  'contact type': 'type',
  legalname: 'legalName',
  'legal name': 'legalName',
  gstin: 'gstin',
  gst: 'gstin',
  'gst number': 'gstin',
  'gst no': 'gstin',
  'gst no.': 'gstin',
  pan: 'pan',
  'pan number': 'pan',
  'pan no': 'pan',
  email: 'email',
  'email address': 'email',
  phone: 'phone',
  mobile: 'phone',
  'mobile no': 'phone',
  'mobile no.': 'phone',
  'phone number': 'phone',
  'contact no': 'phone',
  address: 'address',
  city: 'city',
  state: 'state',
  statecode: 'stateCode',
  'state code': 'stateCode',
  pincode: 'pincode',
  pin: 'pincode',
  'place of supply': 'placeOfSupply',
  creditlimit: 'creditLimit',
  'credit limit': 'creditLimit',
  paymenttermsdays: 'paymentTermsDays',
  'payment terms': 'paymentTermsDays',
  tags: 'tags',
  notes: 'notes',
  isactive: 'isActive',
  'is active': 'isActive',
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, ' ');
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Map CSV/external row keys to schema field names (name, email, etc.) */
function normalizeRowKeys(
  row: Record<string, unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    const normalized = normalizeHeader(k);
    const field = FIELD_ALIASES[normalized] ?? normalized.replace(/\s+/g, '');
    if (field) out[field] = v;
  }
  return out;
}

export default class ContactServices {
  static async create(
    data: ContactCreate,
    organizationId: string,
    userId?: string
  ): Promise<Contact> {
    const orgId = new Types.ObjectId(organizationId);
    const name = autoFillName({
      name: data.name,
      email: data.email,
      phone: data.phone,
    });

    const email = (data.email ?? '').trim().toLowerCase();
    const phone = (data.phone ?? '').trim();

    const existingQuery: Record<string, unknown> = {
      organizationId: orgId,
      $or: [] as unknown[],
    };
    if (email)
      (existingQuery.$or as Record<string, unknown>[]).push({
        email: { $regex: new RegExp(`^${escapeRegex(email)}$`, 'i') },
      });
    if (phone)
      (existingQuery.$or as Record<string, unknown>[]).push({
        phone: { $regex: new RegExp(`^${escapeRegex(phone)}$`) },
      });

    const existing =
      (existingQuery.$or as unknown[]).length > 0
        ? await ContactModel.findOne(existingQuery).lean().exec()
        : null;

    if (existing) {
      const ex = existing as unknown as Contact;
      const existingType = ex.type;
      const newType = data.type ?? 'BOTH';
      const mergedType = existingType !== newType ? 'BOTH' : existingType;

      const updatePayload: Record<string, unknown> = {
        type: mergedType,
        name: data.name?.trim() || ex.name || name,
        ...(data.legalName != null && { legalName: data.legalName }),
        ...(data.gstin != null && { gstin: data.gstin }),
        ...(data.pan != null && { pan: data.pan }),
        ...(data.address != null && { address: data.address }),
        ...(data.city != null && { city: data.city }),
        ...(data.state != null && { state: data.state }),
        ...(data.stateCode != null && { stateCode: data.stateCode }),
        ...(data.pincode != null && { pincode: data.pincode }),
        ...(data.placeOfSupply != null && {
          placeOfSupply: data.placeOfSupply,
        }),
        ...(data.creditLimit != null && { creditLimit: data.creditLimit }),
        ...(data.paymentTermsDays != null && {
          paymentTermsDays: data.paymentTermsDays,
        }),
        ...(data.tags != null && { tags: data.tags }),
        ...(data.notes != null && { notes: data.notes }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(userId && { updatedBy: new Types.ObjectId(userId) }),
      };
      if (email && !ex.email) updatePayload.email = email;
      if (phone && !ex.phone) updatePayload.phone = phone;

      const updated = await ContactModel.findOneAndUpdate(
        { _id: (existing as { _id: Types.ObjectId })._id },
        { $set: updatePayload },
        { new: true, runValidators: true }
      )
        .lean()
        .exec();
      return updated as unknown as Contact;
    }

    const doc = await ContactModel.create({
      ...data,
      name: data.name?.trim() || name,
      organizationId: orgId,
      ...(userId && {
        createdBy: new Types.ObjectId(userId),
        updatedBy: new Types.ObjectId(userId),
      }),
    });
    return doc.toObject() as unknown as Contact;
  }

  static async list(
    filters: { type?: string; name?: string; isActive?: boolean },
    sort: Record<string, SortOrder>,
    organizationId: string,
    page: number,
    limit: number
  ): Promise<PaginationResult<Contact>> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters.type) query.type = filters.type;
    if (filters.name) query.name = { $regex: filters.name, $options: 'i' };
    if (filters.isActive !== undefined) query.isActive = filters.isActive;

    const [data, total] = await Promise.all([
      ContactModel.find(query)
        .sort(sort)
        .skip((page - 1) * limit)
        .limit(limit)
        .lean()
        .exec(),
      ContactModel.countDocuments(query).exec(),
    ]);

    return createPaginationResult<Contact>(
      data as unknown as Contact[],
      total,
      page,
      limit
    );
  }

  static async getById(
    id: string,
    organizationId: string
  ): Promise<Contact | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const doc = await ContactModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    })
      .lean()
      .exec();
    return doc ? (doc as unknown as Contact) : null;
  }

  static async update(
    id: string,
    data: ContactUpdate,
    organizationId: string,
    userId?: string
  ): Promise<Contact | null> {
    if (!Types.ObjectId.isValid(id)) return null;
    const set: Record<string, unknown> = { ...data };
    if (userId) set.updatedBy = new Types.ObjectId(userId);
    const doc = await ContactModel.findOneAndUpdate(
      {
        _id: new Types.ObjectId(id),
        organizationId: new Types.ObjectId(organizationId),
      },
      { $set: set },
      { new: true, runValidators: true }
    )
      .lean()
      .exec();
    return doc ? (doc as unknown as Contact) : null;
  }

  static async remove(id: string, organizationId: string): Promise<boolean> {
    if (!Types.ObjectId.isValid(id)) return false;
    const result = await ContactModel.deleteOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    }).exec();
    return result.deletedCount > 0;
  }

  /** Compute compliance warnings. Only for VENDOR/BOTH — CUSTOMER-only has no GST/compliance warnings. */
  static getWarnings(contact: Contact): ContactWarnings {
    const messages: string[] = [];
    const isVendor = contact.type === 'VENDOR' || contact.type === 'BOTH';

    const missingGstin = !contact.gstin || contact.gstin.trim() === '';
    const missingPan = !contact.pan || contact.pan.trim() === '';
    const missingPlaceOfSupply =
      !contact.placeOfSupply || contact.placeOfSupply.trim() === '';
    const missingLegalName =
      !contact.legalName || contact.legalName.trim() === '';
    const missingAddress = !contact.address || contact.address.trim() === '';

    if (!isVendor) {
      return {
        missingGstin,
        missingPan,
        missingPlaceOfSupply,
        missingLegalName,
        missingAddress,
        messages: [],
      };
    }

    if (missingGstin)
      messages.push('GSTIN missing — ITC may be ineligible under Rule 36(4)');
    if (missingPan)
      messages.push('PAN missing — TDS deduction cannot be applied');
    if (missingPlaceOfSupply)
      messages.push('Place of supply missing — affects IGST/CGST+SGST split');
    if (missingLegalName)
      messages.push(
        'Legal name missing — required on GST invoices if different from trade name'
      );

    return {
      missingGstin,
      missingPan,
      missingPlaceOfSupply,
      missingLegalName,
      missingAddress,
      messages,
    };
  }

  /** Export contacts as JSON */
  static async exportJson(
    organizationId: string,
    filters?: { type?: string }
  ): Promise<Record<string, unknown>[]> {
    const query: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters?.type) query.type = { $in: [filters.type, 'BOTH'] };

    const docs = await ContactModel.find(query).lean({ virtuals: true }).exec();

    return docs.map((d) => {
      const obj = d as Record<string, unknown>;
      const fields = CONTACT_EXPORT_FIELDS.filter(
        (f) => f === 'arApType' || obj[f] !== undefined
      );
      return Object.fromEntries(
        fields.map((f) => [
          f,
          f === 'arApType'
            ? obj.type === 'CUSTOMER'
              ? 'Receivable'
              : obj.type === 'VENDOR'
                ? 'Payable'
                : 'Both'
            : obj[f],
        ])
      );
    });
  }

  /** Get template as CSV buffer (headers + example row, Excel-compatible) */
  static getTemplateCsvBuffer(): Buffer {
    const headers = [...CONTACT_EXPORT_FIELDS];
    const exampleRow = headers.map((h) => {
      if (h === 'type') return 'CUSTOMER';
      if (h === 'name') return 'Acme Corp';
      if (h === 'email') return 'contact@example.com';
      if (h === 'phone') return '+919876543210';
      if (h === 'gstin') return '22AAAAA0000A1Z5';
      if (h === 'pan') return 'AAAAA0000A';
      if (h === 'paymentTermsDays') return '30';
      if (h === 'isActive') return 'true';
      return '';
    });
    const lines = [headers.join(','), exampleRow.join(',')];
    return Buffer.from(lines.join('\n'), 'utf-8');
  }

  /** Export contacts as CSV (Excel-compatible, no exceljs dep) */
  static async exportCsv(
    organizationId: string,
    filters?: { type?: string }
  ): Promise<string> {
    const rows = await this.exportJson(organizationId, filters);
    const headers = CONTACT_EXPORT_FIELDS;
    const lines = [
      headers.join(','),
      ...rows.map((r) =>
        headers
          .map((h) => {
            const v = r[h];
            if (v == null) return '';
            const s = String(v);
            return s.includes(',') || s.includes('"')
              ? `"${s.replace(/"/g, '""')}"`
              : s;
          })
          .join(',')
      ),
    ];
    return lines.join('\n');
  }

  /** Map external column names to our schema fields */
  /** Map external column names to schema fields (for import UI/reporting) */
  static mapHeaders(headers: string[]): Record<number, string> {
    const mapping: Record<number, string> = {};
    const valid = new Set(CONTACT_EXPORT_FIELDS);
    headers.forEach((h, i) => {
      const normalized = normalizeHeader(h);
      const field = FIELD_ALIASES[normalized] ?? normalized.replace(/\s/g, '');
      if (valid.has(field as (typeof CONTACT_EXPORT_FIELDS)[number])) {
        mapping[i] = field;
      }
    });
    return mapping;
  }

  static async bulkImport(
    rows: Record<string, unknown>[],
    organizationId: string
  ): Promise<{
    hit: number;
    miss: number;
    errors: { row: number; message: string; data?: Record<string, unknown> }[];
    imported: Contact[];
  }> {
    const errors: {
      row: number;
      message: string;
      data?: Record<string, unknown>;
    }[] = [];
    const imported: Contact[] = [];

    for (let i = 0; i < rows.length; i++) {
      const raw = rows[i];
      const rowNum = i + 1; // 1-based for user display

      if (!raw || typeof raw !== 'object') {
        errors.push({ row: rowNum, message: 'Invalid row' });
        continue;
      }

      const row = normalizeRowKeys(raw as Record<string, unknown>);

      const email = String(row.email ?? row.Email ?? '').trim();
      const phone = String(row.phone ?? row.Phone ?? row.mobile ?? '').trim();
      if (!email && !phone) {
        errors.push({
          row: rowNum,
          message: 'At least one of email or phone required',
          data: row as Record<string, unknown>,
        });
        continue;
      }

      const typeRaw = String(
        row.type ?? row.Type ?? row.contact_type ?? 'BOTH'
      ).toUpperCase();
      const type =
        typeRaw === 'CUSTOMER' || typeRaw === 'VENDOR'
          ? typeRaw
          : typeRaw === 'BOTH'
            ? 'BOTH'
            : 'BOTH';

      const name =
        String(row.name ?? row.Name ?? row.contact_name ?? '').trim() ||
        email ||
        phone ||
        'Unnamed Contact';

      const createData = {
        type,
        name: name || autoFillName({ email, phone }),
        email: email || undefined,
        phone: phone || undefined,
        legalName:
          String(row.legalName ?? row.legal_name ?? '').trim() || undefined,
        gstin:
          String(row.gstin ?? row.gst ?? '')
            .trim()
            .toUpperCase() || undefined,
        pan:
          String(row.pan ?? row.pan_number ?? '')
            .trim()
            .toUpperCase() || undefined,
        address: String(row.address ?? '').trim() || undefined,
        city: String(row.city ?? '').trim() || undefined,
        state: String(row.state ?? '').trim() || undefined,
        stateCode:
          String(row.stateCode ?? row.state_code ?? '').trim() || undefined,
        pincode: String(row.pincode ?? row.pin ?? '').trim() || undefined,
        placeOfSupply:
          String(row.placeOfSupply ?? row.place_of_supply ?? '').trim() ||
          undefined,
        creditLimit:
          row.creditLimit != null ? Number(row.creditLimit) : undefined,
        paymentTermsDays:
          row.paymentTermsDays != null ? Number(row.paymentTermsDays) : 30,
        tags: Array.isArray(row.tags) ? row.tags.map(String) : undefined,
        notes: String(row.notes ?? '').trim() || undefined,
        isActive: row.isActive === false ? false : true,
      } as ContactCreate;

      try {
        const contact = await this.create(
          createData,
          organizationId,
          undefined
        );
        imported.push(contact);
      } catch (err) {
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Create failed',
          data: row as Record<string, unknown>,
        });
      }
    }

    return {
      hit: imported.length,
      miss: errors.length,
      errors,
      imported,
    };
  }

  /** Parse CSV file to array of row objects. Uses first row as headers. */
  static parseCsvFile(filePath: string): Record<string, unknown>[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvLine(lines[0]!);
    const rows: Record<string, unknown>[] = [];
    for (let i = 1; i < lines.length; i++) {
      const values = parseCsvLine(lines[i]!);
      const obj: Record<string, unknown> = {};
      headers.forEach((h, j) => {
        obj[h] = values[j] ?? '';
      });
      rows.push(obj);
    }
    return rows;
  }

  /** Import from CSV file: parse, import, delete temp file. */
  static async bulkImportFromCsv(
    filePath: string,
    organizationId: string
  ): Promise<{
    hit: number;
    miss: number;
    errors: { row: number; message: string; data?: Record<string, unknown> }[];
    imported: Contact[];
  }> {
    try {
      const rows = this.parseCsvFile(filePath);
      const result = await this.bulkImport(rows, organizationId);
      return result;
    } finally {
      try {
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {
        /* ignore */
      }
    }
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}
