import { describe, expect, it } from 'vitest'
import {
  QUEUE_PARAMS,
  RESERVED_QUEUE_PARAMS,
  assertQueueFilterKeys,
  isQueueNarrowed,
  queryFromQueueState,
  queueQueryKey,
  readQueueState,
  writeQueueState,
} from './queue-url'
import type { QueueUrlSchema } from './queue-url'

const schema: QueueUrlSchema = {
  filterKeys: ['status', 'ownerId', 'categoryId'],
  sortable: ['createdAt', 'tatDueAt', 'systemNo'],
  defaultSort: { field: 'createdAt', direction: 'desc' },
  defaultPageSize: 25,
}

function read(search: string) {
  return readQueueState(new URLSearchParams(search), schema)
}

describe('reading a queue out of its URL', () => {
  it('reads every part of the view', () => {
    const state = read(
      '?q=patel&status=new,assigned&ownerId=user-kiran&sort=tatDueAt:asc&page=3&size=50&sel=inq-1,inq-2&record=inq-2',
    )

    expect(state).toEqual({
      search: 'patel',
      filters: { status: ['new', 'assigned'], ownerId: ['user-kiran'] },
      sort: { field: 'tatDueAt', direction: 'asc' },
      page: 3,
      pageSize: 50,
      selection: ['inq-1', 'inq-2'],
      record: 'inq-2',
    })
  })

  it('falls back to the configured defaults on a bare URL', () => {
    expect(read('')).toEqual({
      search: '',
      filters: {},
      sort: { field: 'createdAt', direction: 'desc' },
      page: 1,
      pageSize: 25,
      selection: [],
      record: null,
    })
  })

  it('ignores a filter the repository does not declare', () => {
    // Undeclared filters throw inside the repository, so a hand-edited URL must
    // not be able to smuggle one through.
    expect(read('?nonsense=42').filters).toEqual({})
  })

  it('ignores a sort field the repository cannot sort by', () => {
    expect(read('?sort=aadhaar:asc').sort).toEqual({ field: 'createdAt', direction: 'desc' })
  })

  it('treats an unreadable page or size as the default', () => {
    const state = read('?page=0&size=-4')
    expect(state.page).toBe(1)
    expect(state.pageSize).toBe(25)
  })

  it('defaults an unknown sort direction to ascending', () => {
    expect(read('?sort=systemNo:sideways').sort).toEqual({ field: 'systemNo', direction: 'asc' })
  })
})

describe('writing a queue back into its URL', () => {
  it('round-trips a full view', () => {
    const search =
      'q=patel&status=new,assigned&ownerId=user-kiran&sort=tatDueAt:asc&page=3&size=50&sel=inq-1,inq-2&record=inq-2'
    const state = read(`?${search}`)
    expect(readQueueState(writeQueueState(state, schema), schema)).toEqual(state)
  })

  it('leaves an untouched queue with a clean URL', () => {
    expect(writeQueueState(read(''), schema).toString()).toBe('')
  })

  it('omits the default sort and spells out any other', () => {
    const asIs = writeQueueState(read('?sort=createdAt:desc'), schema)
    expect(asIs.get(QUEUE_PARAMS.sort)).toBeNull()

    const changed = writeQueueState(read('?sort=systemNo:asc'), schema)
    expect(changed.get(QUEUE_PARAMS.sort)).toBe('systemNo:asc')
  })

  it('writes each filter under its own name, as §4 documents queue URLs', () => {
    const params = writeQueueState(read('?status=new,assigned'), schema)
    expect(params.get('status')).toBe('new,assigned')
  })
})

describe('what the repository is told', () => {
  it('passes the search, filters, sort and page through', () => {
    expect(queryFromQueueState(read('?q=patel&status=new&page=2&size=10'))).toEqual({
      search: 'patel',
      filters: { status: ['new'] },
      sort: { field: 'createdAt', direction: 'desc' },
      page: 2,
      pageSize: 10,
    })
  })

  it('never passes the selection or the open record', () => {
    const query = queryFromQueueState(read('?sel=inq-1&record=inq-1'))
    expect(Object.keys(query).sort()).toEqual(['filters', 'page', 'pageSize', 'sort'])
  })

  it('re-reads when the query changes and not when the selection does', () => {
    const base = queueQueryKey(read('?status=new'))
    expect(queueQueryKey(read('?status=new&sel=inq-1&record=inq-1'))).toBe(base)
    expect(queueQueryKey(read('?status=assigned'))).not.toBe(base)
  })
})

describe('configuration guards', () => {
  it('refuses a filter key that would shadow a reserved parameter', () => {
    for (const reserved of RESERVED_QUEUE_PARAMS) {
      expect(() => assertQueueFilterKeys([reserved])).toThrow(/reserved URL parameter/)
    }
  })

  it('accepts the filter names the repositories actually declare', () => {
    expect(() =>
      assertQueueFilterKeys(['status', 'state', 'ownerId', 'agentId', 'kycState', 'categoryId']),
    ).not.toThrow()
  })

  it('knows when the view is narrowed, so the empty state can be honest', () => {
    expect(isQueueNarrowed(read(''))).toBe(false)
    expect(isQueueNarrowed(read('?page=4'))).toBe(false)
    expect(isQueueNarrowed(read('?q=patel'))).toBe(true)
    expect(isQueueNarrowed(read('?status=new'))).toBe(true)
  })
})
