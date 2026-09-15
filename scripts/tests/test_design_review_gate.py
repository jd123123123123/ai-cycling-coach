import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from design_review_gate import ROLES, GateError, digest, validate
from deploy_reviewed import excluded, export_commit, main as deploy_main

class ReviewGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.root = Path(self.tmp.name)
        self.repo = self.root / 'repo'; self.repo.mkdir()
        def git(*args): return subprocess.check_output(['git', '-C', str(self.repo), *args], text=True, stderr=subprocess.DEVNULL).strip()
        self.git = git
        git('init'); git('config', 'user.email', 'test@example.test'); git('config', 'user.name', 'Test')
        (self.repo/'configs').mkdir()
        roles = (Path(__file__).resolve().parents[2]/'configs/design-review-roles.json').read_bytes()
        (self.repo/'configs/design-review-roles.json').write_bytes(roles)
        (self.repo / 'app.txt').write_text('before'); git('add', '.'); git('commit', '-m', 'before'); self.base = git('rev-parse', 'HEAD')
        (self.repo / 'app.txt').write_text('after'); git('add', '.'); git('commit', '-m', 'after'); self.commit = git('rev-parse', 'HEAD')
        # Signature suffices for this fixture: the gate checks content identity, not visual quality.
        png = b'\x89PNG\r\n\x1a\nfixture'; (self.root / 'shot.png').write_bytes(png)
        self.packet = {'schema_version': 1, 'scope_commit': self.commit, 'base_commit': self.base, 'scope_summary': 'Change app', 'changed_files': ['app.txt'], 'change_kind': 'ui', 'motion_relevant': False, 'evidence': [dict(id=state, path='shot.png', sha256=hashlib.sha256(png).hexdigest(), kind='screenshot', state=state, source_commit=self.base if state == 'before' else self.commit, viewport={'width':390,'height':844}, data_fixture='rider-v1', scenario='main') for state in ('before','after')]}
        self.packet['roles_version'] = hashlib.sha256(roles).hexdigest()
        (self.root/'checks.txt').write_text('Test evidence fixture')
        self.packet['evidence'].append(dict(id='checks', kind='check-output', path='checks.txt', sha256=hashlib.sha256((self.root/'checks.txt').read_bytes()).hexdigest()))
        self.reports = [dict(role=role, agent_id=f'agent-{role}', scope_commit=self.commit, packet_sha256=digest(self.packet), synthetic=True, summary='Actual supplied screenshot inspected', evidence_refs=['after'], verdict='pass', findings=[]) for role in sorted(ROLES)]
        self.approval = {'approved':True,'source':'user-message','message_reference':'test-only-user-message','verbatim_approval':'Test fixture approval only','scope_commit':self.commit,'packet_sha256':digest(self.packet),'reports_sha256':digest(self.reports)}
    def tearDown(self): self.tmp.cleanup()
    def check(self, commit=None, luna_fallback=False):
        for name, value in [('packet',self.packet),('reports',self.reports),('approval',self.approval)]: (self.root / f'{name}.json').write_text(json.dumps(value))
        return validate(self.repo, self.root/'packet.json', self.root/'reports.json', self.root/'approval.json', commit or self.commit, luna_fallback)
    def test_valid_exact_scope(self): self.assertEqual(self.check()['roles'],9)
    def test_explicit_luna_fallback(self):
        self.reports = [dict(role='luna-fallback', agent_id='gpt-5.6-luna-review', review_lenses=['awwwards','apple-design-award','whoop-product'], scope_commit=self.commit, packet_sha256=digest(self.packet), synthetic=True, summary='Single Luna review inspected the supplied evidence through the three declared lenses', evidence_refs=['after'], verdict='pass', findings=[])]
        self.approval['review_mode'] = 'luna-fallback'
        self.approval['reports_sha256'] = digest(self.reports)
        self.assertEqual(self.check(luna_fallback=True)['roles'], 1)
        with self.assertRaises(GateError): self.check()
    def test_missing_role(self):
        self.reports.pop()
        with self.assertRaises(GateError): self.check()
    def test_duplicate_agent(self):
        self.reports[0]['agent_id'] = self.reports[1]['agent_id']
        with self.assertRaises(GateError): self.check()
    def test_stale_screenshot(self):
        (self.root/'shot.png').write_bytes(b'changed')
        with self.assertRaises(GateError): self.check()
    def test_stale_report(self):
        self.reports[0]['packet_sha256']='stale'
        with self.assertRaises(GateError): self.check()
    def test_pending_blocker(self):
        self.reports[0]['findings']=[dict(id='clip',severity='P1',description='Image clipped',evidence_refs=['after'],status='open')]
        with self.assertRaises(GateError): self.check()
    def test_unproven_resolution(self):
        self.reports[0]['findings']=[dict(id='clip',severity='P1',description='Image clipped',evidence_refs=['after'],status='resolved')]
        with self.assertRaises(GateError): self.check()
    def test_wrong_requested_commit(self):
        with self.assertRaises(GateError): self.check(self.base)
    def test_approval_missing(self):
        self.approval['approved']=False
        with self.assertRaises(GateError): self.check()
    def test_approval_stale_reviews(self):
        self.approval['reports_sha256']='stale'
        with self.assertRaises(GateError): self.check()
    def test_viewports_must_match(self):
        self.packet['evidence'][0]['viewport']['width']=320
        with self.assertRaises(GateError): self.check()
    def test_motion_evidence_required(self):
        self.packet['motion_relevant']=True
        with self.assertRaises(GateError): self.check()
    def test_changed_role_definitions(self):
        self.packet['roles_version']='stale'
        with self.assertRaises(GateError): self.check()
    def test_missing_check_output(self):
        self.packet['evidence']=self.packet['evidence'][:2]
        with self.assertRaises(GateError): self.check()
    def test_actual_changed_files(self):
        self.packet['changed_files']=[]
        with self.assertRaises(GateError): self.check()
    def test_dry_run_never_exports_or_calls_railway(self):
        args=['deploy_reviewed.py','--repo','repo','--packet','packet','--reports','reports','--approval','approval','--commit',self.commit]
        with patch('sys.argv',args), patch('deploy_reviewed.validate',return_value={'scope_commit':self.commit}), patch('deploy_reviewed.export_commit') as export, patch('deploy_reviewed.subprocess.run') as run, patch('builtins.print'):
            deploy_main()
            export.assert_not_called(); run.assert_not_called()
    def test_export_ignores_dirty_checkout(self):
        (self.repo/'app.txt').write_text('UNREVIEWED')
        dest=self.root/'export'; dest.mkdir(); export_commit(self.repo,self.commit,dest)
        self.assertEqual((dest/'app.txt').read_text(),'after')
    def test_export_excludes_local_previews_and_credentials(self):
        for name in ['frontend/review-scenes.html','frontend/review-tools/capture.png','.env','backend/.env.production','frontend/node_modules/a.js']:
            self.assertTrue(excluded(name),name)
        self.assertFalse(excluded('frontend/src/editorial/w3/W3SceneCollection.tsx'))
        self.assertFalse(excluded('backend/.env.example'))

if __name__ == '__main__': unittest.main()
