# Dependency spike: `@huggingface/transformers` (translation feature)

Measured on 2026-10-14, Windows 11 (Node v24.0.1) and Docker Desktop 29.1.2 (`node:24-bookworm-slim`, Node v24.21.0), pnpm 11.1.3,
BE repo HEAD `a8ba88f` plus the uncommitted working-tree dependency delta (`@huggingface/transformers@3.8.1`).
Everything ran in a scratch area outside the repo; this folder only holds scripts and filtered evidence. No product file was modified.
Install policy for every scratch install: `--ignore-scripts`, and `allowBuilds` false for `sharp`, `onnxruntime-node`, `protobufjs`
(same as the product `pnpm-workspace.yaml`). No audit ignore lists, no `--force`, no paid service, no model download (models mounted read-only).

## Headline facts

1. The 3 high advisories (+1 moderate) come only from the translation delta. HEAD without it: `pnpm audit --prod --audit-level high` exit 0, 0 findings. Working tree: exit 1, 3 high (sharp 0.34.5: GHSA-f88m-g3jw-g9cj, GHSA-rgj7-g3m4-5g8c, GHSA-wq5f-xc86-pv6w) + 1 moderate (sprintf-js 1.1.3, GHSA-hp3w-g68c-fv3c via onnxruntime-node > global-agent 3.0.0 > roarr > sprintf-js).
2. `@huggingface/transformers@4.3.1` resolves `sharp@0.35.5` (patched for all three, patch floor 0.35.5) and drops global-agent 3.0.0/roarr/sprintf-js: audit gate exit 0, 0 findings, also when applied to a scratch copy of the real product lockfile. `3.8.1` pins `sharp ^0.34.1` so it cannot reach 0.35.x without an override of a transitive dependency range (not tested, rejected by the brief).
3. 4.3.1 + the existing en-vi model: **the `>>vie<<` prefix is tokenized differently** (see "Parity"). The pipeline call with the textual prefix gives different, usually worse, en-to-vi output than 3.8.1. vi-to-en is the same except 1 of 10 sentences. A manual workaround (prepend token id 3 yourself, call `model.generate`) restored 10/10 identical output in this probe.
4. `sharp` is loaded eagerly at `import`/`require` in both versions: with the sharp native binary missing, loading the library fails (experiment only).
5. onnxruntime-node linux-x64 binaries are present after `--ignore-scripts` (3.8.1: napi-v3, 4.3.1: napi-v6). Both models loaded and translated inside a `--network none` container as user `node` for every candidate.

## Candidates

| id       | spec                                                               | note                                                                    |
| -------- | ------------------------------------------------------------------ | ----------------------------------------------------------------------- |
| baseline | `@huggingface/transformers@3.8.1`                                  | latest 3.x (npm `versions`: no 3.x newer than 3.8.1)                    |
| A0       | `@huggingface/transformers@4.3.1`                                  | npm `latest`; `next` is `4.0.0-next.11` (not tested)                    |
| A1       | A0 + `overrides: '@huggingface/transformers>onnxruntime-web': '-'` | pnpm override that removes the dependency; only applied to the 4.x line |
| exp      | baseline and A0 with `pnpm install --no-optional`                  | experiment on load-time coupling to sharp, not a recommendation         |
| rejected | 3.8.1 + forced `sharp@0.35.5`                                      | violates the declared range `^0.34.1`; not tested                       |

Registry facts (`npm view`): 3.8.1 deps `sharp ^0.34.1`, `onnxruntime-node 1.21.0`, `onnxruntime-web 1.22.0-dev.20250409-89f8206ba4`, `@huggingface/jinja ^0.5.3`; 4.3.1 deps `sharp ^0.35.4`, `onnxruntime-node 1.30.0`, `onnxruntime-web 1.31.0-dev.20260914-8d85527a0`, `@huggingface/jinja ^0.5.10`, `@huggingface/tokenizers ^0.2.0`.
Both ship `exports.node.require -> dist/transformers.node.cjs` and `exports.node.import -> dist/transformers.node.mjs`. 4.3.1 published 2026-10-06; sharp 0.35.5 2026-09-27.

## Results

### Windows (Node v24.0.1, scratch pnpm projects; `evidence/<id>.json`, `evidence/<id>-smoke-win32.json`)

| candidate                   | sharp  | ort-node | ort-web                        | audit H/M/C/L | audit-high gate exit | CJS require / ESM import | smoke ok | load ms (vi-en/en-vi) | warm ms/sentence | peak RSS MB |
| --------------------------- | ------ | -------- | ------------------------------ | ------------- | -------------------- | ------------------------ | -------- | --------------------- | ---------------- | ----------- |
| 3.8.1 baseline              | 0.34.5 | 1.21.0   | 1.22.0-dev.20250409-89f8206ba4 | 3H/1M/0C/0L   | 1                    | ok / ok                  | true     | 3379/2606             | 681              | 734.7       |
| 4.3.1 (A0)                  | 0.35.5 | 1.30.0   | 1.31.0-dev.20260914-8d85527a0  | 0/0/0/0       | 0                    | ok / ok                  | true     | 2007/1641             | 585              | 572.5       |
| 4.3.1 + drop ort-web (A1)   | 0.35.5 | 1.30.0   | absent                         | 0/0/0/0       | 0                    | ok / ok                  | true     | 2546/1995             | 829              | 571.2       |
| 3.8.1 `--no-optional` (exp) | 0.34.5 | 1.21.0   | 1.22.0-dev...                  | 3H/1M         | 1                    | FAIL / FAIL              | false    | n/a                   | n/a              | n/a         |
| 4.3.1 `--no-optional` (exp) | 0.35.5 | 1.30.0   | 1.31.0-dev...                  | 0             | 0                    | FAIL / FAIL              | false    | n/a                   | n/a              | n/a         |

`--no-optional` leaves sharp without its `@img/sharp-*` platform package: `Error: Could not load the "sharp" module using the win32-x64 runtime` at import time, in both versions and both module systems. So the text pipeline cannot be loaded without sharp's native binary (experiment about coupling; nothing is recommended from it).
`pnpm why sharp --prod`: 0.35.5 for A0/A1; 0.34.5 for the baseline. Timings are single runs on a shared machine (see limitations); treat latency as order of magnitude only.

### Linux container (`node:24-bookworm-slim`, Node v24.21.0, install as root with Dockerfile flags, smoke as user `node` with `--network none`)

| scenario                                                               | install | smoke ok | load ms (vi-en/en-vi) | warm ms/sentence | VmHWM MB | fetch attempts |
| ---------------------------------------------------------------------- | ------- | -------- | --------------------- | ---------------- | -------- | -------------- |
| product working-tree lock (3.8.1, full prod tree, 755 MB node_modules) | ok      | true     | 10611/2417            | 518              | 785.8    | 0              |
| 3.8.1 minimal (356 MB)                                                 | ok      | true     | 6127/10146            | 1045             | 751.7    | 0              |
| 3.8.1 minimal, `--memory 768m`                                         | ok      | true     | 9411/6612             | 900              | 770.5    | 0              |
| 4.3.1 minimal A0 (473 MB)                                              | ok      | true     | 5399/7017             | 1060             | 604.4    | 0              |
| 4.3.1 minimal A0, `--memory 768m`                                      | ok      | true     | 2093/3689             | 524              | 569.9    | 0              |
| 4.3.1 minimal A1 (327 MB)                                              | ok      | true     | 3958/3977             | 918              | 605.7    | 0              |
| 4.3.1 minimal A1, `--memory 768m`                                      | ok      | true     | 3398/2340             | 523              | 565.2    | 0              |
| product lock with 4.3.1 (A0, scratch copy; 872 MB)                     | ok      | true     | 3210/1795             | 301              | 611.4    | 0              |
| product lock with 4.3.1 + A1 (scratch copy; 729 MB)                    | ok      | true     | 3303/1844             | 450              | 639.3    | 0              |

Proof of offline operation: the container is started with `--network none`; inside it `fetch('https://huggingface.co/')` fails (`EAI_AGAIN`), `env.allowRemoteModels=false`, and `globalThis.fetch` (plus `env.fetch` on 4.x) is wrapped: 0 http(s) attempts counted in every run, 0 local reads via `env.fetch`. The `--memory 768m` runs finished without OOM (the model files are page cache, not counted in the peaks above). RSS peaks include both models loaded one after another in one process. Linux binary check (from `evidence/*-smoke-linux.json` `install`): 3.8.1 `napi-v3/linux/x64/{onnxruntime_binding.node, libonnxruntime.so.1(.21.0), libonnxruntime_providers_shared.so}`; 4.3.1 `napi-v6/linux/x64/{onnxruntime_binding.node, libonnxruntime.so.1 (43.7 MB)}`; `@img/sharp-linux-x64` present (0.34.5 / 0.35.5). No CUDA provider library is present (the optional download is an install script, which was skipped).
Installed sizes (Linux, MB): onnxruntime-node 208 (1.21.0) vs 288 (1.30.0); onnxruntime-web 89 vs 140; A1 removes the whole onnxruntime-web subtree and protobufjs/@types/node that hang below it (minimal project 473 -> 327 MB, product tree 872 -> 729 MB).

### Product lockfile with a different version (scratch copy only; `evidence/product-431*.json`, `product-variant.mjs`)

| variant                   | lock update / frozen prod install / audit-high gate exit | audit      | sharp  | lock packages added / removed vs working-tree lock                                                                                                                                                          |
| ------------------------- | -------------------------------------------------------- | ---------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| product lock + 4.3.1      | 0 / 0 / 0                                                | 0 findings | 0.35.5 | 38 / 46 (all within the transformers subtree: sharp + @img/_, onnxruntime-_, tokenizers, adm-zip, global-agent 4.1.3, matcher 4, serialize-error 8; removed tar, roarr, sprintf-js, global-agent 3.0.0 ...) |
| product lock + 4.3.1 + A1 | 0 / 0 / 0                                                | 0 findings | 0.35.5 | 36 / 59 (additionally removes onnxruntime-web, protobufjs, @protobufjs/*, flatbuffers, guid-typescript, platform)                                                                                           |

### Baseline reproduction (T-1; `evidence/t1-baseline-audit.json`)

| tree                                                                                                                   | install                                                                                 | `pnpm audit --prod --audit-level high --json` | counts              |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | --------------------------------------------- | ------------------- |
| clone of HEAD `a8ba88f`, package files unchanged                                                                       | n/a (audit reads lockfile)                                                              | exit 0                                        | 0 high / 0 moderate |
| same clone + working-tree `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml` (sha256 of the three files recorded) | `pnpm install --frozen-lockfile --ignore-scripts` exit 0 (44 s, full install incl. dev) | exit 1                                        | 3 high, 1 moderate  |

Dependency paths: `.>@huggingface/transformers>sharp` (3 high), `.>@huggingface/transformers>onnxruntime-node>global-agent>roarr>sprintf-js` (moderate). Without `--audit-level high` the exit code is the same (1) and the moderate one is also listed.

### Parity 3.8.1 vs 4.3.1 on the same local q8 models (`evidence/parity-3.8.1-vs-4.3.1.json`, `probe-quality.mjs`, `compare-parity.mjs`)

10 sentences per direction, default generation settings (num_beams from the model generation config: vi-en 6, en-vi 4). This is a parity check, not a quality evaluation.

| direction / input                                     | identical output | different                                                                                                          |
| ----------------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------ |
| vi -> en                                              | 9                | 1 ("maximum trigger count" vs "maximum number of triggers"); source token ids identical                            |
| en -> vi, input with the `>>vie<< ` prefix            | 1                | 9 (the 4.3.1 outputs are mostly worse, e.g. "Ghi chú xe đạp." for the enterprise-plan sentence)                    |
| en -> vi, same sentences without the prefix (control) | 8                | 2 (source token ids identical in all 10; the difference comes from the runtime, onnxruntime 1.21 vs 1.30 numerics) |

Cause (token ids in the evidence): the en-vi `tokenizer.json` vocabulary contains `>>vie<<` as one token (id 3). 3.8.1 produces `[3, ...]`; 4.3.1 (`@huggingface/tokenizers 0.2.0`) splits it into five pieces `[5402, 2257, 16203, 5896, 5896, ...]`. Workaround probe (`probe-prefix-workaround.mjs`, `evidence/*-prefix-workaround-win32.json`): on 4.3.1 tokenize the raw sentence, prepend id 3, call `pipeline.model.generate(...)`, decode with `pipeline.tokenizer.batch_decode`; result equals the 3.8.1 pipeline output for 10/10 sentences. This bypasses the `translation` pipeline and was only tried on this model; not a recommendation. `evidence/parity-4.3.1-vs-4.3.1-a1.json`: A1 vs A0 outputs identical on all 30 comparisons (removing onnxruntime-web changes nothing in Node).
3.8.1 and 4.3.1 both print `WARNING: MarianTokenizer is not yet supported by Hugging Face's "fast" tokenizers library` on stderr.

### minimumReleaseAge (pnpm 11)

`pnpm config get minimumReleaseAge` prints `undefined` here; the scratch installs of 4.3.1 (published 2026-10-06, 8 days old) and its deps (newest dep: transformers itself) were not blocked by the default. With `minimumReleaseAge: 20000` (about 13.9 days) in `pnpm-workspace.yaml` the same lockfile fails: `ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION ... @huggingface/transformers@4.3.1 ... within the cutoff`, i.e. the policy is enforced on lockfile entries too. If the repo ever sets a longer age than ~8 days, 4.3.1 must be allowlisted or waited out. (Scratch experiment, not saved as evidence.)

### Docker build context (T-4; nothing built, no file edited)

`.dockerignore` excludes `node_modules dist coverage .git .env .env.* docs test .temp .tmp *.log src/generated`. **`.models` is not excluded** (it is in `.gitignore` as `/.models/`, not in `.dockerignore`). Context size computed per top-level entry (PowerShell sums, `node_modules` and ignored entries removed): about 205 MB with `.models` (203.5 MB of it) versus about 0.75 MB without it (`src` 1.52 MB minus `src/generated` 1.18 MB, lockfile 0.29 MB, rest small). The product Dockerfile only `COPY`s `package.json pnpm-lock.yaml pnpm-workspace.yaml`, `tsconfig*`, `nest-cli.json`, `prisma.config.ts`, `prisma`, `src`, so the models would be sent to the daemon but not land in any image layer; they are also not copied into the runtime image (that is a separate decision). Other Dockerfile facts: only the `production-dependencies` stage uses `--ignore-scripts`; the `build` stage runs `pnpm install --frozen-lockfile` with scripts governed by `allowBuilds` (prisma, @prisma/engines, unrs-resolver true; sharp/onnxruntime-node false). The runtime stage is plain `node:24-bookworm-slim` (same base as this spike, glibc 2.36).

## Reproduce

Prerequisites: Node 22-24, pnpm 11.1.3 (`pnpm --version` must print 11.1.3), Docker Desktop (linux/amd64), models at `<BE>/.models/translation`.

```bash
# Windows, Git Bash. SPIKE_SCRATCH holds clones/installs; use Windows-form paths for Node.
export SPIKE_SCRATCH=<scratch>/proj
export SPIKE_MODELS_DIR=<BE>/.models/translation
D=<BE>/docs/workspace/items/dynamic-content-translation/spike/deps

# T-1: baseline (clone, then copy the three working-tree package files over the clone; do not alter them)
git clone <BE> <scratch>/head-clone ; git clone <BE> <scratch>/wt-clone
cp <BE>/{package.json,pnpm-lock.yaml,pnpm-workspace.yaml} <scratch>/wt-clone/
(cd <scratch>/wt-clone && pnpm install --frozen-lockfile --ignore-scripts)
(cd <scratch>/wt-clone && pnpm audit --prod --audit-level high --json ; echo exit=$?)
(cd <scratch>/head-clone && pnpm audit --prod --audit-level high --json ; echo exit=$?)

# Candidate matrix (each: scratch project, lockfile, frozen prod install --ignore-scripts, audit, load checks, Windows smoke)
node $D/setup-candidate.mjs t381 3.8.1 --smoke
node $D/setup-candidate.mjs t431 4.3.1 --smoke
node $D/setup-candidate.mjs t431-a1 4.3.1 --drop-onnxruntime-web --smoke
node $D/setup-candidate.mjs t381-no-optional 3.8.1 --no-optional --smoke   # experiment
node $D/setup-candidate.mjs t431-no-optional 4.3.1 --no-optional --smoke    # experiment
# parity / prefix probes (run inside the scratch project dir; files are copied there by setup-candidate)
(cd $SPIKE_SCRATCH/t381 && SPIKE_LABEL=t381 SPIKE_OUT=$D/evidence/t381-probe-quality-win32.json node probe-quality.mjs)
(cd $SPIKE_SCRATCH/t431 && SPIKE_LABEL=t431 SPIKE_OUT=$D/evidence/t431-probe-quality-win32.json node probe-quality.mjs)
node $D/compare-parity.mjs $D/evidence/t381-probe-quality-win32.json $D/evidence/t431-probe-quality-win32.json $D/evidence/parity-3.8.1-vs-4.3.1.json
# product lock with another version (scratch copy only)
node $D/product-variant.mjs product-431 4.3.1 <scratch>/wt-clone
node $D/product-variant.mjs product-431-a1 4.3.1 <scratch>/wt-clone --drop-onnxruntime-web

# Linux: install with the Dockerfile flags into a fresh volume, then offline smoke in a second container
bash $D/run-linux.sh t431 $SPIKE_SCRATCH/t431 <BE>/.models/translation
SPIKE_DOCKER_MEMORY=768m bash $D/run-linux.sh t431 $SPIKE_SCRATCH/t431 <BE>/.models/translation
node $D/summarize.mjs     # markdown tables from evidence/
```

`run-linux.sh` phase 1: `docker run node:24-bookworm-slim` with network, `npm install -g pnpm@11.1.3`, copies only `package.json pnpm-lock.yaml pnpm-workspace.yaml smoke.mjs` into the volume, `pnpm install --prod --frozen-lockfile --ignore-scripts`, `chown -R node:node /app`. Phase 2: `docker run --network none --user node -v <vol>:/app:ro -v <models>:/models:ro` and `node smoke.mjs`. The volume is removed at the end.

Files: `setup-candidate.mjs`, `product-variant.mjs`, `smoke.mjs`, `probe-quality.mjs`, `probe-prefix-workaround.mjs`, `compare-parity.mjs`, `summarize.mjs`, `run-linux.sh`, `evidence/`. Lockfiles are not stored; `evidence/<id>.json` has the lockfile sha256, resolved versions, audit advisories with dependency paths and the load checks.

## Limitations / not verified

- Latency and load times are single runs on a shared Windows 11 laptop, with other agents/containers working concurrently (the same scenario varies 301 to 1060 ms/sentence between runs); they are not benchmarks. RSS peaks are steadier.
- Not a translation quality evaluation: only 10 hand-written sentences per direction, no reference translations, no human judgement. "Worse" above is the author's reading of Vietnamese output, not a metric.
- Minimal scratch projects omit the product `overrides` block (js-yaml, multer, qs, ...), so they only model the transformers subtree; the product-lock variants cover the real tree but only audit + Linux smoke, not the Nest build or the product test suite.
- Only the quantized (`q8`) CPU path was run. No GPU, no WASM path, no `device` other than `cpu`, no fp32/fp16 weights, no concurrency, no long inputs, no throughput under load, no worker-process isolation (another spike).
- Linux was only linux/amd64 on Docker Desktop (WSL2). No arm64, no musl/alpine, no host Linux. `node:24-bookworm-slim` image resolved to Node v24.21.0 while the Windows host has v24.0.1.
- The Dockerfile itself was not built. `pnpm install --prod` in the container ran as root as in the Dockerfile; the runtime stage does not exist in this spike (a plain volume mounted read-only was used instead).
- `4.0.0-next.*` and other 4.x versions (4.0.0 to 4.3.0) were not tested. Whether 4.x later fixes the `>>vie<<` tokenization was not checked.
- Why 4.3.1 and 3.8.1 differ on 2/10 no-prefix en-vi sentences was not isolated (runtime numerics assumed from identical token ids; the ORT version differs but other 4.x changes could contribute).
- Advisory data comes from the live registry audit endpoint at the time of the run and can change; the audit results are not a full security review (no license, no supply-chain review of `@huggingface/tokenizers`, `adm-zip`, etc.). `adm-zip@0.6.1` and `global-agent@4.1.3` appear in the 4.3.1 tree (resolved versions as expected).
- `--no-optional` is the only sharp-absent simulation (no module-level stub or alias was tried to avoid the eager import).
- Network proof covers the model-loading and inference path under `--network none`; it does not cover other code paths of the library (for example a hub lookup if `allowRemoteModels` were enabled).
