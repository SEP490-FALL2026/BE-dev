#!/bin/sh
# Usage: run.sh <scenario>. Prints only exit codes and boolean checks, never the transcript.
S=$1; OUT=/tmp/out.$$; PW=$(cat /review-secret/pw)
feed() { sleep 4; for f in "$@"; do case $f in ctrlc) printf '\003';; *) printf '%s\r' "$(cat /review-secret/$f)";; esac; sleep 1; done; sleep 20; }
case $S in
  notty) sh /review/cli.sh </dev/null >$OUT 2>&1; echo "exit=$?"; grep -c 'interactive terminal' $OUT | sed 's/^/msg_no_terminal=/';;
  passopt) sh /review/cli.sh --password=whatever </dev/null >$OUT 2>&1; echo "exit=$?"; grep -c 'never accepted as an option' $OUT | sed 's/^/msg_refused=/';;
  mismatch) feed pw other | script -qefc "sh /review/cli.sh" /dev/null >$OUT 2>&1; echo "exit=$?"; grep -c 'do not match' $OUT | sed 's/^/msg_mismatch=/';;
  weak) feed weak weak | script -qefc "sh /review/cli.sh" /dev/null >$OUT 2>&1; echo "exit=$?"; grep -c 'does not meet the policy' $OUT | sed 's/^/msg_policy=/';;
  ctrlc) feed ctrlc | script -qefc "sh /review/cli.sh; echo CLI_EXIT=\$?; stty -a" /dev/null >$OUT 2>&1; echo "exit=$?"; grep -o 'CLI_EXIT=[0-9]*' $OUT; if grep -q -- ' -echo ' $OUT; then echo echo_restored=no; elif grep -q ' echo ' $OUT; then echo echo_restored=yes; else echo echo_restored=unknown; fi; grep -q -- ' -icanon' $OUT && echo canon=off || echo canon=on;;
  success|rerun) feed pw pw | script -qefc "sh /review/cli.sh" /dev/null >$OUT 2>&1; echo "exit=$?"; grep -c 'Installation complete' $OUT | sed 's/^/msg_complete=/'; grep -c 'already has an organization' $OUT | sed 's/^/msg_already=/';;
esac
printf 'password_in_transcript=%s\n' "$(grep -cF "$PW" $OUT)"; grep -c 'Password: ' $OUT | sed 's/^/prompt_seen=/'; rm -f $OUT
