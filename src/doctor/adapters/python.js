import path from 'node:path';
import { readText } from '../../lib/files.js';
import { createProbe } from '../probes.js';

function hasFile(index, name) {
  return index.files.some((file) => file.name === name || file.relative === name);
}

async function detectFrameworks(index) {
  const names = new Set();
  for (const file of index.files) {
    if (!['requirements.txt', 'pyproject.toml', 'Pipfile'].includes(file.name) && file.extension !== '.py') continue;
    if (file.size > 512 * 1024) continue;
    const text = await readText(file);
    if (!text) continue;
    if (/\bfastapi\b/i.test(text)) names.add('FastAPI');
    if (/\bflask\b/i.test(text)) names.add('Flask');
    if (/\bdjango\b/i.test(text) || file.name === 'manage.py') names.add('Django');
    if (/\buvicorn\b/i.test(text)) names.add('Uvicorn');
    if (/\bcelery\b/i.test(text)) names.add('Celery');
    if (/\bsqlalchemy\b/i.test(text)) names.add('SQLAlchemy');
  }
  if (hasFile(index, 'manage.py')) names.add('Django');
  return [...names].sort();
}

function pythonCommand() {
  return process.platform === 'win32' ? 'py' : 'python3';
}

async function dependencyText(index) {
  const files = index.files.filter((file) => ['requirements.txt', 'pyproject.toml', 'Pipfile'].includes(file.name));
  const chunks = [];
  for (const file of files) {
    const text = await readText(file);
    if (text) chunks.push(text);
  }
  return chunks.join('\n').toLowerCase();
}

async function fastApiEntrypoints(index) {
  const entries = [];
  const candidates = index.files
    .filter((file) => file.extension === '.py')
    .filter((file) => ['main.py', 'app.py', 'server.py', 'api.py'].includes(file.name));
  for (const file of candidates) {
    const text = await readText(file);
    const match = text?.match(/([A-Za-z_]\w*)\s*=\s*FastAPI\s*\(/);
    if (match) {
      const moduleName = file.relative.replace(/\.py$/i, '').replaceAll('/', '.');
      entries.push({ file: file.relative, variable: match[1], module: moduleName, cwd: path.posix.dirname(file.relative) === '.' ? '.' : path.posix.dirname(file.relative) });
    }
  }
  return entries;
}

function djangoSignals(index) {
  const settings = index.files.filter((file) => /(?:^|\/)settings\.py$/.test(file.relative)).map((file) => file.relative);
  const migrations = index.files.filter((file) => /\/migrations\/\d{4}_.+\.py$/.test(file.relative)).map((file) => file.relative);
  return { settings, migrations };
}

export async function pythonAdapter({ index, detection }) {
  if (!detection.stacks.includes('python')) return null;

  const command = pythonCommand();
  const frameworks = await detectFrameworks(index);
  const deps = await dependencyText(index);
  const fastApi = await fastApiEntrypoints(index);
  const django = djangoSignals(index);
  const requirements = index.files.find((file) => file.name === 'requirements.txt');
  const pyproject = index.files.find((file) => file.name === 'pyproject.toml');
  const manage = index.files.find((file) => file.name === 'manage.py');
  const actions = [
    {
      type: 'install',
      command: `${command} -m venv .venv`,
      cwd: '.',
      reason: 'Create an isolated Python environment before installing dependencies.',
      confidence: 'high'
    }
  ];

  if (requirements) {
    actions.push({
      type: 'install',
      command: `${command} -m pip install -r ${requirements.relative}`,
      cwd: '.',
      reason: `${requirements.relative} declares Python dependencies.`,
      confidence: 'high'
    });
  } else if (pyproject) {
    actions.push({
      type: 'install',
      command: `${command} -m pip install -e .`,
      cwd: '.',
      reason: `${pyproject.relative} declares a Python project.`,
      confidence: 'medium'
    });
  }

  if (manage) {
    actions.push({
      type: 'run',
      command: `${command} manage.py runserver`,
      cwd: '.',
      reason: 'manage.py indicates a Django-style application.',
      confidence: 'high'
    });
  }
  if (fastApi.length > 0) {
    const entry = fastApi[0];
    actions.push({
      type: 'run',
      command: `${command} -m uvicorn ${entry.module}:${entry.variable} --reload`,
      cwd: entry.cwd,
      reason: `${entry.file} creates a FastAPI app.`,
      confidence: 'high'
    });
  }

  const probes = [
    createProbe({
      id: 'python.runtime.version',
      adapter: 'python',
      label: 'Python runtime',
      command,
      args: process.platform === 'win32' ? ['-3', '--version'] : ['--version'],
      purpose: 'Verify that Python is available before running project commands.',
      confidence: 'high'
    })
  ];

  if (manage) {
    probes.push(createProbe({
      id: 'python.django.check',
      adapter: 'python',
      label: 'Django system check',
      command,
      args: process.platform === 'win32' ? ['-3', 'manage.py', 'check'] : ['manage.py', 'check'],
      purpose: 'Run Django checks without starting the server.',
      kind: 'verify',
      confidence: 'high'
    }));
    probes.push(createProbe({
      id: 'python.django.migrations',
      adapter: 'python',
      label: 'Django migration plan',
      command,
      args: process.platform === 'win32' ? ['-3', 'manage.py', 'showmigrations', '--plan'] : ['manage.py', 'showmigrations', '--plan'],
      purpose: 'Inspect Django migration state without applying migrations.',
      kind: 'verify',
      confidence: 'medium'
    }));
  }
  probes.push(createProbe({
    id: 'python.compileall',
    adapter: 'python',
    label: 'Python compile check',
    command,
    args: process.platform === 'win32' ? ['-3', '-m', 'compileall', '-q', '.'] : ['-m', 'compileall', '-q', '.'],
    purpose: 'Compile Python files to catch syntax errors without starting the app.',
    kind: 'verify',
    confidence: 'medium'
  }));

  const issues = [];
  if (fastApi.length > 0 && !deps.includes('uvicorn')) {
    issues.push({
      type: 'fastapi_missing_uvicorn',
      severity: 'warn',
      title: 'FastAPI app may be missing uvicorn',
      evidence: `${fastApi[0].file} creates a FastAPI app, but uvicorn was not found in dependency manifests.`,
      recommendation: 'Add uvicorn to the project dependencies or document the ASGI server used to start the app.'
    });
  }
  if (manage && django.settings.length === 0) {
    issues.push({
      type: 'django_missing_settings',
      severity: 'warn',
      title: 'Django settings module was not found',
      evidence: 'manage.py exists, but no settings.py file was indexed.',
      recommendation: 'Verify the Django settings module location or restore the project settings package.'
    });
  }

  return {
    id: 'python',
    title: 'Python project adapter',
    confidence: frameworks.length > 0 ? 'high' : 'medium',
    signals: {
      frameworks,
      deep: {
        fastApiEntrypoints: fastApi,
        django
      },
      dependencyFiles: index.files
        .filter((file) => ['requirements.txt', 'pyproject.toml', 'Pipfile'].includes(file.name))
        .map((file) => file.relative)
    },
    actions,
    probes,
    issues
  };
}
