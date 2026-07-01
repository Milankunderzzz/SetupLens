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

export async function pythonAdapter({ index, detection }) {
  if (!detection.stacks.includes('python')) return null;

  const command = pythonCommand();
  const frameworks = await detectFrameworks(index);
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
  }

  return {
    id: 'python',
    title: 'Python project adapter',
    confidence: frameworks.length > 0 ? 'high' : 'medium',
    signals: {
      frameworks,
      dependencyFiles: index.files
        .filter((file) => ['requirements.txt', 'pyproject.toml', 'Pipfile'].includes(file.name))
        .map((file) => file.relative)
    },
    actions,
    probes,
    issues: []
  };
}
