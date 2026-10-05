#!/usr/bin/env python3
"""Require an actual successful autonomous cycle; a lease skip proves nothing."""
import json
import sys
import time
import urllib.error
import urllib.request


def completed_cycle(body):
    if not isinstance(body, dict) or body.get('ok') is not True:
        return False
    if body.get('skipped') or 'skipped' in str(body.get('msg', '')).lower():
        return False
    q15 = body.get('q15')
    if not isinstance(q15, dict) or q15.get('error') or q15.get('exit_errors'):
        return False
    if q15.get('marks_fresh') is not True:
        return False
    return all(isinstance(body.get(s), dict) and not body[s].get('error') for s in ('evt', 'donch'))


def main(url):
    for attempt in range(12):
        request = urllib.request.Request(url, data=b'{}', headers={'Content-Type': 'application/json'})
        try:
            with urllib.request.urlopen(request, timeout=50) as response:
                body = json.load(response)
            if completed_cycle(body):
                print(json.dumps(body))
                print('Actual autonomous paper cycle completed')
                return 0
            print(f'Attempt {attempt + 1}: cycle not verified: {json.dumps(body)}', flush=True)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            print(f'Attempt {attempt + 1}: {error}', flush=True)
        if attempt < 11:
            time.sleep(5)
    print('No complete healthy paper cycle observed; deployment verification failed', file=sys.stderr)
    return 1


if __name__ == '__main__':
    sys.exit(main(sys.argv[1]))
