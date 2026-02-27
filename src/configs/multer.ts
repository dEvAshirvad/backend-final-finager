import multer, { type FileFilterCallback } from 'multer';
import path from 'node:path';
import fs from 'node:fs';

/** Temp directory for uploads (deleted after processing) */
const UPLOAD_TEMP = path.join(process.cwd(), 'uploads', 'temp');

export function ensureTempDir(): string {
  if (!fs.existsSync(UPLOAD_TEMP)) {
    fs.mkdirSync(UPLOAD_TEMP, { recursive: true });
  }
  return UPLOAD_TEMP;
}

const storage = multer.diskStorage({
  destination: (_req: unknown, _file: unknown, cb: (error: Error | null, destination: string) => void) => {
    cb(null, ensureTempDir());
  },
  filename: (_req: unknown, file: { originalname: string }, cb: (error: Error | null, filename: string) => void) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `contacts-import-${unique}${ext}`);
  },
});

const journalStorage = multer.diskStorage({
  destination: (_req: unknown, _file: unknown, cb: (error: Error | null, destination: string) => void) => {
    cb(null, ensureTempDir());
  },
  filename: (_req: unknown, file: { originalname: string }, cb: (error: Error | null, filename: string) => void) => {
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const ext = path.extname(file.originalname) || '.csv';
    cb(null, `journal-import-${unique}${ext}`);
  },
});

export const uploadContactCsv = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: FileFilterCallback
  ) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(null, !!ok);
  },
});

export const uploadJournalCsv = multer({
  storage: journalStorage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (
    _req: unknown,
    file: { mimetype: string; originalname: string },
    cb: FileFilterCallback
  ) => {
    const ok =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/vnd.ms-excel' ||
      file.originalname.toLowerCase().endsWith('.csv');
    cb(null, !!ok);
  },
});
