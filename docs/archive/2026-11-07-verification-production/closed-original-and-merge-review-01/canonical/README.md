# Greeting Library

A synthetic TypeScript greeting library for an isolated governance acceptance run. No production data.

## Usage

Import `greet` from `./src/greet.ts` (signature: `greet(name: string): string`) and call it with a name:

```ts
import { greet } from "./src/greet.ts";

greet("Ada"); // "Hello, Ada!"
```

- Non-empty name — returns a personalized greeting:

```ts
greet("Ada"); // "Hello, Ada!"
```

- Empty name — returns the default greeting:

```ts
greet(""); // "Hello, world!"
```
