import { VSCODE_EXTENSIONS } from '../constants.js';
import { finding, uniqueBy } from '../lib/utils.js';

export function editorFindings(detection) {
  const extensions = detection.stacks
    .flatMap((stack) => VSCODE_EXTENSIONS[stack] ?? [])
    .map(([id, reason]) => ({ id, reason }));
  const unique = uniqueBy(extensions, (extension) => extension.id);

  return {
    extensions: unique,
    findings: unique.length === 0 ? [] : [finding({
      id: 'editor.vscode.recommendations',
      category: 'Editor',
      status: 'info',
      title: 'VS Code recommendations',
      message: `${unique.length} extensions match the detected stack.`,
      evidence: unique.map((extension) => extension.id).join(', ')
    })]
  };
}
