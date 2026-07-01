import { findNamed, readText } from '../lib/files.js';

const COMMAND_PREFIX = /^(?:npm|pnpm|yarn|bun|npx|node|python|python3|py|pip|pip3|docker|docker compose|make|just|task|cargo|go|mvn|gradle|composer|bundle)\b/i;

function classifyCommand(command) {
  if (/\b(?:install|ci|sync|bootstrap|setup)\b/i.test(command)) return 'install';
  if (/\b(?:dev|start|serve|up|runserver|uvicorn|flask|rails s|spring-boot:run|bootRun)\b/i.test(command)) return 'run';
  if (/^(?:node\s+\S+\.m?js|python3?\s+\S+\.py|py\s+(?:-3\s+)?\S+\.py|php\s+artisan\s+serve|go\s+run|cargo\s+run|dotnet\s+run|bundle\s+exec\s+rails\s+(?:s|server))/i.test(command)) return 'run';
  if (/\b(?:test|check|lint|typecheck|build)\b/i.test(command)) return 'verify';
  return 'unknown';
}

function cleanCommand(line) {
  return line
    .trim()
    .replace(/^\$+\s*/, '')
    .replace(/^(?:PS>|>)\s*/, '')
    .replace(/\s+#.*$/, '')
    .trim();
}

export async function extractReadmeCommands(index) {
  const readmes = findNamed(index, ['README.md', 'README', 'README.rst']).slice(0, 3);
  const commands = [];

  for (const file of readmes) {
    const text = await readText(file);
    if (!text) continue;
    let inFence = false;
    const lines = text.split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
      const raw = lines[index];
      if (/^\s*```/.test(raw)) {
        inFence = !inFence;
        continue;
      }
      const command = cleanCommand(raw);
      if (!command || !COMMAND_PREFIX.test(command)) continue;
      commands.push({
        command,
        source: file.relative,
        line: index + 1,
        kind: classifyCommand(command),
        inFence
      });
      if (commands.length >= 20) return commands;
    }
  }

  return commands;
}
