// Escape stack (innermost first), the editor's leave logic and the list row intents
// (screener architect_constructor_preview_backtest_v1.md §3.3, §5 F2 / F3; designer §2.1, §2.4).
import { describe, expect, it, vi } from 'vitest';
import { createEscapeStack, ESCAPE_LEVEL } from '../../utils/escapeStack';
import {
  LEAVE_CHOICE, afterSaveAndClose, editorEscapeAction, isPristineNewDraft, isTextField, leaveDirty, requestLeave, resolveLeave,
} from '../../components/strategyConstructor/editorLeave';
import { newDraft } from '../../components/strategyConstructor/constructedFormat';
import { rowClickIntent, rowKeyIntent, strategyEditorUrl } from '../../components/strategyConstructor/listRowIntent';

const esc = (extra = {}) => ({ key: 'Escape', defaultPrevented: false, isComposing: false, preventDefault: vi.fn(), ...extra });

const stackWithSpy = () => {
  const added = [];
  const removed = [];
  const stack = createEscapeStack({ addListener: (fn) => added.push(fn), removeListener: (fn) => removed.push(fn) });
  return { stack, added, removed };
};

describe('escapeStack', () => {
  it('Escape goes to the innermost layer only (level first, then the last pushed)', () => {
    const { stack } = stackWithSpy();
    const calls = [];
    stack.push({ level: ESCAPE_LEVEL.EDITOR, handler: () => { calls.push('editor'); } });
    stack.push({ level: ESCAPE_LEVEL.DIALOG, handler: () => { calls.push('dialog'); } });
    stack.push({ level: ESCAPE_LEVEL.POPOVER, handler: () => { calls.push('popover'); } }); // pushed later, lower level
    const e = esc();
    expect(stack.handle(e)).toBe(true);
    expect(calls).toEqual(['dialog']);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
  });

  it('within one level the layer pushed last wins', () => {
    const { stack } = stackWithSpy();
    const calls = [];
    stack.push({ level: 30, handler: () => { calls.push('a'); } });
    stack.push({ level: 30, handler: () => { calls.push('b'); } });
    stack.handle(esc());
    expect(calls).toEqual(['b']);
  });

  it('a popped layer no longer receives Escape; the next one does', () => {
    const { stack } = stackWithSpy();
    const calls = [];
    stack.push({ level: ESCAPE_LEVEL.EDITOR, handler: () => { calls.push('editor'); } });
    const pop = stack.push({ level: ESCAPE_LEVEL.CONFIRM, handler: () => { calls.push('confirm'); } });
    stack.handle(esc());
    pop();
    stack.handle(esc());
    expect(calls).toEqual(['confirm', 'editor']);
    pop(); // idempotent
    expect(stack.size()).toBe(1);
  });

  it('ignores defaultPrevented (a combobox closed its list), IME composition and other keys', () => {
    const { stack } = stackWithSpy();
    const handler = vi.fn();
    stack.push({ level: 10, handler });
    expect(stack.handle(esc({ defaultPrevented: true }))).toBe(false);
    expect(stack.handle(esc({ isComposing: true }))).toBe(false);
    expect(stack.handle(esc({ key: 'Enter' }))).toBe(false);
    expect(handler).not.toHaveBeenCalled();
  });

  it('an inactive layer is skipped; a handler returning false passes the key on, unconsumed', () => {
    const { stack } = stackWithSpy();
    const calls = [];
    stack.push({ level: 10, handler: () => { calls.push('editor'); } });
    stack.push({ level: 30, handler: () => { calls.push('inactive'); }, isActive: () => false });
    stack.push({ level: 40, handler: () => { calls.push('pass'); return false; } });
    const e = esc();
    expect(stack.handle(e)).toBe(true);
    expect(calls).toEqual(['pass', 'editor']);

    const { stack: only } = stackWithSpy();
    only.push({ level: 10, handler: () => false });
    const e2 = esc();
    expect(only.handle(e2)).toBe(false);
    expect(e2.preventDefault).not.toHaveBeenCalled();
  });

  it('one listener: attached with the first layer, removed with the last', () => {
    const { stack, added, removed } = stackWithSpy();
    const a = stack.push({ handler: () => {} });
    const b = stack.push({ handler: () => {} });
    expect(added).toHaveLength(1);
    a();
    expect(removed).toHaveLength(0);
    b();
    expect(removed).toHaveLength(1);
    expect(removed[0]).toBe(added[0]);
  });
});

describe('editorLeave', () => {
  it('clean → close now; dirty → confirmation; saving → nothing', () => {
    expect(requestLeave({ dirty: false, saving: false })).toBe('close');
    expect(requestLeave({ dirty: true, saving: false })).toBe('confirm');
    expect(requestLeave({ dirty: true, saving: true })).toBe('ignore');
    expect(requestLeave({ dirty: false, saving: true })).toBe('ignore');
  });

  it('Keep editing / Discard / Save and close transitions; a failed save keeps the editor', () => {
    expect(resolveLeave(LEAVE_CHOICE.KEEP)).toBe('stay');
    expect(resolveLeave(LEAVE_CHOICE.DISCARD)).toBe('close');
    expect(resolveLeave(LEAVE_CHOICE.SAVE)).toBe('save');
    expect(resolveLeave('anything else')).toBe('stay');
    expect(afterSaveAndClose(true)).toBe('close');
    expect(afterSaveAndClose(false)).toBe('stay');
  });

  it('a new draft nobody typed into is clean; any input makes it dirty', () => {
    const d = newDraft();
    expect(isPristineNewDraft(d, null)).toBe(true);
    expect(leaveDirty({ draft: d, saved: null, dirty: true })).toBe(false);
    expect(leaveDirty({ draft: { ...d, name: 'x' }, saved: null, dirty: true })).toBe(true);
    expect(leaveDirty({ draft: { ...d, rules: [] }, saved: null, dirty: true })).toBe(true);
    const stored = { ...d, id: 3, name: 'S' };
    expect(isPristineNewDraft(stored, stored)).toBe(false);
    expect(leaveDirty({ draft: stored, saved: stored, dirty: false })).toBe(false);
    expect(leaveDirty({ draft: stored, saved: stored, dirty: true })).toBe(true);
    expect(leaveDirty({ draft: null, saved: null, dirty: true })).toBe(false);
  });

  it('Escape: a fullscreen / price-only chart or a modal keeps it; a text field only blurs; else leave', () => {
    const base = { dirty: true, saving: false };
    expect(editorEscapeAction({ ...base, fullscreen: true })).toBe('pass');
    expect(editorEscapeAction({ ...base, priceOnly: true })).toBe('pass');
    expect(editorEscapeAction({ ...base, modalOpen: true })).toBe('pass');
    expect(editorEscapeAction({ ...base, focusInTextField: true })).toBe('blur');
    expect(editorEscapeAction(base)).toBe('confirm');
    expect(editorEscapeAction({ dirty: false, saving: false })).toBe('close');
    expect(editorEscapeAction({ dirty: true, saving: true })).toBe('ignore');
  });

  it('text fields: text-like inputs, textarea, select, contenteditable; not checkboxes or buttons', () => {
    expect(isTextField({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'number' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'date' })).toBe(true);
    expect(isTextField({ tagName: 'INPUT' })).toBe(true);
    expect(isTextField({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextField({ tagName: 'SELECT' })).toBe(true);
    expect(isTextField({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextField({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isTextField({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextField({ tagName: 'BODY' })).toBe(false);
    expect(isTextField(null)).toBe(false);
  });
});

describe('list row intents', () => {
  it('click opens; Ctrl / Cmd / middle click open a new tab; a text selection or other buttons do nothing', () => {
    expect(rowClickIntent({ button: 0 })).toBe('open');
    expect(rowClickIntent({ button: 0, ctrlKey: true })).toBe('newTab');
    expect(rowClickIntent({ button: 0, metaKey: true })).toBe('newTab');
    expect(rowClickIntent({ button: 1 })).toBe('newTab');
    expect(rowClickIntent({ button: 2 })).toBeNull();
    expect(rowClickIntent({ button: 0 }, { hasSelection: true })).toBeNull();
  });

  it('an unreadable row or a row being deleted never opens', () => {
    expect(rowClickIntent({ button: 0 }, { unreadable: true })).toBeNull();
    expect(rowClickIntent({ button: 1 }, { unreadable: true })).toBeNull();
    expect(rowClickIntent({ button: 0 }, { busy: true })).toBeNull();
    expect(rowKeyIntent({ key: 'Enter' }, { unreadable: true })).toBeNull();
    expect(rowKeyIntent({ key: 'Enter' }, { busy: true })).toBeNull();
  });

  it('Enter / Space on the focused row open it; keys from a button inside the row do not', () => {
    const row = {};
    expect(rowKeyIntent({ key: 'Enter', target: row, currentTarget: row })).toBe('open');
    expect(rowKeyIntent({ key: ' ', target: row, currentTarget: row })).toBe('open');
    expect(rowKeyIntent({ key: 'a', target: row, currentTarget: row })).toBeNull();
    expect(rowKeyIntent({ key: 'Enter', target: {}, currentTarget: row })).toBeNull();
  });

  it('the new-tab URL is the constructor route of the strategy', () => {
    expect(strategyEditorUrl(12, { pathname: '/', search: '' })).toBe('/#/constructor?id=12');
    expect(strategyEditorUrl(5, { pathname: '/app/', search: '?x=1' })).toBe('/app/?x=1#/constructor?id=5');
  });
});
