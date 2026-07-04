export function baseSlug(identifier: string): string {
  return identifier
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function assignUniqueSlugs(
  keys: { key: string; namespace: string; identifier: string }[],
  used: Set<string> = new Set()
): Map<string, string> {
  const result = new Map<string, string>();
  for (const { key, namespace, identifier } of keys) {
    let slug = baseSlug(identifier);
    if (used.has(slug)) slug = baseSlug(`${namespace}-${identifier}`);
    let suffix = 2;
    const original = slug;
    while (used.has(slug)) {
      slug = `${original}-${suffix++}`;
    }
    used.add(slug);
    result.set(key, slug);
  }
  return result;
}

/** Claim a unique slug for a one-off item (e.g. a form page) against an existing used-set. */
export function takeUniqueSlug(used: Set<string>, candidate: string): string {
  let slug = baseSlug(candidate);
  let suffix = 2;
  const original = slug;
  while (used.has(slug)) {
    slug = `${original}-${suffix++}`;
  }
  used.add(slug);
  return slug;
}
