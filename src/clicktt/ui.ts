/** Status bar and field highlighting injected into the click-tt page. */

const BAR_ID = 'ttfm-bar';
const MARK_CLASS = 'ttfm-mark';
const MARK_COLOR = '#c62828';

export type StatusTone = 'info' | 'busy' | 'success' | 'warning' | 'error';

const TONE_COLORS: Record<StatusTone, string> = {
  info: '#1565c0',
  busy: '#1565c0',
  success: '#2e7d32',
  warning: '#ef6c00',
  error: MARK_COLOR,
};

export interface StatusBar {
  setStatus(tone: StatusTone, text: string, details?: string[]): void;
  /** Shows the photo button; calls back with the chosen file. */
  enablePhotoButton(onFile: (file: File) => void): void;
  disablePhotoButton(): void;
}

export function mountStatusBar(doc: Document): StatusBar {
  doc.getElementById(BAR_ID)?.remove();
  const bar = doc.createElement('div');
  bar.id = BAR_ID;
  bar.style.cssText =
    'margin:8px 0 12px;padding:8px 12px;border:2px solid #1565c0;border-radius:4px;background:#f5f9ff;font:13px Arial,sans-serif;color:#222';

  const top = doc.createElement('div');
  top.style.cssText = 'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
  const title = doc.createElement('strong');
  title.textContent = 'Matchblatt-Scanner';
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = 'Foto einlesen…';
  button.style.cssText = 'display:none;padding:3px 10px;cursor:pointer';
  const fileInput = doc.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/*';
  fileInput.style.display = 'none';
  const status = doc.createElement('span');
  top.append(title, button, fileInput, status);

  const details = doc.createElement('ul');
  details.style.cssText = 'margin:6px 0 0 18px;padding:0';
  bar.append(top, details);

  const anchor = doc.querySelector('#content-row1 ol.progress') ?? doc.querySelector('#content-row1 h1');
  if (anchor?.parentNode) anchor.parentNode.insertBefore(bar, anchor.nextSibling);
  else doc.body.prepend(bar);

  let onFileCallback: ((file: File) => void) | null = null;
  button.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (file && onFileCallback) onFileCallback(file);
  });

  return {
    setStatus(tone, text, items = []) {
      bar.style.borderColor = TONE_COLORS[tone];
      status.style.color = TONE_COLORS[tone];
      status.textContent = tone === 'busy' ? `⏳ ${text}` : text;
      details.replaceChildren(
        ...items.map((item) => {
          const li = doc.createElement('li');
          li.textContent = item;
          return li;
        }),
      );
    },
    enablePhotoButton(onFile) {
      onFileCallback = onFile;
      button.style.display = '';
      button.disabled = false;
    },
    disablePhotoButton() {
      button.disabled = true;
    },
  };
}

/** German hint for a written name that fits several roster players. */
export function ambiguityHint(alternatives: readonly string[]): string {
  return `passt auf mehrere Spieler (${alternatives.join(' / ')})`;
}

/** Outlines a form field and shows a short message next to it. */
export function markField(element: HTMLElement, message: string): void {
  const doc = element.ownerDocument;
  element.style.outline = `2px solid ${MARK_COLOR}`;
  element.style.outlineOffset = '1px';
  element.title = message;
  const note = doc.createElement('div');
  note.className = MARK_CLASS;
  note.textContent = message;
  note.style.cssText = `color:${MARK_COLOR};font:11px Arial,sans-serif;max-width:220px;white-space:normal`;
  element.insertAdjacentElement('afterend', note);
}

export function clearMarks(doc: Document): void {
  doc.querySelectorAll(`.${MARK_CLASS}`).forEach((n) => n.remove());
}
