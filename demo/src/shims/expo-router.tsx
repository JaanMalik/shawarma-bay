import {
  Children,
  createContext,
  isValidElement,
  memo,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
  type ReactNode,
} from 'react';

import { useSafeAreaInsets } from './safe-area-context';

/**
 * Expo Router for the demo phone: a stack of the app's real screens with iOS-style headers,
 * push animations, and modal sheets. Only what the app uses is here.
 */

type Params = Record<string, string>;
export type Href = string | { pathname: string; params?: Record<string, string | number | undefined> };

interface ScreenOptions {
  title?: string;
  headerShown?: boolean;
  headerStyle?: { backgroundColor?: string };
  headerTintColor?: string;
  headerTitleStyle?: { fontWeight?: string | number };
  headerBackVisible?: boolean;
  headerRight?: (props: { tintColor?: string }) => ReactNode;
  contentStyle?: { backgroundColor?: string };
  presentation?: string;
  gestureEnabled?: boolean;
  headerTransparent?: boolean;
}

/** still: in place; enter/leave: animating; covered: replaced, waiting to be removed. */
type Phase = 'still' | 'enter' | 'leave' | 'covered';

interface Entry {
  key: string;
  name: string;
  params: Params;
  phase: Phase;
}

interface RouterActions {
  push(href: Href): void;
  navigate(href: Href): void;
  replace(href: Href): void;
  back(): void;
  dismiss(): void;
  dismissTo(href: Href): void;
  dismissAll(): void;
  canGoBack(): boolean;
  setParams(params: Params): void;
}

interface Navigation {
  stack: Entry[];
  routes: Record<string, ComponentType>;
  actions: RouterActions;
}

const ENTER_MS = 340;
const LEAVE_MS = 300;

const NavigationContext = createContext<Navigation | null>(null);
const ScreenContext = createContext<{ entry: Entry; setOptions(options: ScreenOptions): void } | null>(null);

function patternOf(name: string) {
  const keys: string[] = [];
  const source = name
    .split('/')
    .map((segment) => {
      const dynamic = /^\[(\w+)\]$/.exec(segment);
      if (!dynamic) return segment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      keys.push(dynamic[1]);
      return '([^/]+)';
    })
    .join('/');
  return { regex: new RegExp(`^${source}$`), keys };
}

function resolveHref(href: Href, names: string[]): { name: string; params: Params } {
  if (typeof href !== 'string') {
    const params: Params = {};
    for (const [k, v] of Object.entries(href.params ?? {})) if (v !== undefined) params[k] = String(v);
    return { name: href.pathname.replace(/^\/+/, '') || 'index', params };
  }
  const url = new URL(href, 'demo-app://app/');
  const path = url.pathname.replace(/^\/+/, '');
  const query = Object.fromEntries(url.searchParams);
  if (!path) return { name: 'index', params: query };
  for (const name of names) {
    const { regex, keys } = patternOf(name);
    const match = regex.exec(path);
    if (match) {
      return { name, params: { ...query, ...Object.fromEntries(keys.map((k, i) => [k, decodeURIComponent(match[i + 1])])) } };
    }
  }
  return { name: path, params: query };
}

export function RouterProvider({ routes, children }: { routes: Record<string, ComponentType>; children: ReactNode }) {
  const [stack, setStack] = useState<Entry[]>([{ key: 'screen-0', name: 'index', params: {}, phase: 'still' }]);
  const stackRef = useRef(stack);
  const names = useMemo(() => Object.keys(routes), [routes]);
  const namesRef = useRef(names);
  useEffect(() => {
    namesRef.current = names;
  }, [names]);

  const actions = useMemo<RouterActions>(() => {
    let seq = 1;
    const commit = (next: Entry[]) => {
      stackRef.current = next;
      setStack(next);
    };
    const live = () => stackRef.current.filter((e) => e.phase === 'still' || e.phase === 'enter');
    const make = (href: Href): Entry => ({ key: `screen-${seq++}`, ...resolveHref(href, namesRef.current), phase: 'enter' });
    const removeLater = (keys: string[], ms: number) =>
      window.setTimeout(() => commit(stackRef.current.filter((e) => !keys.includes(e.key))), ms);
    const leave = (key: string) => {
      commit(stackRef.current.map((e) => (e.key === key ? { ...e, phase: 'leave' as const } : e)));
      removeLater([key], LEAVE_MS);
    };
    const back = () => {
      const screens = live();
      if (screens.length > 1) leave(screens[screens.length - 1].key);
    };
    const push = (href: Href) => commit([...stackRef.current, make(href)]);
    const dismissTo = (href: Href) => {
      const { name } = resolveHref(href, namesRef.current);
      const screens = live();
      const at = screens.map((e) => e.name).lastIndexOf(name);
      if (at === -1) return commit([{ ...make(href), phase: 'still' }]);
      const above = screens.slice(at + 1);
      if (above.length === 0) return;
      const skipped = new Set(above.slice(0, -1).map((e) => e.key));
      commit(stackRef.current.filter((e) => !skipped.has(e.key)));
      leave(above[above.length - 1].key);
    };
    return {
      push,
      navigate: push,
      replace(href) {
        const screens = live();
        const top = screens[screens.length - 1];
        commit([...stackRef.current.map((e) => (e === top ? { ...e, phase: 'covered' as const } : e)), make(href)]);
        if (top) removeLater([top.key], ENTER_MS);
      },
      back,
      dismiss: back,
      dismissTo,
      dismissAll: () => dismissTo('/'),
      canGoBack: () => live().length > 1,
      setParams(params) {
        const screens = live();
        const top = screens[screens.length - 1];
        commit(stackRef.current.map((e) => (e === top ? { ...e, params: { ...e.params, ...params } } : e)));
      },
    };
  }, []);

  const value = useMemo(() => ({ stack, routes, actions }), [stack, routes, actions]);
  return <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>;
}

function useNavigationState(): Navigation {
  const nav = useContext(NavigationContext);
  if (!nav) throw new Error('The app needs a RouterProvider.');
  return nav;
}

export function useRouter(): RouterActions {
  return useNavigationState().actions;
}

export function useLocalSearchParams<T extends Params = Params>(): T {
  return (useContext(ScreenContext)?.entry.params ?? {}) as T;
}

export const useGlobalSearchParams = useLocalSearchParams;

export function Redirect({ href }: { href: Href }) {
  const { actions } = useNavigationState();
  const target = useRef(href);
  useEffect(() => actions.replace(target.current), [actions]);
  return null;
}

/** <Stack.Screen options> inside a screen sets that screen's header options. */
function StackScreen({ options }: { name?: string; options?: ScreenOptions }) {
  const screen = useContext(ScreenContext);
  useEffect(() => {
    if (screen && options) screen.setOptions(options);
  });
  return null;
}

function StackNavigator({ screenOptions = {}, children }: { screenOptions?: ScreenOptions; children?: ReactNode }) {
  const { stack } = useNavigationState();
  const configured: Record<string, ScreenOptions> = {};
  Children.forEach(children, (child) => {
    if (isValidElement<{ name?: string; options?: ScreenOptions }>(child) && child.props.name) {
      configured[child.props.name] = child.props.options ?? {};
    }
  });
  const shown = stack.filter((e) => e.phase !== 'covered');
  const top = [...stack].reverse().find((e) => e.phase === 'still' || e.phase === 'enter');

  return (
    <div className="rn-stack">
      {stack.map((entry) => {
        const position = shown.indexOf(entry);
        const below = position > 0 ? shown[position - 1] : undefined;
        return (
          <ScreenHost
            key={entry.key}
            entry={entry}
            options={{ ...screenOptions, ...configured[entry.name] }}
            back={below ? (configured[below.name]?.title ?? 'Back') : null}
            active={entry === top}
          />
        );
      })}
    </div>
  );
}

export const Stack = Object.assign(StackNavigator, { Screen: StackScreen });

const ScreenHost = memo(function ScreenHost({
  entry,
  options,
  back,
  active,
}: {
  entry: Entry;
  options: ScreenOptions;
  /** Title of the screen underneath, for the back button; null on the first screen. */
  back: string | null;
  active: boolean;
}) {
  const { routes, actions } = useNavigationState();
  const insets = useSafeAreaInsets();
  const [dynamic, setDynamic] = useState<ScreenOptions>({});
  const merged = { ...options, ...dynamic };
  const modal = merged.presentation === 'modal';

  const Screen = routes[entry.name];
  // The screen itself only re-renders for its own reasons, not when its header changes.
  const content = useMemo(() => (Screen ? <Screen /> : <p className="rn-missing">No screen named {entry.name}</p>), [Screen, entry.name]);
  const screen = useMemo(() => ({ entry, setOptions: (o: ScreenOptions) => setDynamic((prev) => ({ ...prev, ...o })) }), [entry]);

  const motion =
    entry.phase === 'enter' ? (modal ? 'rn-sheet-in' : 'rn-push-in') : entry.phase === 'leave' ? (modal ? 'rn-sheet-out' : 'rn-push-out') : '';
  const body = (
    <>
      {merged.headerShown !== false && (
        <ScreenHeader
          options={merged}
          insetTop={modal ? 0 : insets.top}
          onBack={!modal && back !== null && merged.headerBackVisible !== false ? actions.back : null}
          backTitle={back ?? ''}
          onClose={modal ? actions.back : null}
        />
      )}
      <div className="rn-content">
        <ScreenContext.Provider value={screen}>{content}</ScreenContext.Provider>
      </div>
    </>
  );

  if (modal) {
    return (
      <div className={`rn-layer ${active ? '' : 'rn-inert'}`}>
        <div className={`rn-dim ${entry.phase === 'leave' ? 'rn-dim-out' : ''}`} onClick={actions.back} aria-hidden="true" />
        <div
          className={`rn-sheet ${motion}`}
          style={{ top: insets.top + 10, background: merged.contentStyle?.backgroundColor }}
          role="dialog"
          aria-modal="true"
        >
          {body}
        </div>
      </div>
    );
  }
  return (
    <div className={`rn-page ${motion} ${active ? '' : 'rn-inert'}`} style={{ background: merged.contentStyle?.backgroundColor }}>
      {body}
    </div>
  );
});

function ScreenHeader({
  options,
  insetTop,
  onBack,
  backTitle,
  onClose,
}: {
  options: ScreenOptions;
  insetTop: number;
  onBack: (() => void) | null;
  backTitle: string;
  onClose: (() => void) | null;
}) {
  const tint = options.headerTintColor ?? '#007aff';
  return (
    <div className="rn-header" style={{ paddingTop: insetTop, background: options.headerStyle?.backgroundColor ?? '#f9f9f9', color: tint }}>
      <div className="rn-header-bar">
        <div className="rn-header-side">
          {onBack && (
            <button type="button" className="rn-header-button" onClick={onBack} aria-label={`Back to ${backTitle}`}>
              <svg width="13" height="21" viewBox="0 0 13 21" aria-hidden="true">
                <path d="M11 2L3 10.5 11 19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>{backTitle}</span>
            </button>
          )}
          {onClose && (
            <button type="button" className="rn-header-button" onClick={onClose}>
              Close
            </button>
          )}
        </div>
        <div className="rn-header-title" style={{ fontWeight: options.headerTitleStyle?.fontWeight ?? 600 }}>
          {options.title}
        </div>
        <div className="rn-header-side rn-header-right">{options.headerRight?.({ tintColor: tint })}</div>
      </div>
    </div>
  );
}
