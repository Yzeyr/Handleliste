/**
 * Minimal DOM-hjelper. Bygger elementer i stedet for å sette innerHTML, slik
 * at varenavn aldri tolkes som markup — navnene kommer fra to personer som
 * skriver fritekst, og de skal kunne skrive hva de vil.
 */

export type Child = Node | string | number | null | false | undefined;

export interface ElProps {
  class?: string;
  text?: string;
  attrs?: Record<string, string | number | boolean>;
  on?: {
    [K in keyof HTMLElementEventMap]?: (event: HTMLElementEventMap[K]) => void;
  };
}

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: ElProps = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.class !== undefined) node.className = props.class;
  if (props.text !== undefined) node.textContent = props.text;

  for (const [name, value] of Object.entries(props.attrs ?? {})) {
    if (value === false) continue;
    node.setAttribute(name, value === true ? '' : String(value));
  }
  for (const [name, handler] of Object.entries(props.on ?? {})) {
    node.addEventListener(name, handler as EventListener);
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(typeof child === 'object' ? child : String(child));
  }
  return node;
}

export function replaceChildren(parent: Element, children: Child[]): void {
  parent.replaceChildren(
    ...children.filter((c): c is Node | string | number => c !== null && c !== undefined && c !== false)
      .map((c) => (typeof c === 'object' ? c : document.createTextNode(String(c)))),
  );
}

/** En visning som kan oppdateres uten å bygges på nytt, så input beholder fokus. */
export interface View<S> {
  element: HTMLElement;
  update: (state: S) => void;
}
