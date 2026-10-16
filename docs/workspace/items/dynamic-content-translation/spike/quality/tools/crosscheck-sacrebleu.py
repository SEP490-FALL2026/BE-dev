"""Cross-check lib/chrf.mjs against sacreBLEU's CHRF (defaults: char_order=6, beta=2, no whitespace).

Usage (scratch venv with `pip install sacrebleu`):
    python -I tools/crosscheck-sacrebleu.py results/<date>-vi-en-raw.json [more result files...]

Both sides are NFC-normalised first (as lib/chrf.mjs does).
Prints, per result file, the corpus chrF stored by run-benchmark.mjs next to sacreBLEU's,
and the largest absolute sentence-level difference. Exit code 1 if any difference > 0.02.
"""
import json
import pathlib
import sys
import unicodedata

import sacrebleu
from sacrebleu.metrics import CHRF

sys.stdout.reconfigure(encoding="utf-8")
here = pathlib.Path(__file__).resolve().parent.parent
chrf = CHRF()  # defaults
worst = 0.0
report = {"sacrebleu": sacrebleu.__version__, "files": []}

for arg in sys.argv[1:]:
    path = pathlib.Path(arg)
    run = json.loads(path.read_text(encoding="utf-8"))
    fixture = json.loads((here / "fixtures" / f"{run['direction']}.json").read_text(encoding="utf-8"))
    refs = {i["id"]: i["reference"] for i in fixture["items"]}
    nfc = lambda t: unicodedata.normalize("NFC", t)
    raw_hyps = [it["output"] for it in run["items"]]
    non_nfc = sum(1 for h in raw_hyps if h != nfc(h))
    # lib/chrf.mjs NFC-normalises both sides (sacreBLEU does not); do the same here so the
    # comparison isolates the n-gram arithmetic. Non-NFC model outputs are counted separately.
    hyps = [nfc(h) for h in raw_hyps]
    rlist = [nfc(refs[it["id"]]) for it in run["items"]]
    corpus = chrf.corpus_score(hyps, [rlist]).score
    sent_diff = max(abs(chrf.sentence_score(h, [r]).score - it["chrf"]) for h, r, it in zip(hyps, rlist, run["items"]))
    mine = run["aggregate"]["corpusChrF"]
    diff = abs(corpus - mine)
    worst = max(worst, diff, sent_diff)
    report["files"].append(
        {
            "file": path.name,
            "direction": run["direction"],
            "mode": run["mode"],
            "corpusChrF_js": mine,
            "corpusChrF_sacrebleu": round(corpus, 2),
            "abs_diff": round(diff, 4),
            "max_sentence_abs_diff": round(sent_diff, 4),
            "non_nfc_hypotheses": non_nfc,
        }
    )

report["signature"] = str(chrf.get_signature())
print(json.dumps(report, ensure_ascii=False, indent=2))
sys.exit(1 if worst > 0.02 else 0)
