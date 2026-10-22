import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const css=readFileSync(new URL('../app/globals.css',import.meta.url),'utf8');
const input=readFileSync(new URL('./ChatInput.tsx',import.meta.url),'utf8');
test('mobile send target is 44px without changing desktop padding',()=>{
 assert.match(input,/isMobile \? \{ width: 44, height: 44, padding: 0 \} : \{ padding: "7px 14px" \}/);
});
test('phone drawer leaves a backdrop and static controls have touch targets',()=>{
 assert.match(css,/max-width: calc\(100vw - 48px - env\(safe-area-inset-left\) - env\(safe-area-inset-right\)\)/);
 assert.match(css,/\.sidebar-new-button,[\s\S]*?\.sidebar-archive-menu-button \{\s*min-height: 44px;\s*min-width: 44px;/);
});
test('keyboard composer is bounded by visible viewport and nested scroll is contained',()=>{
 assert.match(css,/html\[data-keyboard-open\] \.chat-input-textarea \{\s*max-height: min\(120px, calc\(var\(--app-viewport-height, 100dvh\) \* 0\.3\)\)/);
 assert.match(css,/\.session-tree-scroll,\s*\.sidebar-files-scroll \{\s*overscroll-behavior-y: contain;/);
});
