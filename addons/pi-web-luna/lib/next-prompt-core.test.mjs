import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiti } from 'jiti';
const { suggestionTranscript, cleanSuggestion, SUGGESTION_MODEL } = await createJiti(import.meta.url).import('./next-prompt-core.ts');

test('Luna is explicit; transcript excludes tools, thinking, images and custom reminders', () => {
  assert.deepEqual(SUGGESTION_MODEL,{provider:'openai',id:'gpt-6-luna'});
  const value=suggestionTranscript([
    {role:'system',content:'SYSTEM_SECRET'},
    {role:'toolResult',content:'TOOL_SECRET'},
    {role:'custom',content:'OLD_HABIT'},
    {role:'user',content:'你好'},
    {role:'assistant',content:[{type:'thinking',thinking:'THINKING_SECRET'},{type:'image',data:'IMAGE_SECRET'},{type:'text',text:'回复'}]},
  ]);
  assert.equal(value,'user: 你好\n\nassistant: 回复');
});
test('bounded transcript with common secret redaction',()=>{
  const text=suggestionTranscript(Array.from({length:20},()=>({role:'user',content:'password="abc" '+ 'x'.repeat(3000)})));
  assert(text.length<=6000); assert(!text.includes('abc'));
  assert.equal(suggestionTranscript([{role:'user',content:'api_key=secret123'}]),'user: [redacted]');
  const secrets = suggestionTranscript([{role:'user',content:'Authorization: Bearer abc123XYZ {"token": "private-value"} eyJabc.def.ghi'}]);
  assert(!secrets.includes('abc123XYZ')); assert(!secrets.includes('private-value')); assert(!secrets.includes('eyJabc'));
});
test('plain short suggestion and no-suggestion sentinel',()=>{
  assert.equal(cleanSuggestion('NONE'),'');
  assert.equal(cleanSuggestion('下一步\n\u202e检查结果'),'下一步 检查结果');
  assert.equal(Array.from(cleanSuggestion('你'.repeat(200))).length,160);
});
