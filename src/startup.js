import fs from 'node:fs';
import path from 'node:path';
import { FINDING_SCOPES } from './constants.js';
import { toPosix } from './lib/utils.js';

const START_SCRIPT_PRIORITY = ['dev', 'start', 'serve', 'preview'];
const STARTUP_BLOCKER_CATEGORIES = new Set(['Configuration', 'Dependencies', 'Paths', 'Runtime', 'Stack']);

function relativeDirectory(file) {
  const directory = path.posix.dirname(file.relative);
  return directory === '.' ? '.' : directory;
}

function commandStep({ phase, command, cwd = '.', reason, confidence = 'medium' }) {
  return { phase, command, cwd, reason, confidence };
}

function commandForScript(manager, pkg, script) {
  const prefix = pkg.relativeDirectory === '.' ? '' : `cd ${pkg.relativeDirectory} && `;
  if (manager === 'yarn') return `${prefix}yarn ${script}`;
  if (manager === 'pnpm') return `${prefix}pnpm ${script}`;
  if (manager === 'bun') return `${prefix}bun run ${script}`;
  return `${prefix}npm run ${script}`;
}

function managerForPackage(index, detection, pkg) {
  if (detection.workspace?.manager) return detection.workspace.manager;
  const declared = String(pkg?.manifest.packageManager ?? '').split('@')[0];
  if (declared) return declared;
  if (fs.existsSync(path.join(pkg.directory, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(pkg.directory, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(pkg.directory, 'bun.lock')) || fs.existsSync(path.join(pkg.directory, 'bun.lockb'))) return 'bun';
  if (fs.existsSync(path.join(index.root, 'pnpm-lock.yaml'))) return 'pnpm';
  if (fs.existsSync(path.join(index.root, 'yarn.lock'))) return 'yarn';
  if (fs.existsSync(path.join(index.root, 'bun.lock')) || fs.existsSync(path.join(index.root, 'bun.lockb'))) return 'bun';
  return 'npm';
}

function installCommand(manager, directory = '.') {
  const prefix = directory === '.' ? '' : `cd ${directory} && `;
  if (manager === 'yarn') return `${prefix}yarn install`;
  if (manager === 'pnpm') return `${prefix}pnpm install`;
  if (manager === 'bun') return `${prefix}bun install`;
  return `${prefix}npm install`;
}

function declaredDependencyCount(pkg) {
  return Object.keys(pkg.manifest.dependencies ?? {}).length
    + Object.keys(pkg.manifest.devDependencies ?? {}).length
    + Object.keys(pkg.manifest.optionalDependencies ?? {}).length;
}

function nodeStartup(index, detection) {
  const steps = [];
  const notes = [];
  const packages = detection.workspace
    ? [detection.workspace.rootPackage, ...detection.workspace.members]
    : detection.packages;
  const rootPackage = packages.find((pkg) => pkg.relativeDirectory === '.') ?? packages[0];
  const manager = managerForPackage(index, detection, rootPackage);
  const dependencyCount = packages.reduce((total, pkg) => total + declaredDependencyCount(pkg), 0);
  const installDirectory = detection.workspace ? '.' : rootPackage?.relativeDirectory ?? '.';
  const installed = fs.existsSync(path.join(index.root, installDirectory, 'node_modules'))
    || (detection.workspace && fs.existsSync(path.join(index.root, 'node_modules')));

  if (dependencyCount > 0 && !installed) {
    steps.push(commandStep({
      phase: 'install',
      command: installCommand(manager, installDirectory),
      reason: `${dependencyCount} declared Node dependencies are not installed.`,
      confidence: 'high'
    }));
  }

  const runnablePackages = packages
    .map((pkg) => {
      const script = START_SCRIPT_PRIORITY.find((name) => pkg.manifest.scripts?.[name]);
      return script ? { pkg, script } : null;
    })
    .filter(Boolean);

  if (runnablePackages.length > 0) {
    for (const item of runnablePackages.slice(0, 3)) {
      steps.push(commandStep({
        phase: 'run',
        command: commandForScript(manager, item.pkg, item.script),
        cwd: item.pkg.relativeDirectory,
        reason: `${item.pkg.relativeDirectory === '.' ? 'Root package' : item.pkg.relativeDirectory} defines "${item.script}".`,
        confidence: 'high'
      }));
    }
  } else if (rootPackage?.manifest.bin) {
    const [binTarget] = Object.values(typeof rootPackage.manifest.bin === 'string'
      ? { [rootPackage.manifest.name ?? 'cli']: rootPackage.manifest.bin }
      : rootPackage.manifest.bin);
    steps.push(commandStep({
      phase: 'run',
      command: `node ${toPosix(String(binTarget))}`,
      reason: 'The package exposes a CLI entry point.',
      confidence: 'medium'
    }));
  } else if (packages.length > 0) {
    notes.push({
      level: 'warn',
      title: 'No obvious Node start command',
      message: 'No dev, start, serve, preview script, or bin entry was found in the detected package manifests.',
      recommendation: 'Document the actual startup command or add a package script such as "dev" or "start".'
    });
  }

  return { steps, notes };
}

function findFirst(index, names) {
  const wanted = new Set(Array.isArray(names) ? names : [names]);
  return index.files.find((file) => wanted.has(file.relative) || wanted.has(file.name));
}

function readFile(file) {
  try {
    return fs.readFileSync(file.absolute, 'utf8');
  } catch {
    return '';
  }
}

function pythonModuleName(file) {
  return toPosix(file.relative).replace(/\.py$/i, '').replaceAll('/', '.');
}

function pythonRunStep(index) {
  const manage = findFirst(index, 'manage.py');
  if (manage) {
    return commandStep({
      phase: 'run',
      command: 'python manage.py runserver',
      reason: 'manage.py indicates a Django-style application.',
      confidence: 'high'
    });
  }

  const candidates = index.files
    .filter((file) => /\.py$/i.test(file.name))
    .filter((file) => ['app.py', 'main.py', 'server.py', 'wsgi.py', 'asgi.py'].includes(file.name))
    .sort((left, right) => relativeDirectory(left).localeCompare(relativeDirectory(right)) || left.name.localeCompare(right.name));

  for (const file of candidates) {
    const text = readFile(file);
    const fastApi = text.match(/([A-Za-z_]\w*)\s*=\s*FastAPI\s*\(/);
    if (fastApi) {
      return commandStep({
        phase: 'run',
        command: `python -m uvicorn ${pythonModuleName(file)}:${fastApi[1]} --reload`,
        cwd: relativeDirectory(file),
        reason: `${file.relative} creates a FastAPI app.`,
        confidence: 'high'
      });
    }

    const flask = text.match(/([A-Za-z_]\w*)\s*=\s*Flask\s*\(/);
    if (flask) {
      return commandStep({
        phase: 'run',
        command: `python -m flask --app ${pythonModuleName(file)} run`,
        cwd: relativeDirectory(file),
        reason: `${file.relative} creates a Flask app.`,
        confidence: 'high'
      });
    }
  }

  const simple = candidates[0];
  if (simple) {
    return commandStep({
      phase: 'run',
      command: `python ${toPosix(simple.relative)}`,
      cwd: relativeDirectory(simple),
      reason: `${simple.relative} looks like the most likely Python entry point.`,
      confidence: 'medium'
    });
  }

  return null;
}

function pythonStartup(index) {
  const steps = [];
  const notes = [];
  const hasVenv = ['.venv', 'venv', 'backend/.venv', 'backend/venv']
    .some((relative) => fs.existsSync(path.join(index.root, relative)));
  const requirements = findFirst(index, 'requirements.txt');
  const pyproject = findFirst(index, 'pyproject.toml');

  if (!hasVenv) {
    steps.push(commandStep({
      phase: 'install',
      command: 'python -m venv .venv',
      reason: 'No project-local Python virtual environment was found.',
      confidence: 'high'
    }));
  }

  if (requirements) {
    steps.push(commandStep({
      phase: 'install',
      command: `python -m pip install -r ${toPosix(requirements.relative)}`,
      reason: `${requirements.relative} declares Python dependencies.`,
      confidence: 'high'
    }));
  } else if (pyproject) {
    steps.push(commandStep({
      phase: 'install',
      command: 'python -m pip install -e .',
      reason: `${pyproject.relative} declares a Python project.`,
      confidence: 'medium'
    }));
  }

  const run = pythonRunStep(index);
  if (run) steps.push(run);
  else {
    notes.push({
      level: 'warn',
      title: 'No obvious Python entry point',
      message: 'No manage.py, FastAPI app, Flask app, app.py, main.py, server.py, wsgi.py, or asgi.py entry point was found.',
      recommendation: 'Document the startup command in README or add a conventional app entry point.'
    });
  }

  return { steps, notes };
}

function dockerStartup(index, findings) {
  const steps = [];
  const notes = [];
  const compose = findFirst(index, ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']);
  const dockerfile = findFirst(index, 'Dockerfile');
  const composePathFailure = findings.some((item) => item.id.startsWith('paths.compose.') && item.status === 'fail');

  if (compose) {
    if (!composePathFailure) {
      steps.push(commandStep({
        phase: 'run',
        command: `docker compose -f ${toPosix(compose.relative)} up --build`,
        reason: `${compose.relative} defines a Docker Compose environment.`,
        confidence: 'high'
      }));
    } else {
      notes.push({
        level: 'fail',
        title: 'Docker Compose cannot start yet',
        message: 'Compose references missing local paths, so the start command is withheld until paths are fixed.',
        recommendation: 'Fix the missing Dockerfile, volume, or directory paths reported below.'
      });
    }
  } else if (dockerfile) {
    steps.push(commandStep({
      phase: 'run',
      command: 'docker build -t setuplens-target .',
      reason: 'A root Dockerfile is present.',
      confidence: 'medium'
    }));
  }

  return { steps, notes };
}

function findingRef(item) {
  return {
    id: item.id,
    status: item.status,
    title: item.title,
    category: item.category,
    message: item.message,
    evidence: item.evidence,
    recommendation: item.recommendation
  };
}

function startupRelevantWarning(item) {
  if (item.scope !== FINDING_SCOPES.SETUP || item.status !== 'warn' || !item.recommendation) return false;
  if (item.category === 'Configuration') return true;
  if (item.category === 'Runtime' || item.category === 'Stack') return true;
  if (item.id === 'dependencies.python.venv') return true;
  if (item.id === 'dependencies.node.workspace-installed') return true;
  if (item.id.startsWith('dependencies.node.installed.')) return true;
  return false;
}

function startupBlocker(item) {
  return item.scope === FINDING_SCOPES.SETUP
    && item.status === 'fail'
    && STARTUP_BLOCKER_CATEGORIES.has(item.category);
}

function safetyRisk(item) {
  return item.scope === FINDING_SCOPES.SETUP
    && item.category === 'Security'
    && ['fail', 'warn'].includes(item.status);
}

function uniqueSteps(steps) {
  const seen = new Set();
  return steps.filter((step) => {
    const key = `${step.phase}:${step.cwd}:${step.command}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStartupDiagnosis(index, detection, findings, eligibility) {
  const steps = [];
  const notes = [];

  if (detection.stacks.includes('node')) {
    const node = nodeStartup(index, detection);
    steps.push(...node.steps);
    notes.push(...node.notes);
  }
  if (detection.stacks.includes('python')) {
    const python = pythonStartup(index);
    steps.push(...python.steps);
    notes.push(...python.notes);
  }
  if (detection.stacks.includes('docker')) {
    const docker = dockerStartup(index, findings);
    steps.push(...docker.steps);
    notes.push(...docker.notes);
  }

  const blockers = findings.filter(startupBlocker).map(findingRef);
  const risks = findings.filter(safetyRisk).map(findingRef);
  const warnings = findings.filter(startupRelevantWarning).map(findingRef);
  const runCommands = uniqueSteps(steps).filter((step) => step.phase === 'run');
  const setupCommands = uniqueSteps(steps).filter((step) => step.phase !== 'run');
  const hasSyntheticFailure = notes.some((note) => note.level === 'fail');

  let status = 'ready';
  if (!eligibility.scorable) status = 'unsupported';
  else if (blockers.length > 0 || hasSyntheticFailure) status = 'blocked';
  else if (setupCommands.length > 0 || warnings.length > 0 || runCommands.length === 0) status = 'needs_setup';

  const summary = {
    unsupported: eligibility.message ?? 'Setup readiness cannot be scored for this repository.',
    blocked: `Cannot start yet: ${blockers.length + Number(hasSyntheticFailure)} startup blocker${blockers.length + Number(hasSyntheticFailure) === 1 ? '' : 's'} found.`,
    needs_setup: runCommands.length > 0
      ? `Likely runnable after ${setupCommands.length + warnings.length} setup step${setupCommands.length + warnings.length === 1 ? '' : 's'}.`
      : 'Setup blockers were not found, but no reliable startup command was detected.',
    ready: runCommands.length > 0
      ? 'No startup blockers found. Try the detected run command.'
      : 'No startup blockers found, but the startup command is not obvious.'
  }[status];

  return {
    status,
    summary,
    supportedStacks: detection.stacks,
    setupCommands,
    runCommands,
    blockers,
    warnings,
    risks,
    notes
  };
}
