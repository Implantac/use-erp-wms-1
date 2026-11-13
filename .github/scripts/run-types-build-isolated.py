#!/usr/bin/env python3
"""Capture the original global types/build gates on an isolated CI runner.

No database, browser, deployment or production credentials are used. Every
nonzero gate/timeout/resource/coverage/integrity result remains a failed job.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import signal
import subprocess
import sys
import time

GATES = {
    'types': ['bun', 'run', 'typecheck'],
    'build': ['bun', 'run', 'build'],
}
SAFE_ENV = {
    'PATH', 'HOME', 'USER', 'LANG', 'LC_ALL', 'TMPDIR', 'TEMP', 'CI',
    'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_EXTRA_CA_CERTS',
    'NODE_OPTIONS', 'GOMEMLIMIT', 'GOMAXPROCS', 'GOGC',
    'RAYON_NUM_THREADS', 'SWC_THREADS', 'UV_THREADPOOL_SIZE', 'MALLOC_ARENA_MAX',
    'MCP_FUNCTIONS_DIR', 'PYTHONDONTWRITEBYTECODE',
}


def safe_environment(source):
    env = {key: value for key, value in source.items() if key in SAFE_ENV}
    env.update({'CI': 'true', 'NO_COLOR': '1', 'GIT_TERMINAL_PROMPT': '0',
                'GIT_CONFIG_NOSYSTEM': '1', 'GIT_CONFIG_GLOBAL': '/dev/null'})
    return env


def memory_kib():
    values = {}
    for line in Path('/proc/meminfo').read_text().splitlines():
        name, value = line.split(':', 1)
        if name in ('MemTotal', 'MemAvailable', 'SwapTotal'):
            values[name] = int(value.split()[0])
    return values


def process_group_rss_kib(group):
    total = 0
    for entry in Path('/proc').iterdir():
        if not entry.name.isdigit():
            continue
        try:
            fields = (entry / 'stat').read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) == group:
                total += int((entry / 'statm').read_text().split()[1]) * os.sysconf('SC_PAGE_SIZE') // 1024
        except (OSError, ValueError, IndexError):
            pass
    return total


def run_command(argv, cwd, log_path, env, timeout=1200, max_rss_mib=6144, reserve_mib=512):
    start = time.monotonic()
    proc = None
    interruption = None
    timed_out = False
    limit = None
    peak = 0
    minimum_available = memory_kib()['MemAvailable']

    def kill_group():
        if proc is not None:
            try:
                os.killpg(proc.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass

    def interrupted(signum, _frame):
        nonlocal interruption
        interruption = signum
        kill_group()

    old_handlers = {s: signal.signal(s, interrupted) for s in (signal.SIGTERM, signal.SIGINT)}
    try:
        with log_path.open('xb') as log:
            proc = subprocess.Popen(argv, cwd=cwd, env=env, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
            while proc.poll() is None:
                rss = process_group_rss_kib(proc.pid)
                available = memory_kib()['MemAvailable']
                peak = max(peak, rss)
                minimum_available = min(minimum_available, available)
                if rss > max_rss_mib * 1024:
                    limit = 'process_group_RSS_limit'
                elif available < reserve_mib * 1024:
                    limit = 'host_memory_reserve'
                timed_out = time.monotonic() - start > timeout
                if limit or timed_out or interruption:
                    kill_group()
                    break
                time.sleep(0.25)
            raw_exit = proc.wait()
    finally:
        # Also cover wrapper exits or exceptions that leave a descendant alive.
        kill_group()
        for signum, handler in old_handlers.items():
            signal.signal(signum, handler)
    code = 124 if timed_out else 125 if limit else 128 + interruption if interruption else raw_exit if raw_exit >= 0 else 128 - raw_exit
    return {'command': argv, 'raw_exit': raw_exit, 'exit': code,
            'timed_out': timed_out, 'resource_limit': limit, 'interrupted_signal': interruption,
            'seconds': round(time.monotonic() - start, 3),
            'peak_process_group_RSS_KiB_sampled': peak,
            'minimum_MemAvailable_KiB_sampled': minimum_available}


def type_coverage(text):
    counts = {}
    for name in ('app', 'node'):
        match = re.search(r'\[typecheck:' + name + r'\] passed: (\d+) files total, (\d+) expected source files', text)
        if not match or int(match[1]) <= 0 or int(match[2]) <= 0:
            return None
        counts[name] = {'total_files': int(match[1]), 'expected_source_files': int(match[2])}
    return counts


def build_files(root):
    dist = root / 'dist'
    index = dist / 'index.html'
    if not index.is_file() or not index.stat().st_size or not any(p.stat().st_size > 0 for p in dist.rglob('*.js') if p.is_file()):
        return None
    return [{'path': str(p.relative_to(dist)), 'bytes': p.stat().st_size,
             'sha256': hashlib.sha256(p.read_bytes()).hexdigest()}
            for p in sorted(dist.rglob('*')) if p.is_file()]


def dirty_sources(root):
    return subprocess.check_output(['git', 'status', '--porcelain', '--untracked-files=normal'], cwd=root, text=True).splitlines()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--gate', choices=GATES, required=True)
    parser.add_argument('--output-dir', type=Path, required=True)
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[2]
    out = args.output_dir.resolve()
    out.mkdir(parents=True, exist_ok=True)
    log = out / (args.gate + '.log')
    output = out / (args.gate + '-result.json')
    if log.exists() or output.exists():
        parser.error('Evidence already exists; do not overwrite a gate result')
    env = safe_environment(os.environ)
    record = {'gate': args.gate, 'command': GATES[args.gate],
              'commit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=root, text=True).strip(),
              'memory_before_KiB': memory_kib(),
              'versions': {},
              'production_release_approved': False,
              'database_browser_deploy_or_provider_operation': False,
              'credential_environment_inherited': False}
    for tool in ('node', 'bun'):
        record['versions'][tool] = subprocess.check_output([tool, '--version'], cwd=root, env=env, text=True).strip()
    record['lock_SHA256_before'] = hashlib.sha256((root / 'bun.lock').read_bytes()).hexdigest()
    record['source_changes_before'] = dirty_sources(root)
    real_envs = [p.name for p in root.glob('.env*') if p.is_file() and not p.name.endswith('.example')]
    record['real_environment_files'] = real_envs
    try:
        if record['versions']['bun'] != '1.4.2':
            raise RuntimeError('Bun must be exactly 1.4.2')
        if record['memory_before_KiB']['MemTotal'] < 6144 * 1024:
            raise RuntimeError('This full gate requires the larger runner; no approval on a small runner')
        if record['source_changes_before'] or real_envs:
            raise RuntimeError('Refusing a dirty source tree or real environment file')
        record.update(run_command(GATES[args.gate], root, log, env))
        text = log.read_text(errors='replace')
        record['source_changes_after'] = dirty_sources(root)
        record['lock_SHA256_after'] = hashlib.sha256((root / 'bun.lock').read_bytes()).hexdigest()
        record['sources_unchanged'] = not record['source_changes_after'] and record['lock_SHA256_before'] == record['lock_SHA256_after']
        if not record['sources_unchanged']:
            record['exit'] = record['exit'] or 3
        if args.gate == 'types':
            record['coverage'] = type_coverage(text)
            if record['exit'] == 0 and not record['coverage']:
                record['exit'] = 3
        else:
            record['dist_files'] = build_files(root) if record['exit'] == 0 else None
            if record['exit'] == 0 and not record['dist_files']:
                record['exit'] = 3
        print(text, end='', flush=True)
    except Exception as error:
        record['exit'] = 2
        record['capture_error'] = type(error).__name__ + ': ' + str(error)
        if not log.exists():
            log.write_text(record['capture_error'] + '\n')
    record['log_SHA256'] = hashlib.sha256(log.read_bytes()).hexdigest()
    record['approved'] = record.get('exit') == 0
    output.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print('\n[isolated-gate-result] ' + json.dumps({key: record.get(key) for key in ('gate', 'approved', 'exit', 'seconds', 'capture_error')}, ensure_ascii=False), flush=True)
    return record['exit']


if __name__ == '__main__':
    sys.exit(main())
