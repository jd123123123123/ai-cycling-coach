#!/usr/bin/env python3
"""Default: validate and describe deployment only. --execute uploads exact reviewed code."""
import io
import json
from pathlib import Path, PurePosixPath
import subprocess
import tarfile
import tempfile
from design_review_gate import validate, parser, GateError

PROJECT = '0f06d274-aac4-455c-93f9-122ab1788dac'
SERVICE = 'bda428cd-994f-46f1-9042-79882880f6b3'
ENVIRONMENT = 'f45a7fab-bf17-4098-8937-ed616bb8b713'

def excluded(name):
    parts = PurePosixPath(name).parts
    return (any(p in ('node_modules', '__pycache__', '.git', '.railway') for p in parts)
            or name.startswith('frontend/review-')
            or name.startswith('frontend/review-tools/')
            or name.startswith('frontend/review-scenes/')
            or any(p == '.env' or p.startswith('.env.') and p not in ('.env.example', '.env.sample', '.env.template') for p in parts))

def export_commit(repo, commit, destination):
    raw = subprocess.check_output(['git', '-C', str(repo), 'archive', '--format=tar', commit])
    # Archive is generated from Git, never from the dirty working directory.
    with tarfile.open(fileobj=io.BytesIO(raw)) as archive:
        members = [m for m in archive.getmembers() if not excluded(m.name)]
        archive.extractall(destination, members=members, filter='data')
    return len(members)

def main():
    p = parser(); p.add_argument('--execute', action='store_true', help='Explicitly upload after review validation; never implies user approval')
    a = p.parse_args()
    result = validate(a.repo, a.packet, a.reports, a.approval, a.commit)
    print(json.dumps({'mode': 'execute' if a.execute else 'dry-run', **result, 'project': PROJECT, 'service': SERVICE, 'environment': ENVIRONMENT}, indent=2))
    if not a.execute:
        print('No archive, network request or deployment performed. Re-run with --execute only after user approval.')
        return
    with tempfile.TemporaryDirectory(prefix='ridr-reviewed-') as temp:
        export_commit(a.repo, result['scope_commit'], Path(temp))
        # CLI-only; project and environment are explicitly linked in the clean export.
        subprocess.run(['railway', 'link', '--project', PROJECT, '--service', SERVICE, '--environment', ENVIRONMENT], cwd=temp, check=True)
        subprocess.run(['railway', 'up', '--service', SERVICE, '--environment', ENVIRONMENT, '--detach', '--message', f'{result["scope_commit"]} nine-role reviewed release'], cwd=temp, check=True)
    print('Upload requested. Deployment success and live bundle/health still require verification.')

if __name__ == '__main__':
    try:
        main()
    except (GateError, OSError, subprocess.CalledProcessError, KeyError, TypeError, ValueError) as exc:
        raise SystemExit(f'Deployment blocked: {exc}')
