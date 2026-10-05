import importlib.util

spec = importlib.util.spec_from_file_location('smoke', 'scripts/smoke-paper-bot.py')
smoke = importlib.util.module_from_spec(spec)
spec.loader.exec_module(smoke)
good = {'ok': True, 'q15': {'marks_fresh': True, 'exit_errors': []}, 'evt': {}, 'donch': {}}
assert smoke.completed_cycle(good)
assert not smoke.completed_cycle({'ok': True, 'msg': 'another run in progress — skipped'})
assert not smoke.completed_cycle({**good, 'skipped': True})
assert not smoke.completed_cycle({**good, 'q15': {'marks_fresh': True, 'exit_errors': ['bad tape']}})
assert not smoke.completed_cycle({**good, 'donch': {'error': 'ledger'}})
assert not smoke.completed_cycle({**good, 'q15': {}})
assert not smoke.completed_cycle({**good, 'ok': False})
print('paper smoke: all assertions passed')
