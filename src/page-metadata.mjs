/** Require meaningful metadata on every page that uses the starter layout. */
export function validatePageMetadata({ title, description }) {
  for (const [name, value] of Object.entries({ title, description })) {
    if (typeof value !== 'string' || !value.trim()) {
      throw new Error(`Page ${name} must be a non-empty string`);
    }
  }
}
