// Technical smoke of the S3-compatible adapter (dist) against a review MinIO. No file API exists yet.
const [repo, endpoint, user, pass, redisPass] = process.argv.slice(2);
const r = (m) => require(require.resolve(m, { paths: [repo] }));
const { S3Client, CreateBucketCommand } = r('@aws-sdk/client-s3');
const { S3CompatibleObjectStorageAdapter } = require(repo + '/dist/infrastructure/object-storage/s3-compatible-object-storage.adapter.js');
const cfg = { OBJECT_STORAGE_BUCKET: 'slm-review-bucket', OBJECT_STORAGE_ENDPOINT: endpoint, OBJECT_STORAGE_REGION: 'us-east-1', OBJECT_STORAGE_FORCE_PATH_STYLE: true, OBJECT_STORAGE_ACCESS_KEY_ID: user, OBJECT_STORAGE_SECRET_ACCESS_KEY: pass };
(async () => {
  const out = [];
  await new S3Client({ endpoint, region: 'us-east-1', forcePathStyle: true, credentials: { accessKeyId: user, secretAccessKey: pass } }).send(new CreateBucketCommand({ Bucket: cfg.OBJECT_STORAGE_BUCKET }));
  const a = new S3CompatibleObjectStorageAdapter({ get: (k) => cfg[k] });
  const key = 'review/' + Date.now() + '.txt';
  const put = await fetch(await a.createUploadUrl({ key, contentType: 'text/plain', expiresInSeconds: 60 }), { method: 'PUT', headers: { 'content-type': 'text/plain' }, body: 'review payload' });
  out.push('signed PUT ' + put.status);
  const head = await a.head(key); out.push('head length ' + head.contentLength + ' type ' + head.contentType);
  const get = await fetch(await a.createDownloadUrl({ key, expiresInSeconds: 60 })); out.push('signed GET ' + get.status + ' body-match ' + ((await get.text()) === 'review payload'));
  const shortUrl = await a.createDownloadUrl({ key, expiresInSeconds: 1 }); await new Promise((x) => setTimeout(x, 2500));
  out.push('expired GET ' + (await fetch(shortUrl)).status);
  out.push('unsigned GET ' + (await fetch(endpoint + '/' + cfg.OBJECT_STORAGE_BUCKET + '/' + key)).status);
  await a.delete(key); out.push('after delete head ' + (await a.head(key).then(() => 'still there', (e) => e.$metadata?.httpStatusCode ?? e.name)));
  a.onModuleDestroy();
  console.log(out.join('\n'));
})().catch((e) => { console.log('storage smoke failed: ' + e.name); process.exit(1); });
