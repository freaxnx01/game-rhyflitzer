// #530: black-and-white "old photo" look. Ctrl+B toggles it; a bare B stays look-back. Takes a KeyboardEvent-like { code, ctrlKey }.
export function isMonoKey(key) { return key.code === 'KeyB' && !!key.ctrlKey; }
