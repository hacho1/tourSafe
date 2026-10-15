/** Reference counting keeps nested dialogs locked even if their parent closes first. */
export function createModalScrollLock(style: { overflow: string }) {
  let count = 0;
  let previous = "";
  return () => {
    if (count++ === 0) { previous = style.overflow; style.overflow = "hidden"; }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      if (--count === 0) style.overflow = previous;
    };
  };
}
