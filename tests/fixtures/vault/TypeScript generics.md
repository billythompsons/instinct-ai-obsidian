---
tags: [typescript, programming]
created: 2026-08-14
---

# TypeScript generics

Generics let you write a function or class that works with many types while
keeping full type information. The classic example is an identity function:

```ts
function identity<T>(arg: T): T {
  return arg;
}
```

The caller picks `T` at each call site — `identity<string>("hello")` returns a
`string`, `identity(42)` returns a `number` — and the compiler checks both.

## Constraints

A bare `T` accepts anything, which is often too loose. Constraints narrow it:

```ts
function longest<T extends { length: number }>(a: T, b: T): T {
  return a.length >= b.length ? a : b;
}
```

Now `T` must have a numeric `length` property, so `longest("abc", "de")`
works but `longest(1, 2)` is a compile error.

## Generic classes and utility types

Classes take type parameters too — `class Box<T> { value: T }` — and the
standard library ships utility types built on generics: `Partial<T>` makes
every property optional, `Pick<T, K>` selects a subset of keys, and
`Record<K, T>` builds an object type from a key union. `Readonly<T>` is handy
for configuration objects you never want mutated after creation.

## When not to use them

Generics add cognitive load. If a function genuinely only handles strings,
type it as `(s: string) => string`. Reach for a type parameter when the
*relationship between inputs and outputs* must be preserved — e.g. a `map`
over arrays, a cache keyed by arbitrary keys, or a form validator that returns
the same shape it received.
