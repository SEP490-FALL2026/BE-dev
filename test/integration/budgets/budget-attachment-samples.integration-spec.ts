import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { buildSampleFiles, type SampleManifestEntry } from '../../support/budget-attachment-samples';
import { AttachmentDataWire, BudgetAttachmentHarness } from '../../support/budget-attachment-harness';

const h = new BudgetAttachmentHarness();

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const EXAMPLES_DIR = path.join(ROOT_DIR, 'docs', 'examples', 'budget-attachments');
const FILES_DIR = path.join(EXAMPLES_DIR, 'files');
const MANIFEST_PATH = path.join(EXAMPLES_DIR, 'manifest.json');

/**
 * The committed bytes of a sample, as Git left them in this working tree. With `core.autocrlf=true` (Windows) Git may turn
 * the line feeds of a text-like sample (a CSV, a small PDF) into CRLF on checkout; the repository does not pin the files
 * (`.gitattributes` keeps the one rule of GATE-EOL), so the check is made on the content: a file that is the sample with
 * its line feeds converted is the sample. A real difference of bytes still fails.
 */
function evenIfLineEndingsWereConverted(disk: Buffer, expected: Uint8Array): Buffer {
  if (Buffer.compare(disk, Buffer.from(expected)) === 0) return disk;
  const converted = Buffer.from(disk.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');

  return Buffer.compare(converted, Buffer.from(expected)) === 0 ? converted : disk;
}

describe('budget attachment sample files (integration)', () => {
  let counter = 0;

  beforeAll(async () => {
    await h.start();
  });

  afterAll(async () => {
    await h.stop();
  });

  const waiting = async () => {
    counter += 1;
    return await h.departmentWithHead(`P-SM${counter}`);
  };

  it('matches manifest.json and files on disk with in-memory samples generator', () => {
    const samples = buildSampleFiles();
    expect(fs.existsSync(MANIFEST_PATH)).toBe(true);

    const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf-8')) as SampleManifestEntry[];
    expect(manifest.length).toBe(samples.length);

    for (const sample of samples) {
      const entry = manifest.find((m) => m.file === sample.file);
      expect(entry).toBeDefined();
      expect(entry?.sizeBytes).toBe(sample.sizeBytes);
      expect(entry?.sha256).toBe(sample.sha256);
      expect(entry?.declare.status).toBe(sample.declare.status);
      expect(entry?.declare.code).toBe(sample.declare.code);
      expect(entry?.complete?.status).toBe(sample.complete?.status);
      expect(entry?.complete?.code).toBe(sample.complete?.code);

      const filePath = path.join(FILES_DIR, sample.file);
      expect(fs.existsSync(filePath)).toBe(true);
      const diskBytes = evenIfLineEndingsWereConverted(fs.readFileSync(filePath), sample.content);
      const diskSha256 = crypto.createHash('sha256').update(diskBytes).digest('hex');
      expect(diskBytes.length).toBe(sample.sizeBytes);
      expect(diskSha256).toBe(sample.sha256);
    }
  });

  it('exercises declare, upload, and complete for every sample file according to its expectation', async () => {
    const { head } = await waiting();
    const samples = buildSampleFiles();

    for (const sample of samples) {
      const body = {
        fileName: sample.file,
        contentType: sample.contentType,
        sizeBytes: sample.sizeBytes,
      };

      if (sample.declare.status === 422) {
        const decl = await h.declareProposalAttachment(body, head.account).expect(422);
        if (sample.declare.code) {
          expect(h.errorOf(decl).code).toBe(sample.declare.code);
        }
        continue;
      }

      const decl = await h.declareProposalAttachment(body, head.account).expect(sample.declare.status);
      const attId = h.dataOf<AttachmentDataWire>(decl).attachment.id;

      if (!sample.complete) continue;

      await h.putObject(attId, {
        contentLength: sample.sizeBytes,
        contentType: sample.contentType,
        content: sample.content,
      });

      const comp = await h.completeAttachment(attId, head.account).expect(sample.complete.status);
      if (sample.complete.code) {
        expect(h.errorOf(comp).code).toBe(sample.complete.code);
      }
    }
  });
});
