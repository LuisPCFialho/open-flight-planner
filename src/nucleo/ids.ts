/** Identificador unico e estavel para entidades persistidas. */
export function novoId(): string {
  return crypto.randomUUID()
}
