"""Execute the actual image resolver with fake registry responses, including Windows Git Bash."""
from pathlib import Path
import re
import shutil
import subprocess

import pytest

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/quickstart.sh"


def resolve(tmp_path, *, head_exists=False, revision="", frontend_exists=True):
    bash = shutil.which("bash") or "C:/Program Files/Git/bin/bash.exe"
    if not Path(bash).is_file():
        pytest.skip("Bash is needed to execute the real image resolver")
    source = SCRIPT.read_text(encoding="utf-8")
    assignment = next(line for line in source.splitlines() if line.startswith('TAG='))
    functions = "\n".join(re.search(rf"^{name}\(\) \{{.*?^\}}", source, re.M | re.S)[0]
                          for name in ("resolve_image_tag", "commit_images_exist"))
    mocks = f"""set -euo pipefail
unset APP_IMAGE_TAG
ROOT_DIR=/fixture
BACKEND_IMAGE=example/backend
FRONTEND_IMAGE=example/frontend
fail() {{ echo "quickstart: $*" >&2; exit 1; }}
git() {{ [[ "$*" == *"rev-parse"* ]] || return 1; echo 123456789abcdef; }}
docker() {{
  if [[ "$1" == manifest ]]; then
    [[ "$*" != *"sha-1234567"* ]] || return {0 if head_exists else 1}
    [[ "$*" != *"frontend"* ]] || return {0 if frontend_exists else 1}
    return 0
  fi
  [[ "$1" == buildx ]] || return 1
  echo '{revision}'
}}
"""
    program = tmp_path / "resolve.sh"
    program.write_text(mocks + functions + "\n" + assignment + '\nprintf \'%s\\n\' "$TAG"\n',
                       encoding="utf-8", newline="\n")
    return subprocess.run([bash, program.as_posix()], capture_output=True, text=True, timeout=20)


@pytest.mark.parametrize("revision,frontend_exists", [("", True), ("not-a-sha", True), ("abcdef123456789", False)])
def test_unpinnable_or_incomplete_pair_fails_instead_of_using_latest(tmp_path, revision, frontend_exists):
    result = resolve(tmp_path, revision=revision, frontend_exists=frontend_exists)
    assert result.returncode != 0
    assert "APP_IMAGE_TAG" in result.stderr
    assert "latest" not in result.stdout.splitlines()


def test_checkout_and_fallback_can_resolve_complete_immutable_pairs(tmp_path):
    head = resolve(tmp_path, head_exists=True)
    assert head.returncode == 0 and head.stdout.strip() == "sha-1234567"
    fallback = resolve(tmp_path, revision="abcdef123456789")
    assert fallback.returncode == 0 and fallback.stdout.strip() == "sha-abcdef1"
