#!/usr/bin/env python3
"""Fix relative imports in files that were moved one directory level deeper."""

import os
import re
import sys
from pathlib import Path

repo_root = Path('/Users/coen/Dev/kibana')
streams_app = repo_root / 'x-pack/platform/plugins/shared/streams_app/public'
components = streams_app / 'components'

# (new_parent_dir, added_subdir_name)
moved_groups = [
    (components, 'sig_events'),
    (components, 'stream_management'),
]

# Regex to find relative imports/requires (handles both single and double quotes)
import_re = re.compile(r"""((?:from|import)\s+['"])(\.{1,2}/[^'"]+)(['"])""")
require_re = re.compile(r"""(require\s*\(\s*['"])(\.{1,2}/[^'"]+)(['"\s]*\))""")


def get_old_parent(file_path: Path, components_dir: Path, added_subdir: str) -> Path:
    """Compute old file's parent by stripping the added_subdir level."""
    rel = file_path.relative_to(components_dir / added_subdir)
    return (components_dir / rel).parent


def fix_file(file_path: Path, components_dir: Path, added_subdir: str) -> bool:
    old_parent = get_old_parent(file_path, components_dir, added_subdir)
    new_parent = file_path.parent

    if old_parent == new_parent:
        return False

    content = file_path.read_text(encoding='utf-8')
    original = content

    def fix_import_path(match) -> str:
        prefix, imp_path, suffix = match.group(1), match.group(2), match.group(3)
        if not imp_path.startswith('.'):
            return match.group(0)

        # Resolve from old location
        old_resolved = (old_parent / imp_path).resolve()

        # Resolve from new location
        new_resolved = (new_parent / imp_path).resolve()

        if old_resolved == new_resolved:
            return match.group(0)  # No change needed

        # Compute new relative path from new_parent to old_resolved target
        new_rel = os.path.relpath(old_resolved, new_parent)
        # Ensure it starts with ./ or ../
        if not new_rel.startswith('.'):
            new_rel = './' + new_rel
        # Normalize slashes
        new_rel = new_rel.replace(os.sep, '/')

        return prefix + new_rel + suffix

    content = import_re.sub(fix_import_path, content)
    content = require_re.sub(fix_import_path, content)

    if content != original:
        file_path.write_text(content, encoding='utf-8')
        print(f'  Fixed: {file_path.relative_to(repo_root)}')
        return True
    return False


changed = 0
for base_dir, added_subdir in moved_groups:
    subdir_path = base_dir / added_subdir
    if not subdir_path.exists():
        print(f'Skipping (not found): {subdir_path}')
        continue
    print(f'\nProcessing {subdir_path.relative_to(repo_root)} ...')
    for file_path in subdir_path.rglob('*'):
        if file_path.suffix in ('.ts', '.tsx'):
            if fix_file(file_path, base_dir, added_subdir):
                changed += 1

print(f'\nDone. Fixed {changed} file(s).')
