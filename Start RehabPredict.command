#!/bin/zsh
cd -- "${0:A:h}" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
node scripts/local-launch.mjs
if [[ $? -ne 0 ]]; then
  printf '\n起動できませんでした。上のメッセージを確認し、Enterで閉じてください。\n'
  read
fi
