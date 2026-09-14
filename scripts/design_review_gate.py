#!/usr/bin/env python3
"""Validate immutable design evidence; no network, AI calls or approval generation."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROLES = {'awwwards', 'apple-design-award', 'amateur', 'pro', 'whoop-product', 'psychology', 'gamification', 'accessibility', 'design-system'}

class GateError(ValueError):
    pass

def require(condition, message):
    if not condition:
        raise GateError(message)

def git(repo, *args):
    return subprocess.check_output(['git', '-C', str(repo), *args], text=True).strip()

def load(path):
    return json.loads(Path(path).read_text())

def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()

def validate(repo, packet_path, reports_path, approval_path, expected_commit=None):
    repo, packet_path = Path(repo), Path(packet_path).resolve()
    packet, reports, approval = load(packet_path), load(reports_path), load(approval_path)
    require(packet.get('schema_version') == 1, 'Unsupported evidence schema')
    commit = packet.get('scope_commit', '')
    require(len(commit) == 40 and git(repo, 'rev-parse', f'{commit}^{{commit}}') == commit, 'scope_commit must be an exact commit SHA')
    if expected_commit:
        require(commit == expected_commit, 'Approval/evidence targets a different requested commit')
    roles_raw = subprocess.check_output(['git', '-C', str(repo), 'show', f'{commit}:configs/design-review-roles.json'])
    require(packet.get('roles_version') == hashlib.sha256(roles_raw).hexdigest(), 'Role definitions differ from the reviewed packet')
    require({role['id'] for role in json.loads(roles_raw)['roles']} == ROLES, 'Committed role configuration must contain all nine roles')
    base = packet.get('base_commit', '')
    require(len(base) == 40 and git(repo, 'rev-parse', f'{base}^{{commit}}') == base, 'base_commit must be exact')
    changed = git(repo, 'diff', '--name-only', base, commit).splitlines()
    require(sorted(packet.get('changed_files', [])) == sorted(changed), 'Changed files do not match the reviewed commit range')
    require(bool(changed) and bool(packet.get('scope_summary')), 'Scope must describe a non-empty change')
    require(packet.get('change_kind') in ('ui', 'non-ui'), 'Declare ui or non-ui scope')
    evidence = packet.get('evidence', [])
    ids = set()
    for item in evidence:
        eid = item.get('id')
        require(isinstance(eid, str) and eid and eid not in ids, 'Evidence IDs must be unique')
        ids.add(eid)
        path = (packet_path.parent / item.get('path', '')).resolve()
        require(path.is_file(), f'Missing evidence file: {eid}')
        require(hashlib.sha256(path.read_bytes()).hexdigest() == item.get('sha256'), f'Stale evidence checksum: {eid}')
        require(item.get('kind') in ('screenshot', 'check-output'), f'Invalid evidence kind: {eid}')
        if item['kind'] == 'screenshot':
            raw = path.read_bytes()
            require(raw.startswith(b'\x89PNG\r\n\x1a\n') or raw.startswith(b'\xff\xd8\xff') or (raw.startswith(b'RIFF') and raw[8:12] == b'WEBP'), f'Not a supported screenshot: {eid}')
            require(item.get('state') in ('before', 'after'), f'Screenshot state missing: {eid}')
            viewport = item.get('viewport', {})
            require(all(isinstance(viewport.get(k), int) and viewport[k] > 0 for k in ('width', 'height')), f'Viewport missing: {eid}')
            require(bool(item.get('data_fixture')) and bool(item.get('scenario')), f'Same-data/scenario identifier missing: {eid}')
            require(item.get('source_commit') == (base if item['state'] == 'before' else commit), f'Screenshot source commit mismatch: {eid}')
    require(bool(ids), 'At least one actual evidence file is required')
    require(any(e['kind'] == 'check-output' for e in evidence), 'Functional/check output evidence required')
    if packet['change_kind'] == 'ui':
        shots = [e for e in evidence if e['kind'] == 'screenshot']
        require(bool(shots), 'UI scope needs before/after screenshots')
        def signature(e):
            return (e['scenario'], e['viewport']['width'], e['viewport']['height'], e['data_fixture'], e.get('reduced_motion', False))
        before = {signature(e) for e in shots if e['state'] == 'before'}
        after = {signature(e) for e in shots if e['state'] == 'after'}
        require(before == after and bool(after), 'Each screenshot scenario needs matching before/after viewport and data')
        require(isinstance(packet.get('motion_relevant'), bool), 'Declare whether motion changed')
        if packet['motion_relevant']:
            require(any(e.get('reduced_motion') is True and e['state'] == 'after' for e in shots), 'Motion changes need reduced-motion evidence')
            check_ids = {e['id'] for e in evidence if e['kind'] == 'check-output'}
            require(bool(packet.get('motion_check_refs')) and set(packet['motion_check_refs']) <= check_ids, 'Motion changes also need animation check/video observation evidence')
    else:
        require(bool(packet.get('non_ui_reason')), 'Non-UI scope requires an explicit reason')
    phash = digest(packet)
    require(isinstance(reports, list) and len(reports) == 9, 'Exactly nine reviewer reports required')
    require({r.get('role') for r in reports} == ROLES, 'Missing or duplicate reviewer role')
    agents = [r.get('agent_id') for r in reports]
    require(all(isinstance(a, str) and a.strip() for a in agents) and len(set(agents)) == 9, 'Nine independently identified agents required')
    for r in reports:
        require(r.get('scope_commit') == commit and r.get('packet_sha256') == phash, f'Stale report: {r["role"]}')
        require(r.get('synthetic') is True and bool(r.get('summary')), 'Report must acknowledge synthetic review and give a conclusion')
        require(bool(r.get('evidence_refs')) and set(r['evidence_refs']) <= ids, 'Each reviewer must reference actual supplied evidence')
        if packet['change_kind'] == 'ui':
            require(bool(set(r['evidence_refs']) & {e['id'] for e in evidence if e['kind'] == 'screenshot'}), 'UI reviewers must reference viewed screenshots')
        require(r.get('verdict') in ('pass', 'revise', 'not-applicable'), 'Invalid reviewer verdict')
        require(r.get('verdict') != 'revise', f'Reviewer still requests revision: {r["role"]}')
        if r['verdict'] == 'not-applicable':
            require(packet['change_kind'] == 'non-ui' and bool(r.get('not_applicable_reason')), 'N/A allowed only for explained non-UI scope')
        findings = r.get('findings')
        require(isinstance(findings, list) and len(findings) <= 3, 'At most three concrete findings per reviewer')
        for f in findings:
            require(f.get('severity') in ('P0', 'P1', 'P2', 'P3') and bool(f.get('id')) and bool(f.get('description')), 'Invalid finding')
            require(bool(f.get('evidence_refs')) and set(f['evidence_refs']) <= ids, 'Finding lacks evidence')
            require(f.get('status') in ('open', 'resolved'), 'Finding status missing')
            if f['status'] == 'resolved':
                resolution = f.get('resolution', {})
                require(bool(resolution.get('explanation')) and bool(resolution.get('evidence_refs')) and set(resolution['evidence_refs']) <= ids, 'Resolved finding needs verified resolution evidence')
            require(not (f['severity'] in ('P0', 'P1') and f['status'] != 'resolved'), f'Open deployment blocker: {f["id"]}')
    require(approval.get('approved') is True and approval.get('source') == 'user-message', 'Explicit user approval required; scripts cannot approve')
    require(bool(approval.get('message_reference')) and bool(approval.get('verbatim_approval')), 'Preserve user approval message reference and exact text')
    require(approval.get('scope_commit') == commit and approval.get('packet_sha256') == phash and approval.get('reports_sha256') == digest(reports), 'Approval does not match exact code, evidence and reviews')
    return {'scope_commit': commit, 'packet_sha256': phash, 'reports_sha256': digest(reports), 'roles': 9, 'changed_files': changed}

def parser():
    p = argparse.ArgumentParser(description=__doc__)
    for name in ('repo', 'packet', 'reports', 'approval', 'commit'):
        p.add_argument('--' + name, required=True)
    return p

def main():
    a = parser().parse_args()
    try:
        print(json.dumps(validate(a.repo, a.packet, a.reports, a.approval, a.commit), indent=2))
    except (GateError, OSError, subprocess.CalledProcessError, KeyError, TypeError, json.JSONDecodeError) as exc:
        raise SystemExit(f'Design review blocked: {exc}')

if __name__ == '__main__':
    main()
