/// <reference types="vite/client" />

/** Fallback until `npm install` populates `node_modules`. */
declare module "react-router-dom";

declare module "react" {
  export interface ReactElement {
    type: unknown;
    props: unknown;
    key: string | number | null;
  }

  export type ReactNode =
    | string
    | number
    | boolean
    | null
    | undefined
    | ReactElement
    | Iterable<ReactNode>;

  export function useState<T>(
    initial: T | (() => T)
  ): [T, (next: T | ((prev: T) => T)) => void];

  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;

  export function StrictMode(props: { children?: ReactNode }): ReactElement;
}

declare module "react/jsx-runtime" {
  export function jsx(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number | null
  ): unknown;
  export function jsxs(
    type: unknown,
    props: Record<string, unknown> | null,
    key?: string | number | null
  ): unknown;
  export const Fragment: symbol;
}

declare module "react-dom/client" {
  export interface Root {
    render(node: unknown): void;
  }

  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: unknown;
  }
}
