import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Provider, connect } from 'react-redux';
import { createStore } from 'redux';
import { containPlugin } from './containPlugin';
import type { MiradorPlugin } from '../types/mirador';

const Throwing = () => {
  throw new Error('bad');
};
const Target = ({ windowId }: { windowId?: string }) => <div data-testid="target">{windowId}</div>;

const make = (mode: MiradorPlugin['mode'], component: unknown = Throwing): MiradorPlugin => ({
  target: 'T',
  mode,
  name: 'P',
  component: component as MiradorPlugin['component'],
  mapStateToProps: () => ({}),
  mapDispatchToProps: {},
});

const comp = (p: MiradorPlugin) =>
  containPlugin(p).component as unknown as React.ComponentType<Record<string, unknown>>;

let errSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => errSpy.mockRestore());

describe('containPlugin', () => {
  it('keeps the plugin shape', () => {
    const p = make('wrap');
    const c = containPlugin(p);
    expect(c).toMatchObject({ target: 'T', mode: 'wrap', name: 'P' });
    expect(typeof c.mapStateToProps).toBe('function');
    expect(containPlugin({ ...p, mapStateToProps: undefined }).mapStateToProps).toBeUndefined();
    expect(c.mapDispatchToProps).toBe(p.mapDispatchToProps);
    expect(c.component).not.toBe(p.component);
  });

  it('wrap: falls back to the TargetComponent when the plugin throws', () => {
    const C = comp(make('wrap'));
    render(<div><span>root</span><C targetProps={{ windowId: 'w1' }} TargetComponent={Target} /></div>);
    expect(screen.getByTestId('target')).toHaveTextContent('w1');
    expect(screen.getByText('root')).toBeInTheDocument();
  });

  it('wrap: renders nothing when the fallback throws too', () => {
    const C = comp(make('wrap'));
    const { container } = render(<C targetProps={{}} TargetComponent={Throwing} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('add: renders nothing when the plugin throws', () => {
    const C = comp(make('add'));
    const { container } = render(<C targetProps={{}} TargetComponent={Target} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the plugin normally and forwards props', () => {
    const Ok = ({ foo }: { foo: string }) => <div>ok-{foo}</div>;
    const C = comp(make('add', Ok));
    render(<C foo="bar" />);
    expect(screen.getByText('ok-bar')).toBeInTheDocument();
  });

  it('retries when the window or canvas changes', () => {
    let fail = true;
    const Flaky = () => {
      if (fail) throw new Error('x');
      return <div>recovered</div>;
    };
    const C = comp(make('add', Flaky));
    const { container, rerender } = render(<C targetProps={{ windowId: 'w1', canvasId: 'c1' }} />);
    expect(container).toBeEmptyDOMElement();
    fail = false;
    rerender(<C targetProps={{ windowId: 'w1', canvasId: 'c2' }} />);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('retries on selection change when targetProps carry no canvasId (AnnotationsOverlay)', () => {
    let fail = true;
    const Flaky = () => {
      if (fail) throw new Error('x');
      return <div>recovered</div>;
    };
    const C = comp(make('wrap', Flaky));
    const { rerender } = render(<C targetProps={{ windowId: 'w1', selectedAnnotationId: 'a' }} TargetComponent={() => <i>default</i>} />);
    expect(screen.getByText('default')).toBeInTheDocument();
    fail = false;
    rerender(<C targetProps={{ windowId: 'w1', selectedAnnotationId: 'b' }} TargetComponent={() => <i>default</i>} />);
    expect(screen.getByText('recovered')).toBeInTheDocument();
  });

  it('wrap: a throwing mapStateToProps falls back to the TargetComponent', () => {
    const p = { ...make('wrap', () => <div>plugin</div>), mapStateToProps: () => { throw new Error('bad'); } };
    const Connected = connect(containPlugin(p).mapStateToProps as never)(comp(p) as never) as unknown as React.ComponentType<Record<string, unknown>>;
    render(
      <Provider store={createStore(() => ({}))}>
        <Connected targetProps={{ windowId: 'w1' }} TargetComponent={Target} />
      </Provider>,
    );
    expect(screen.getByTestId('target')).toHaveTextContent('w1');
    expect(errSpy.mock.calls.some((c: unknown[]) => String(c[0]).startsWith('[mirador-xyviewer]'))).toBe(true);
  });

  it('add: a throwing mapStateToProps renders nothing, connected the way Mirador does', () => {
    const p = { ...make('add', () => <div>plugin</div>), mapStateToProps: () => { throw new Error('bad'); } };
    const c = containPlugin(p);
    const Connected = connect(c.mapStateToProps as never)(c.component as never) as unknown as React.ComponentType<Record<string, unknown>>;
    const { container } = render(
      <Provider store={createStore(() => ({}))}>
        <Connected targetProps={{}} TargetComponent={Target} />
      </Provider>,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it('connected: passes state props and targetProps through', () => {
    const p = { ...make('wrap', ({ n, targetProps }: { n: number; targetProps: { windowId: string } }) => <div>n{n}-{targetProps.windowId}</div>), mapStateToProps: () => ({ n: 3 }) };
    const c = containPlugin(p);
    const Connected = connect(c.mapStateToProps as never)(c.component as never) as unknown as React.ComponentType<Record<string, unknown>>;
    render(
      <Provider store={createStore(() => ({}))}>
        <Connected targetProps={{ windowId: 'w1' }} TargetComponent={Target} />
      </Provider>,
    );
    expect(screen.getByText('n3-w1')).toBeInTheDocument();
  });
});
