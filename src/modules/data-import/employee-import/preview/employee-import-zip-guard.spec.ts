import { deflateRawSync } from 'node:zlib';
import { assertZipUncompressedSize, readUploadedEmployeeFile } from './employee-import-xlsx.service';

// Archives are built in memory, byte by byte, so every field the guard reads can be made to lie.
interface EntrySpec {
  name: string;
  payload: Buffer;
  method?: number;
  declaredUncompressed?: number;
  declaredCompressed?: number;
  flags?: number;
  localSignature?: number;
}
interface ArchiveSpec {
  count?: number;
  entriesOnDisk?: number;
  disk?: number;
  centralSignature?: number;
  directoryOffsetDelta?: number;
  directorySizeDelta?: number;
  zip64Locator?: boolean;
}

function buildZip(entries: EntrySpec[], archive: ArchiveSpec = {}): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const entry of entries) {
    const method = entry.method ?? 8;
    const data = method === 8 ? deflateRawSync(entry.payload) : entry.payload;
    const name = Buffer.from(entry.name);
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(entry.localSignature ?? 0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(entry.flags ?? 0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(archive.centralSignature ?? 0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(entry.flags ?? 0, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt32LE(entry.declaredCompressed ?? data.length, 20);
    central.writeUInt32LE(entry.declaredUncompressed ?? entry.payload.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    locals.push(local, data);
    centrals.push(central);
    offset += local.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const locator = archive.zip64Locator ? Buffer.alloc(20) : Buffer.alloc(0);
  if (archive.zip64Locator) locator.writeUInt32LE(0x07064b50, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(archive.disk ?? 0, 4);
  eocd.writeUInt16LE(archive.entriesOnDisk ?? archive.count ?? entries.length, 8);
  eocd.writeUInt16LE(archive.count ?? entries.length, 10);
  eocd.writeUInt32LE(directory.length + (archive.directorySizeDelta ?? 0), 12);
  eocd.writeUInt32LE(offset + (archive.directoryOffsetDelta ?? 0), 16);
  return Buffer.concat([...locals, directory, locator, eocd]);
}

const MIB = 1024 * 1024;
const LIMIT = MIB;
const reasonOf = (run: () => void): string | undefined => {
  try {
    run();
  } catch (error) {
    expect(error).toMatchObject({ name: 'ImportFileUnreadableError' });
    return (error as { reason: string }).reason;
  }
  return undefined;
};
const zeros = (megabytes: number) => Buffer.alloc(megabytes * MIB);

describe('the zip bomb guard of an uploaded workbook', () => {
  it('lets an honest small archive through, stored or deflated', () => {
    const bytes = buildZip([
      { name: 'a.xml', payload: Buffer.from('<a>hello</a>'.repeat(50)) },
      { name: 'b.bin', payload: Buffer.from('stored'), method: 0 },
      { name: 'dir/', payload: Buffer.alloc(0), method: 0 },
    ]);
    expect(() => assertZipUncompressedSize(bytes, LIMIT)).not.toThrow();
  });

  it('refuses an entry that declares more than the limit', () => {
    expect(reasonOf(() => assertZipUncompressedSize(buildZip([{ name: 'big', payload: zeros(3) }]), LIMIT))).toBe(
      'UNCOMPRESSED_SIZE_EXCEEDED',
    );
  });

  it('refuses entries that add up to more than the limit', () => {
    const bytes = buildZip([
      { name: 'one', payload: zeros(1).subarray(0, 700 * 1024) },
      { name: 'two', payload: zeros(1).subarray(0, 700 * 1024) },
    ]);
    expect(reasonOf(() => assertZipUncompressedSize(bytes, LIMIT))).toBe('UNCOMPRESSED_SIZE_EXCEEDED');
  });

  it('bypass 1: an entry that declares 100 bytes but inflates past the limit is refused by really inflating it', () => {
    const bytes = buildZip([{ name: 'bomb', payload: zeros(3), declaredUncompressed: 100 }]);
    expect(reasonOf(() => assertZipUncompressedSize(bytes, LIMIT))).toBe('UNCOMPRESSED_SIZE_EXCEEDED');
  });

  it('bypass 1 end to end: the default 20 MB limit holds for a lying 30 MB entry before the workbook library runs', async () => {
    const bytes = buildZip([{ name: 'xl/bomb.xml', payload: zeros(30), declaredUncompressed: 100 }]);
    await expect(readUploadedEmployeeFile({ fileName: 'bomb.xlsx', bytes })).rejects.toMatchObject({
      name: 'ImportFileUnreadableError',
      reason: 'UNCOMPRESSED_SIZE_EXCEEDED',
    });
  });

  it('bypass 2: an end record that declares no entries cannot hide the ones that are there', () => {
    const bytes = buildZip([{ name: 'bomb', payload: zeros(3) }], { count: 0 });
    expect(reasonOf(() => assertZipUncompressedSize(bytes, LIMIT))).toBe('INVALID_XLSX');
  });

  it('refuses a declared count that differs from the records walked', () => {
    const two = [
      { name: 'one', payload: Buffer.from('1') },
      { name: 'two', payload: Buffer.from('2') },
    ];
    expect(reasonOf(() => assertZipUncompressedSize(buildZip(two, { count: 1, entriesOnDisk: 1 }), LIMIT))).toBe(
      'INVALID_XLSX',
    );
    expect(reasonOf(() => assertZipUncompressedSize(buildZip(two, { count: 3, entriesOnDisk: 3 }), LIMIT))).toBe(
      'INVALID_XLSX',
    );
  });

  it('refuses an entry whose real length differs from the declared one', () => {
    const shorter = buildZip([{ name: 'a', payload: Buffer.from('hello world'), declaredUncompressed: 3 }]);
    const longer = buildZip([{ name: 'a', payload: Buffer.from('hello'), declaredUncompressed: 500 }]);
    expect(reasonOf(() => assertZipUncompressedSize(shorter, LIMIT))).toBe('INVALID_XLSX');
    expect(reasonOf(() => assertZipUncompressedSize(longer, LIMIT))).toBe('INVALID_XLSX');
  });

  it('refuses a stored entry whose compressed and declared sizes differ', () => {
    const bytes = buildZip([
      { name: 'a', payload: Buffer.from('hello'), method: 0, declaredUncompressed: 3, declaredCompressed: 5 },
    ]);
    expect(reasonOf(() => assertZipUncompressedSize(bytes, LIMIT))).toBe('INVALID_XLSX');
  });

  it('refuses ZIP64, several disks, encryption and unknown compression', () => {
    const entry = { name: 'a', payload: Buffer.from('hello') };
    const cases: Record<string, Buffer> = {
      'zip64 entry size': buildZip([{ ...entry, declaredUncompressed: 0xffffffff }]),
      'zip64 locator': buildZip([entry], { zip64Locator: true }),
      'zip64 count': buildZip([entry], { count: 0xffff, entriesOnDisk: 0xffff }),
      'multi disk': buildZip([entry], { disk: 1 }),
      'entries on this disk differ': buildZip([entry], { entriesOnDisk: 2 }),
      encrypted: buildZip([{ ...entry, flags: 0x0001 }]),
      'unknown compression': buildZip([{ ...entry, method: 9 }]),
    };
    for (const [name, bytes] of Object.entries(cases)) {
      expect({ name, reason: reasonOf(() => assertZipUncompressedSize(bytes, LIMIT)) }).toEqual({
        name,
        reason: 'INVALID_XLSX',
      });
    }
  });

  it('refuses malformed archives', () => {
    const entry = { name: 'a', payload: Buffer.from('hello') };
    const good = buildZip([entry]);
    const cases: Record<string, Buffer> = {
      'no end record': good.subarray(0, good.length - 22),
      'shorter than an end record': Buffer.from('PK'),
      'directory out of range': buildZip([entry], { directoryOffsetDelta: 100 }),
      'directory size out of range': buildZip([entry], { directorySizeDelta: 100 }),
      'directory does not end at the end record': buildZip([entry], { directorySizeDelta: -1 }),
      'bad central signature': buildZip([entry], { centralSignature: 0x12345678 }),
      'bad local signature': buildZip([{ ...entry, localSignature: 0x12345678 }]),
      'corrupt deflate data': Buffer.concat([good.subarray(0, 31), Buffer.from([0xff]), good.subarray(32)]),
    };
    for (const [name, bytes] of Object.entries(cases)) {
      expect({ name, reason: reasonOf(() => assertZipUncompressedSize(bytes, LIMIT)) }).toEqual({
        name,
        reason: 'INVALID_XLSX',
      });
    }
  });
});
