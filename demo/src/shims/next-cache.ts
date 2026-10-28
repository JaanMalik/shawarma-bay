// The in-browser API has no server cache, so these do nothing.
export function cacheLife(_profile?: unknown) {}
export function cacheTag(..._tags: string[]) {}
export function revalidateTag(_tag: string) {}
export function revalidatePath(_path: string) {}
