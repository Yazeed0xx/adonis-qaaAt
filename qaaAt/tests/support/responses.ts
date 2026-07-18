export function responseItems(body: unknown): Record<string, unknown>[] {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    !Array.isArray(body.data) ||
    body.data.some((item) => typeof item !== 'object' || item === null || Array.isArray(item))
  ) {
    throw new Error('Expected a response containing a data resource array')
  }
  return body.data.map((item) => Object.fromEntries(Object.entries(item)))
}

export function responseIds(body: unknown): number[] {
  return responseItems(body).map((item) => {
    if (!('id' in item) || typeof item.id !== 'number') {
      throw new Error('Expected every response resource to contain a numeric id')
    }
    return item.id
  })
}

export function responseResource(body: unknown): Record<string, unknown> {
  if (
    typeof body !== 'object' ||
    body === null ||
    !('data' in body) ||
    typeof body.data !== 'object' ||
    body.data === null ||
    Array.isArray(body.data)
  ) {
    throw new Error('Expected a response containing a single data resource')
  }
  return Object.fromEntries(Object.entries(body.data))
}

export function responseId(body: unknown): number {
  const resource = responseResource(body)
  if (!('id' in resource) || typeof resource.id !== 'number') {
    throw new Error('Expected the response resource to contain a numeric id')
  }
  return resource.id
}
