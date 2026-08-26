import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useResource } from './useResource'

/** A promise a test can resolve when it chooses, so races are deliberate. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (cause: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

describe('useResource', () => {
  it('starts loading and lands on the value', async () => {
    const { result } = renderHook(() => useResource(async () => 'ready', 'key'))

    expect(result.current.status).toBe('loading')
    expect(result.current.isLoading).toBe(true)

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    expect(result.current.data).toBe('ready')
    expect(result.current.error).toBeNull()
  })

  it('carries a rejection as an error state rather than an unhandled throw', async () => {
    const { result } = renderHook(() =>
      useResource(async () => {
        throw new Error('The insurer feed is down.')
      }, 'key'),
    )

    await waitFor(() => {
      expect(result.current.status).toBe('error')
    })
    expect(result.current.error?.message).toBe('The insurer feed is down.')
    expect(result.current.data).toBeNull()
  })

  it('turns a thrown non-Error into something a screen can render', async () => {
    const { result } = renderHook(() => useResource(() => Promise.reject('nope'), 'key'))

    await waitFor(() => {
      expect(result.current.error).toBeInstanceOf(Error)
    })
    expect(result.current.error?.message).toBe('nope')
  })

  it('does not reload when the component re-renders with the same key', async () => {
    let calls = 0
    const { result, rerender } = renderHook(
      ({ key }) =>
        useResource(async () => {
          calls += 1
          return calls
        }, key),
      { initialProps: { key: 'a' } },
    )

    await waitFor(() => {
      expect(result.current.status).toBe('ready')
    })
    rerender({ key: 'a' })
    rerender({ key: 'a' })

    expect(calls).toBe(1)
  })

  it('reloads when the key changes, because the key is the request', async () => {
    const keys: string[] = []
    const { result, rerender } = renderHook(
      ({ key }) =>
        useResource(async () => {
          keys.push(key)
          return key
        }, key),
      { initialProps: { key: 'page=1' } },
    )

    await waitFor(() => {
      expect(result.current.data).toBe('page=1')
    })

    rerender({ key: 'page=2' })
    await waitFor(() => {
      expect(result.current.data).toBe('page=2')
    })

    expect(keys).toEqual(['page=1', 'page=2'])
  })

  it('reloads on demand, which is what the retry button calls', async () => {
    let calls = 0
    const { result } = renderHook(() =>
      useResource(async () => {
        calls += 1
        return calls
      }, 'key'),
    )

    await waitFor(() => {
      expect(result.current.data).toBe(1)
    })

    act(() => {
      result.current.reload()
    })
    await waitFor(() => {
      expect(result.current.data).toBe(2)
    })
  })

  it('ignores a superseded answer, so a slow first page cannot overwrite the second', async () => {
    const first = deferred<string>()
    const second = deferred<string>()
    const pending = [first, second]
    let index = 0

    const { result, rerender } = renderHook(
      ({ key }) => useResource(() => pending[index++].promise, key),
      { initialProps: { key: 'page=1' } },
    )

    rerender({ key: 'page=2' })

    await act(async () => {
      second.resolve('page two')
    })
    await waitFor(() => {
      expect(result.current.data).toBe('page two')
    })

    // The first request finishes late. Its answer belongs to a key nobody is
    // looking at any more, and it must not land.
    await act(async () => {
      first.resolve('page one')
    })
    expect(result.current.data).toBe('page two')
  })

  it('always calls the loader from the latest render, never a stale closure', async () => {
    const { result, rerender } = renderHook(
      ({ key, value }) => useResource(async () => value, key),
      { initialProps: { key: 'a', value: 'first' } },
    )

    await waitFor(() => {
      expect(result.current.data).toBe('first')
    })

    rerender({ key: 'b', value: 'second' })
    await waitFor(() => {
      expect(result.current.data).toBe('second')
    })
  })
})
