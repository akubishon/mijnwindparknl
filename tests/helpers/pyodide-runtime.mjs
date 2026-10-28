import {loadPyodide} from 'pyodide';
import {readFileSync, readdirSync} from 'node:fs';

const source = new URL('../../src/opsplitsing/', import.meta.url);
const read = (path, encoding) => readFileSync(new URL(path, source), encoding);

// The browser model (python/ + browser-runtime.py) in Pyodide, laid out like the worker does. `extra` is Python run
// afterwards, in the runtime's namespace.
export async function loadBrowserModel({year = 2025, extra = ''} = {}) {
  const py = await loadPyodide();
  py.FS.mkdirTree('/app/windprofiel/data');
  for (const file of readdirSync(new URL('python/', source))) if (file.endsWith('.py')) py.FS.writeFile('/app/windprofiel/' + file, read('python/' + file));
  for (const file of readdirSync(new URL('python/data/', source))) py.FS.writeFile('/app/windprofiel/data/' + file, read('python/data/' + file));
  py.FS.mkdirTree('/app/zoneinfo/Europe');
  py.FS.writeFile('/app/zoneinfo/Europe/Amsterdam', read('Amsterdam'));
  py.FS.mkdirTree('/app/data');
  py.FS.writeFile(`/app/data/${year}.json`, read(`data/${year}.json`));
  py.runPython("import sys,zoneinfo\nsys.path.insert(0,'/app')\nzoneinfo.reset_tzpath(['/app/zoneinfo'])");
  py.runPython(read('browser-runtime.py', 'utf8'));
  if (extra) py.runPython(extra);
  return {
    py,
    // Evaluate a Python expression that returns JSON-able data.
    json: expression => JSON.parse(py.runPython(`json.dumps(${expression}, allow_nan=False)`)),
  };
}
