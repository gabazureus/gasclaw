import { expect, test } from 'vitest';
import { memorySource } from '../src/tools/memoryStore';
import { DOC_MIME, type FileEntry } from '../src/workspace';

const md: FileEntry = { id: 'm', name: 'MEMORY.md', mime: 'text/markdown', modified: 1 };
const doc: FileEntry = { id: 'd', name: 'MEMORY', mime: DOC_MIME, modified: 1 };

test('memorySource: Doc MEMORY vence o arquivo MEMORY.md (mesma precedência dos papéis)', () => {
  expect(memorySource([md, doc])).toEqual({ entry: doc, kind: 'doc' });
  expect(memorySource([md])).toEqual({ entry: md, kind: 'md' });
  expect(memorySource([{ ...doc, name: 'MEMORY.md' }])?.kind).toBe('doc');
  expect(memorySource([{ ...md, name: 'outro.md' }])).toBeNull();
});
