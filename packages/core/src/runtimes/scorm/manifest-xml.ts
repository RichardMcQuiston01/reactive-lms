/** One element of a parsed manifest; names are lower-cased local names. */
export interface XmlElement {
  localName: string;
  attrs: Record<string, string>;
  text: string;
  children: XmlElement[];
}

export function parseXml(xml: string): XmlElement {
  const source = xml
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (_all, body: string) =>
      escapeXml(body),
    )
    .replace(/<!DOCTYPE[^[>]*(?:\[[\s\S]*?\])?\s*>/gi, '');
  const root: XmlElement = {
    localName: '#root',
    attrs: {},
    text: '',
    children: [],
  };
  const stack: XmlElement[] = [root];
  const tagRe = /<(\/)?([^\s/>]+)([^>]*)>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = tagRe.exec(source))) {
    const text = source.slice(lastIndex, match.index);
    const current = stack[stack.length - 1];
    if (current && /[^\s]/.test(text)) {
      current.text += decodeXml(text);
    }
    lastIndex = tagRe.lastIndex;

    const isClose = Boolean(match[1]);
    const rawName = match[2] ?? '';
    const rawAttrs = match[3] ?? '';
    if (isClose) {
      if (stack.length > 1) {
        stack.pop();
      }
      continue;
    }

    const selfClosing = /\/\s*$/.test(rawAttrs);
    const element: XmlElement = {
      localName: toLocalName(rawName),
      attrs: parseAttrs(rawAttrs.replace(/\/\s*$/, '')),
      text: '',
      children: [],
    };
    current?.children.push(element);
    if (!selfClosing) {
      stack.push(element);
    }
  }
  return root;
}

function parseAttrs(raw: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|(\S+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(raw))) {
    const name = match[1];
    if (!name || name === '/') {
      continue;
    }
    attrs[name] = decodeXml(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

export function attr(
  element: XmlElement | undefined,
  name: string,
): string | undefined {
  if (!element) {
    return undefined;
  }
  const want = name.toLowerCase();
  for (const [key, value] of Object.entries(element.attrs)) {
    if (key.toLowerCase() === want || toLocalName(key) === want) {
      return value;
    }
  }
  return undefined;
}

export function childrenNamed(
  element: XmlElement | undefined,
  name: string,
): XmlElement[] {
  if (!element) {
    return [];
  }
  const want = name.toLowerCase();
  return element.children.filter((child) => child.localName === want);
}

export function firstChild(
  element: XmlElement | undefined,
  name: string,
): XmlElement | undefined {
  return childrenNamed(element, name)[0];
}

export function findDescendant(
  element: XmlElement,
  name: string,
): XmlElement | undefined {
  if (element.localName === name.toLowerCase()) {
    return element;
  }
  for (const child of element.children) {
    const found = findDescendant(child, name);
    if (found) {
      return found;
    }
  }
  return undefined;
}

export function textOf(element: XmlElement | undefined, name: string): string {
  const child = firstChild(element, name);
  return child?.text.trim() ?? '';
}

export function toLocalName(name: string): string {
  const index = name.indexOf(':');
  return (index >= 0 ? name.slice(index + 1) : name).toLowerCase();
}

function decodeXml(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_all, hex: string) =>
      fromCodePoint(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);/g, (_all, decimal: string) =>
      fromCodePoint(Number.parseInt(decimal, 10)),
    )
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

/** Escapes text so it can be decoded again once, as CDATA content must be. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function fromCodePoint(codePoint: number): string {
  return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
    ? String.fromCodePoint(codePoint)
    : '';
}
