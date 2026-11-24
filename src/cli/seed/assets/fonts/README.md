# Fonts for the PDFs of the seed

The seed builds real PDFs (contracts, invoices, signed records, receipts) with `pdf-lib`. A PDF written in Vietnamese needs an embedded
Unicode font, so one is kept here (`SPEC` S23, section 4a, decision Q-D).

| File                   | What                                                                        |
| ---------------------- | --------------------------------------------------------------------------- |
| `NotoSans-Regular.ttf` | Noto Sans Regular, the **static** instance (not the variable `[wdth,wght]`) |
| `OFL.txt`              | SIL Open Font License 1.1, verbatim, from the Noto project                  |

## Source

- Font: `https://github.com/notofonts/notofonts.github.io/blob/main/fonts/NotoSans/full/ttf/NotoSans-Regular.ttf`
  (official build of the Noto project, downloaded 2026-11-17; the last commit that touched the file is
  `28b15b4b43b7bed62b5cf6e6b0b5ff5846270535`, 2024-11-21).
- Version in the font's name table: `Version 2.015; ttfautohint (v1.8.4.7-5d5b)`, PostScript name `NotoSans-Regular`, 4515 glyphs, no variation axes.
  It has every letter and tone mark of Vietnamese.
- License: `https://github.com/notofonts/latin-greek-cyrillic/blob/main/OFL.txt` (repository of the sources of Noto Sans, commit
  `ffaec0a756877220dbf718ce08b8479a0be82479`, "Copyright 2022 The Noto Project Authors").

## sha256

```text
f5f552c8c5edb61fe6efb824baf4d4de47b1a8689ab4925ff43f7bd6a4ebece5  NotoSans-Regular.ttf
cee9892f9f0cc8fe882c9e9537ee6a89621d86ee7ceaf70b02e2b2b1c25c061a  OFL.txt
```

## How it gets to `dist/`

`nest-cli.json` copies `cli/seed/assets/fonts/*` into `dist` on `pnpm build`, and the runtime image copies only `dist`. The builders read
`join(__dirname, '../assets/fonts/NotoSans-Regular.ttf')`, which is right under `src/` (jest, flows) and under `dist/` alike.
