#!/usr/bin/env bash
# Fake `docker` for run-linux.sh tests. State in $FAKE_DOCKER_STATE: volumes/<name> (labels, one k=v per line),
# containers/<name> (labels), log (one line per invocation, argv joined by spaces).
set -u
S="${FAKE_DOCKER_STATE:?}"
mkdir -p "$S/volumes" "$S/containers"
echo "$*" >> "$S/log"
cmd="${1:-}"; shift || true
label_of() { # file key
  [ -f "$1" ] && grep -E "^$2=" "$1" | head -1 | cut -d= -f2- || true
}
case "$cmd" in
  volume)
    sub="${1:-}"; shift || true
    case "$sub" in
      inspect)
        name="${!#}"
        [ -f "$S/volumes/$name" ] || { echo "Error: No such volume: $name" >&2; exit 1; }
        key=""
        for a in "$@"; do case "$a" in *'index .Labels'*) key="$(echo "$a" | sed -E 's/.*index \.Labels "([^"]+)".*/\1/')";; esac; done
        if [ -n "$key" ]; then label_of "$S/volumes/$name" "$key"; else echo "[{\"Name\":\"$name\"}]"; fi
        ;;
      create)
        labels=(); name=""
        while [ $# -gt 0 ]; do case "$1" in --label) labels+=("$2"); shift 2;; *) name="$1"; shift;; esac; done
        [ -f "$S/volumes/$name" ] && { echo "$name"; exit 0; }
        : > "$S/volumes/$name"
        for l in "${labels[@]:-}"; do [ -n "$l" ] && echo "$l" >> "$S/volumes/$name"; done
        echo "$name"
        ;;
      rm)
        name="${!#}"
        rm -f "$S/volumes/$name"
        echo "$name"
        ;;
      *) echo "fake docker: unsupported volume $sub" >&2; exit 2;;
    esac
    ;;
  inspect)
    name="${!#}"
    [ -f "$S/containers/$name" ] || exit 1
    key=""
    for a in "$@"; do case "$a" in *'index .Config.Labels'*) key="$(echo "$a" | sed -E 's/.*index \.Config\.Labels "([^"]+)".*/\1/')";; esac; done
    label_of "$S/containers/$name" "$key"
    ;;
  rm)
    name="${!#}"
    rm -f "$S/containers/$name"
    ;;
  run)
    name=""; labels=(); probe=0; args=("$@")
    i=0
    while [ $i -lt ${#args[@]} ]; do
      a="${args[$i]}"
      case "$a" in
        --name) name="${args[$((i+1))]}"; i=$((i+2));;
        --label) labels+=("${args[$((i+1))]}"); i=$((i+2));;
        *PROBE_DEPS*) probe=1; i=$((i+1));;
        *) i=$((i+1));;
      esac
    done
    if [ -n "$name" ]; then
      : > "$S/containers/$name"
      for l in "${labels[@]:-}"; do
        if [ -n "${FAKE_LABEL_MISMATCH:-}" ]; then l="$(echo "$l" | sed 's/spike.run=.*/spike.run=someone-else/')"; fi
        [ -n "$l" ] && echo "$l" >> "$S/containers/$name"
      done
    fi
    if [ "$probe" = 1 ]; then
      echo "VERSION=${FAKE_TF_VERSION:-4.3.1}"
      echo "LOCKSHA=${FAKE_LOCKSHA:-0123abcd}"
    fi
    if [ -n "${FAKE_RUN_SLEEP:-}" ]; then sleep "$FAKE_RUN_SLEEP"; fi
    # --rm: a normal exit removes the container itself (a killed client does not)
    exit "${FAKE_RUN_EXIT:-0}"
    ;;
  *) echo "fake docker: unsupported $cmd" >&2; exit 2;;
esac
