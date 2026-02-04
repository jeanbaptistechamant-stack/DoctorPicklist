import { exec } from 'child_process';

// Shared Salesforce CLI helpers: run command and parse noisy JSON outputs
export function runSfdx(command: string): Promise<string> {
  return new Promise((resolve) => {
    exec(command, { shell: 'powershell.exe' }, (_error, stdout, stderr) => {
      const combined = `${stdout || ''}\n${stderr || ''}`;
      resolve(combined);
    });
  });
}

export function stripAnsi(input: string): string {
  return input.replace(/\u001b\[[0-9;]*m/g, '');
}

// Extract the largest balanced JSON object block from text
function findJsonCandidates(text: string): string[] {
  const candidates: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      if (depth > 0) {
        depth--;
        if (depth === 0 && start >= 0) {
          candidates.push(text.slice(start, i + 1));
          start = -1;
        }
      }
    }
  }
  if (candidates.length === 0) {
    const s = text.indexOf('{');
    const e = text.lastIndexOf('}');
    if (s !== -1 && e >= s) {
      candidates.push(text.slice(s, e + 1));
    }
  }
  return candidates.sort((a, b) => b.length - a.length);
}

export class SfdxJsonParseError extends Error {
  public readonly rawOutput: string;

  constructor(cleanOutput: string) {
    super('Sortie Salesforce CLI non JSON');
    this.name = 'SfdxJsonParseError';
    this.rawOutput = cleanOutput;
  }
}

export function parseSfdxJson(output: string): any {
  const clean = stripAnsi(output);
  const noise = /^(warning:|warn:|info:|error:|npm warn|sfdx-cli|see .*|try this|===|\[.*\]|\d+\s+\/\s+\d+)/i;
  const lines = clean.split(/\r?\n/).filter(l => !noise.test(l.trim()));
  const filtered = lines.join('\n');

  const tryParse = (text: string) => {
    for (const candidate of findJsonCandidates(text)) {
      try {
        const parsed = JSON.parse(candidate);
        // Valider que c'est un objet avec au moins status ou result
        if (parsed && typeof parsed === 'object' && ('status' in parsed || 'result' in parsed)) {
          return parsed;
        }
      } catch {}
    }
    return null;
  };

  // Try filtered first, then clean, then try to parse the whole output as-is
  let parsed = tryParse(filtered);
  if (parsed !== null) return parsed;
  
  parsed = tryParse(clean);
  if (parsed !== null) return parsed;

  // Last resort: try to parse the entire clean output directly
  try {
    const direct = JSON.parse(clean.trim());
    if (direct && typeof direct === 'object') return direct;
  } catch {}

  // When parsing fails, throw a dedicated error carrying the full clean output
  throw new SfdxJsonParseError(clean.trim());
}
