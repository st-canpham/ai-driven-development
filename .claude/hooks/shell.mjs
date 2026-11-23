// Minimal bash command splitter for the change-gate and access-guard hooks.
//
// splitCommand(cmd) -> array of segments (each an array of words), or null when
// the command cannot be parsed safely (unterminated quote, $( or backtick).
// Segments come from ; && || | & and newlines, from every $(...) and `...`,
// and recursively from `bash|sh|zsh -c "<script>"` and `eval "<script>"`.
// Wrappers (env, VAR=value, timeout N, nice, nohup, xargs, command, exec,
// time) are stripped so the real program is the first word.
const SEPARATORS = new Set([';', '&&', '||', '|', '&', '\n', '|&']);
const WRAPPERS = new Set(['env', 'command', 'exec', 'nohup', 'nice', 'time', 'xargs', 'stdbuf']);
// Wrapper options that take the next word as their value.
const OPTION_VALUES = {
  xargs: new Set(['-n', '-I', '-L', '-P', '-d', '-E', '-s', '-a', '--max-args', '--max-procs', '--delimiter']),
  timeout: new Set(['-s', '-k', '--signal', '--kill-after']),
  env: new Set(['-u', '-C', '-S', '--unset', '--chdir']),
  nice: new Set(['-n', '--adjustment']),
  stdbuf: new Set(['-i', '-o', '-e']),
};

// Returns { tokens, subs } or null. tokens: words and separator markers.
const lex = (src) => {
  const tokens = [];
  const subs = [];
  let word = '';
  let inWord = false;
  const push = () => {
    if (inWord) tokens.push({ w: word });
    word = '';
    inWord = false;
  };
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === '\\' && i + 1 < src.length) {
      if (src[i + 1] !== '\n') {
        word += src[i + 1];
        inWord = true;
      }
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      if (end < 0) return null;
      word += src.slice(i + 1, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '$' && src[i + 1] === "'") {
      // ANSI-C quoting: keep the text; escapes are not decoded on purpose.
      const end = src.indexOf("'", i + 2);
      if (end < 0) return null;
      word += src.slice(i + 2, end);
      inWord = true;
      i = end + 1;
      continue;
    }
    if (c === '"') {
      let j = i + 1;
      let buf = '';
      for (;;) {
        if (j >= src.length) return null;
        const d = src[j];
        if (d === '\\' && j + 1 < src.length) {
          buf += src[j + 1];
          j += 2;
          continue;
        }
        if (d === '"') break;
        if ((d === '$' && src[j + 1] === '(') || d === '`') {
          const sub = readSub(src, j);
          if (!sub) return null;
          subs.push(sub.body);
          buf += sub.raw;
          j = sub.end;
          continue;
        }
        buf += d;
        j++;
      }
      word += buf;
      inWord = true;
      i = j + 1;
      continue;
    }
    if ((c === '$' && src[i + 1] === '(') || c === '`') {
      const sub = readSub(src, i);
      if (!sub) return null;
      subs.push(sub.body);
      word += sub.raw;
      inWord = true;
      i = sub.end;
      continue;
    }
    if (c === '<' && src[i + 1] === '<' && src[i + 2] !== '<') {
      // Heredoc: the body is data, but a $( ) inside it still runs.
      push();
      const m = /^<<-?\s*(['"]?)([A-Za-z0-9_]+)\1/.exec(src.slice(i));
      if (!m) return null;
      const quoted = m[1] !== '';
      const nl = src.indexOf('\n', i);
      if (nl < 0) return null;
      const endRe = new RegExp(`\\n\\s*${m[2]}\\s*(\\n|$)`);
      const rest = src.slice(nl);
      const em = endRe.exec(rest);
      if (!em) return null;
      const body = rest.slice(0, em.index);
      if (!quoted) {
        // The body is free text: only scan it for command substitutions.
        const found = scanSubs(body);
        if (!found) return null;
        subs.push(...found);
      }
      // Continue after the command line that started the heredoc.
      const lineRest = src.slice(i + m[0].length, nl);
      const tail = lex(lineRest);
      if (!tail) return null;
      tokens.push(...tail.tokens);
      subs.push(...tail.subs);
      tokens.push({ sep: '\n' });
      i = nl + em.index + em[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (SEPARATORS.has(two)) {
      push();
      tokens.push({ sep: two });
      i += 2;
      continue;
    }
    if (SEPARATORS.has(c)) {
      push();
      tokens.push({ sep: c });
      i++;
      continue;
    }
    if (c === '(' || c === ')' || c === '{' || c === '}') {
      push();
      tokens.push({ sep: c });
      i++;
      continue;
    }
    if (c === ' ' || c === '\t') {
      push();
      i++;
      continue;
    }
    if (c === '#' && !inWord) {
      const nl = src.indexOf('\n', i);
      i = nl < 0 ? src.length : nl;
      continue;
    }
    word += c;
    inWord = true;
    i++;
  }
  push();
  return { tokens, subs };
};

// Reads $( ... ) or ` ... ` starting at i. Returns { body, raw, end } or null.
const readSub = (src, i) => {
  if (src[i] === '`') {
    const end = src.indexOf('`', i + 1);
    if (end < 0) return null;
    return { body: src.slice(i + 1, end), raw: src.slice(i, end + 1), end: end + 1 };
  }
  let depth = 0;
  let quote = null;
  for (let j = i + 1; j < src.length; j++) {
    const d = src[j];
    if (quote) {
      if (d === '\\' && quote === '"') j++;
      else if (d === quote) quote = null;
      continue;
    }
    if (d === "'" || d === '"') quote = d;
    else if (d === '(') depth++;
    else if (d === ')') {
      depth--;
      if (depth === 0) return { body: src.slice(i + 2, j), raw: src.slice(i, j + 1), end: j + 1 };
    }
  }
  return null;
};

// Every $(...) and `...` in free text (an unquoted heredoc body), or null.
const scanSubs = (text) => {
  const found = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '\\') {
      i++;
      continue;
    }
    if ((text[i] === '$' && text[i + 1] === '(') || text[i] === '`') {
      const sub = readSub(text, i);
      if (!sub) return null;
      found.push(sub.body);
      i = sub.end - 1;
    }
  }
  return found;
};

const stripWrappers = (words) => {
  let w = words.slice();
  for (let guard = 0; guard < 20 && w.length; guard++) {
    const first = w[0];
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(first)) {
      w = w.slice(1);
    } else if (WRAPPERS.has(first) || first === 'timeout') {
      w = w.slice(1);
      const valued = OPTION_VALUES[first] ?? new Set();
      while (w.length && w[0].startsWith('-')) {
        // "-n 1" takes the next word as its value; "-n1" / "--max-args=1" do not.
        w = valued.has(w[0]) ? w.slice(2) : w.slice(1);
      }
      if (first === 'env') while (w.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1);
      if (first === 'timeout' && w.length) w = w.slice(1); // duration
    } else {
      break;
    }
  }
  return w;
};

export const splitCommand = (cmd, depth = 0) => {
  if (depth > 5) return null;
  const lexed = lex(cmd);
  if (!lexed) return null;
  const segments = [];
  let cur = [];
  for (const t of lexed.tokens) {
    if (t.sep) {
      if (cur.length) segments.push(cur);
      cur = [];
    } else {
      cur.push(t.w);
    }
  }
  if (cur.length) segments.push(cur);

  const out = [];
  for (const seg of segments) {
    const words = stripWrappers(seg);
    if (!words.length) continue;
    out.push(words);
    const prog = words[0].split('/').pop();
    // Nested scripts: bash -c "...", sh -c, zsh -c, eval "..."
    if (['bash', 'sh', 'zsh', 'dash'].includes(prog)) {
      const ci = words.findIndex((x, k) => k > 0 && /^-[a-z]*c[a-z]*$/.test(x));
      if (ci > 0 && words[ci + 1] !== undefined) {
        const inner = splitCommand(words[ci + 1], depth + 1);
        if (!inner) return null;
        out.push(...inner);
      }
    } else if (prog === 'eval' && words.length > 1) {
      const inner = splitCommand(words.slice(1).join(' '), depth + 1);
      if (!inner) return null;
      out.push(...inner);
    }
  }
  for (const body of lexed.subs) {
    const inner = splitCommand(body, depth + 1);
    if (!inner) return null;
    out.push(...inner);
  }
  return out;
};
