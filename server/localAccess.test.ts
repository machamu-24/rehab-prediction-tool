import { describe, it, expect, vi } from 'vitest';
import { localAccess } from './localAccess';

describe('ローカル専用API', () => {
  it.each([
    [{host:'localhost:3020',origin:'http://localhost:3020'},true],
    [{host:'127.0.0.1:3020'},true],
    [{host:'[::1]:3020',origin:'http://[::1]:3020'},true],
    [{host:'evil.example:3020'},false],
    [{host:'localhost:3020',origin:'https://evil.example'},false],
    [{host:'localhost:3020','sec-fetch-site':'cross-site'},false],
    [{host:'localhost:3020',origin:'null'},false],
  ])('%j', (headers, allowed) => {
    const next=vi.fn(), json=vi.fn(), status=vi.fn(()=>({json}));
    localAccess({headers} as any,{status} as any,next);
    expect(next).toHaveBeenCalledTimes(allowed?1:0);
    if(!allowed) expect(status).toHaveBeenCalledWith(403);
  });
});
