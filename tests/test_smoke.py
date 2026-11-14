import importlib


def test_engine_modules_import():
    for name in ("engine", "engine.topo", "engine.dem", "engine.horizon"):
        importlib.import_module(name)
