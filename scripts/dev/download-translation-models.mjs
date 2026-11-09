import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

// Download only public artifacts. This setup command never reads application data.
const models = [
  ['Xenova/opus-mt-vi-en', '541dfd72ec07e8f1563795e0224408ad8d729e80'],
  ['Xenova/opus-mt-en-vi', '30bcd461c0d7338ad106b36314d3eedc2d4e998c'],
];
const files = [
  'README.md',
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'special_tokens_map.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];
const root = resolve(process.env.OFFLINE_TRANSLATION_MODELS_DIR || '.models/translation');
const manifest = [];

for (const [model, revision] of models) {
  for (const file of files) {
    const target = join(root, model, file);
    await mkdir(dirname(target), { recursive: true });
    const response = await fetch(`https://huggingface.co/${model}/resolve/${revision}/${file}`, {
      signal: AbortSignal.timeout(300_000),
    });
    if (!response.ok || !response.body) throw new Error(`Model download failed: ${model}/${file} (${response.status})`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(`${target}.partial`));
    await rename(`${target}.partial`, target);
    const hash = createHash('sha256');
    let bytes = 0;
    for await (const chunk of createReadStream(target)) {
      hash.update(chunk);
      bytes += chunk.length;
    }
    manifest.push({ model, revision, file, bytes, sha256: hash.digest('hex') });
    console.log(`${model}/${file}: ${(bytes / 1024 ** 2).toFixed(1)} MiB`);
  }
}
await writeFile(join(root, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
console.log('Public model files are ready. Runtime translation uses local files only.');
