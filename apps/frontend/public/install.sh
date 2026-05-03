#!/bin/sh
# bloclawd installer (pre-release placeholder)
#
# This placeholder lives at apps/frontend/public/install.sh and is
# served at https://bloclawd.com/install.sh. The first `0.1.x` tag
# push triggers .github/workflows/release.yml, whose update-install-sh
# job runs `cargo dist generate-installer --shell` and opens an
# auto-PR that overwrites this file with the real installer (sha256
# baked per-target; see D-122).
#
# Until then, this script exits 1 with a clear message so users (and
# the release-smoke matrix) can distinguish "not yet released" from
# "release pipeline broken".
set -eu

printf 'bloclawd is not yet released.\n'
printf 'The first version (0.1.x) is in preparation.\n'
printf 'Track release status at: https://github.com/%s/bloclawd/releases\n' "${BLOCLAWD_GH_ORG:-<gh-org>}"
printf 'Source: https://bloclawd.com\n'

exit 1
