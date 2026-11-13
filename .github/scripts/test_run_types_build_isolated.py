import importlib.util
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location('isolated_gates', Path(__file__).with_name('run-types-build-isolated.py'))
gates = importlib.util.module_from_spec(spec)
spec.loader.exec_module(gates)


class CollectorContracts(unittest.TestCase):
    def run_small(self, code, **options):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            return gates.run_command([sys.executable, '-c', code], root, root / 'gate.log', gates.safe_environment(os.environ), reserve_mib=0, **options)

    def test_success_and_nonzero_exit_are_not_confused(self):
        self.assertEqual(self.run_small('print("fixture success")')['exit'], 0)
        result = self.run_small('raise SystemExit(7)')
        self.assertEqual(result['exit'], 7)
        self.assertEqual(result['raw_exit'], 7)

    def test_credential_and_provider_environment_is_not_inherited(self):
        source = {'PATH': '/bin', 'GITHUB_TOKEN': 'fixture-not-a-credential', 'DATABASE_URL': 'fixture-not-a-database', 'VITE_SUPABASE_URL': 'fixture-only', 'NODE_OPTIONS': '--max-old-space-size=4096'}
        env = gates.safe_environment(source)
        self.assertEqual(env['PATH'], '/bin')
        self.assertEqual(env['NODE_OPTIONS'], source['NODE_OPTIONS'])
        for name in ('GITHUB_TOKEN', 'DATABASE_URL', 'VITE_SUPABASE_URL'):
            self.assertNotIn(name, env)

    def test_timeout_stops_the_child_and_descendant_process_group(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            pid = root / 'descendant.pid'
            code = 'import subprocess,sys,time; from pathlib import Path; p=subprocess.Popen([sys.executable,"-c","import time; time.sleep(60)"]); Path(sys.argv[1]).write_text(str(p.pid)); time.sleep(60)'
            result = gates.run_command([sys.executable, '-c', code, str(pid)], root, root / 'timeout.log', gates.safe_environment(os.environ), timeout=0.8, reserve_mib=0)
            self.assertEqual(result['exit'], 124)
            self.assertTrue(result['timed_out'])
            self.assertTrue(pid.is_file())
            proc = Path('/proc') / pid.read_text() / 'stat'
            if proc.exists():
                self.assertEqual(proc.read_text().rsplit(')', 1)[1].split()[0], 'Z')

    def test_memory_policy_is_a_failed_gate_not_success(self):
        result = self.run_small('import time; x=bytearray(16*1024*1024); time.sleep(30)', max_rss_mib=1, timeout=5)
        self.assertEqual(result['exit'], 125)
        self.assertEqual(result['resource_limit'], 'process_group_RSS_limit')

    def test_types_must_prove_positive_coverage_for_both_projects(self):
        app = '[typecheck:app] passed: 4000 files total, 1748 expected source files\n'
        node = '[typecheck:node] passed: 100 files total, 1 expected source files\n'
        self.assertEqual(gates.type_coverage(app + node)['app']['expected_source_files'], 1748)
        self.assertIsNone(gates.type_coverage(app))
        self.assertIsNone(gates.type_coverage(node))
        self.assertIsNone(gates.type_coverage(app + node.replace('1 expected', '0 expected')))
        self.assertIsNone(gates.type_coverage(''))

    def test_build_requires_real_nonempty_index_and_javascript(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            self.assertIsNone(gates.build_files(root))
            (root / 'dist').mkdir()
            (root / 'dist/index.html').write_text('<html></html>')
            self.assertIsNone(gates.build_files(root))
            (root / 'dist/app.js').write_bytes(b'')
            self.assertIsNone(gates.build_files(root))
            (root / 'dist/app.js').write_text('console.log("fixture only");')
            files = gates.build_files(root)
            self.assertEqual(len(files), 2)
            self.assertTrue(all(len(row['sha256']) == 64 for row in files))

    def test_gate_commands_keep_original_scope(self):
        self.assertEqual(gates.GATES['types'], ['bun', 'run', 'typecheck'])
        self.assertEqual(gates.GATES['build'], ['bun', 'run', 'build'])


if __name__ == '__main__':
    unittest.main()
