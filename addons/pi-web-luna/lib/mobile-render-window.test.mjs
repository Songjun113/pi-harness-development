import test from 'node:test';
import assert from 'node:assert/strict';
import {createJiti} from 'jiti';
import {readFileSync} from 'node:fs';
const {getInitialVisibleCount,getVisibleRenderWindow,getNextVisibleCount}=await createJiti(import.meta.url).import('./chat-lazy-load.ts');
test('phone mounts 12 recent rows instead of desktop 50',()=>{
 assert.equal(getInitialVisibleCount(true),12);
 assert.equal(getInitialVisibleCount(false),50);
 assert.deepEqual(getVisibleRenderWindow(200,getInitialVisibleCount(true)),{startIndex:188,hasMore:true});
});
test('older phone rows remain reachable without fetching or deleting history',()=>{
 let count=getInitialVisibleCount(true);
 while(count<200)count=getNextVisibleCount(count,getInitialVisibleCount(true));
 assert.deepEqual(getVisibleRenderWindow(200,count),{startIndex:0,hasMore:false});
});
test('loaded hidden rows are revealed before another server request',()=>{
 const source=readFileSync(new URL('../components/ChatWindow.tsx',import.meta.url),'utf8');
 assert.match(source,/renderedCountRef.current > visibleCount \|\| !hasEarlierMessages/);
 assert.match(source,/if \(!isMobile\) setVisibleCount/);
 assert.match(source,/if \(!searchTarget && !pendingScrollRestore\)/);
});
