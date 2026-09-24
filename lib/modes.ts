/**
 * A comparison mode bundles everything that changes between "kinds" of test:
 * the system prompt sent to every model, the example prompts, and how each
 * result card renders the reply.
 */
export type ModeId = "game" | "chat" | "svg" | "tests";

/** How a result card displays the model's reply. */
export type RenderKind = "html" | "markdown" | "svg" | "tests";

export type Mode = {
  id: ModeId;
  label: string;
  blurb: string;
  render: RenderKind;
  system?: string;
  placeholder: string;
  /** `tests` is only used by the Code Tests mode (one test per line). */
  examples: { label: string; text: string; tests?: string }[];
};

export const MODES: Mode[] = [
  {
    id: "game",
    label: "🎮 Game / App",
    blurb: "Each model builds a runnable HTML page; play the results side by side.",
    render: "html",
    system:
      "You are an expert front-end game and app developer. When asked to build something, respond with a SINGLE, complete, self-contained HTML document that runs on its own with NO external dependencies, network requests, CDNs, or asset URLs. Put all CSS in a <style> tag and all JavaScript in a <script> tag inside the document. Make it playable and polished. Output ONLY the HTML inside one ```html code block — no explanation before or after.",
    placeholder: "Describe the game or app to build…",
    examples: [
      {
        label: "🐍 Snake",
        text: "Build a playable Snake game with arrow-key controls, a live score counter, increasing speed, and a game-over screen with a restart button.",
      },
      {
        label: "🧱 Breakout",
        text: "Create a Breakout / brick-breaker game with a mouse-controlled paddle, colorful bricks, ball physics, lives, and a win screen.",
      },
      {
        label: "🟦 Tetris",
        text: "Make a Tetris clone with keyboard controls, all 7 tetromino shapes, line clearing, a next-piece preview, and a score display.",
      },
      {
        label: "🔢 2048",
        text: "Build a 2048 puzzle game on a 4x4 grid with arrow-key controls, smooth tile-merge animations, a score, and a game-over state.",
      },
      {
        label: "🐦 Flappy",
        text: "Create a Flappy Bird style game: press space or click to flap, scrolling pipe obstacles with gaps, collision detection, and a score.",
      },
      {
        label: "🎨 Particles",
        text: "Build an interactive particle system on a full-screen canvas that reacts to the mouse, with colorful trails and smooth 60fps animation.",
      },
    ],
  },
  {
    id: "chat",
    label: "💬 Chat",
    blurb: "Plain prompts — compare answers, reasoning, and writing as rendered text.",
    render: "markdown",
    placeholder: "Ask anything…",
    examples: [
      {
        label: "🧠 Reasoning",
        text: "A bat and a ball cost $1.10 in total. The bat costs $1.00 more than the ball. How much does the ball cost? Show your reasoning step by step.",
      },
      {
        label: "📚 Explain",
        text: "Explain how public-key cryptography works to a smart 12-year-old, using one concrete analogy. Keep it under 200 words.",
      },
      {
        label: "✍️ Writing",
        text: "Write a short, punchy product announcement (under 120 words) for a to-do app that deletes tasks you haven't touched in 30 days.",
      },
      {
        label: "🐛 Debug",
        text: "What's wrong with this JavaScript and how do I fix it?\n\nfor (var i = 0; i < 3; i++) {\n  setTimeout(() => console.log(i), 100);\n}",
      },
      {
        label: "📊 Compare",
        text: "Compare PostgreSQL, MongoDB, and SQLite in a markdown table covering: data model, scaling, best use case, and main drawback.",
      },
      {
        label: "🔢 Trivia",
        text: "How many times does the letter 'r' appear in the word 'strawberry'? Answer with just the number, then explain how you counted.",
      },
    ],
  },
  {
    id: "svg",
    label: "🖼️ SVG Art",
    blurb: "Models draw a picture in SVG code — a quick test of spatial reasoning.",
    render: "svg",
    system:
      "You are an expert illustrator who draws with SVG code. Respond with a SINGLE, complete <svg> element with a viewBox attribute and no external references, images, or fonts. Output ONLY the SVG inside one ```svg code block — no explanation before or after.",
    placeholder: "Describe the picture to draw…",
    examples: [
      { label: "🚲 Pelican", text: "Draw a pelican riding a bicycle." },
      { label: "🏙️ Skyline", text: "Draw a city skyline at sunset with reflections in a river." },
      { label: "🐱 Cat", text: "Draw a cute cat sitting on a stack of books." },
      { label: "🚀 Rocket", text: "Draw a retro rocket ship launching, with smoke and stars." },
      { label: "🕐 Clock", text: "Draw an analog clock showing exactly 3:45." },
    ],
  },
  {
    id: "tests",
    label: "🧪 Code Tests",
    blurb:
      "Each model writes a JavaScript function; your test cases run against it in a sandbox and every model gets a score.",
    render: "tests",
    system:
      "You are an expert JavaScript engineer. Implement exactly what is asked as plain JavaScript (no TypeScript) using top-level function or class declarations with the exact names requested. Do not use imports, exports, require, DOM APIs, or network access. Do not include tests, examples, or console output. Output ONLY the code inside one ```javascript code block — no explanation before or after.",
    placeholder: "Describe the function to write — include its exact name and behavior…",
    examples: [
      {
        label: "🔁 FizzBuzz",
        text: "Write a function `fizzBuzz(n)` that returns an array of strings for the numbers 1 to n: \"Fizz\" for multiples of 3, \"Buzz\" for multiples of 5, \"FizzBuzz\" for multiples of both, otherwise the number as a string. For n <= 0 return an empty array.",
        tests: `fizzBuzz(5) ==> ["1", "2", "Fizz", "4", "Buzz"]
fizzBuzz(15)[14] ==> "FizzBuzz"
fizzBuzz(0) ==> []
fizzBuzz(-3) ==> []
fizzBuzz(100).length ==> 100`,
      },
      {
        label: "🏛️ Roman",
        text: "Write a function `toRoman(n)` that converts an integer from 1 to 3999 into a Roman numeral string using standard subtractive notation (e.g. 4 is \"IV\", 9 is \"IX\"). Throw a RangeError for anything outside 1–3999 or non-integers.",
        tests: `toRoman(1) ==> "I"
toRoman(4) ==> "IV"
toRoman(9) ==> "IX"
toRoman(58) ==> "LVIII"
toRoman(1994) ==> "MCMXCIV"
toRoman(3999) ==> "MMMCMXCIX"
(() => { try { toRoman(0); return false } catch (e) { return e instanceof RangeError } })()
(() => { try { toRoman(2.5); return false } catch (e) { return e instanceof RangeError } })()`,
      },
      {
        label: "⏱️ Duration",
        text: "Write a function `parseDuration(str)` that parses strings like \"1h30m\", \"45s\", \"2h 5m 10s\" or \"90m\" into a total number of seconds. Units are h, m and s, each optional but in that order, with optional whitespace between parts. Return null for invalid or empty input.",
        tests: `parseDuration("1h30m") ==> 5400
parseDuration("45s") ==> 45
parseDuration("2h 5m 10s") ==> 7510
parseDuration("90m") ==> 5400
parseDuration("") ==> null
parseDuration("abc") ==> null
parseDuration("5x") ==> null
parseDuration("10s5m") ==> null`,
      },
      {
        label: "🧩 Brackets",
        text: "Write a function `isBalanced(str)` that returns true if every bracket in the string — (), [] and {} — is correctly opened, closed and nested. Characters other than brackets are ignored.",
        tests: `isBalanced("()[]{}") ==> true
isBalanced("{[()()]}") ==> true
isBalanced("(]") ==> false
isBalanced("([)]") ==> false
isBalanced("((") ==> false
isBalanced("") ==> true
isBalanced("fn(a[0], {b: 1})") ==> true
isBalanced(")(") ==> false`,
      },
      {
        label: "🗂️ LRU cache",
        text: "Write a class `LRUCache` whose constructor takes a capacity. It has `get(key)`, which returns the value or -1 if missing and marks the key as recently used, and `put(key, value)`, which inserts or updates a key and evicts the least recently used key when over capacity. Both must be O(1).",
        tests: `(() => { const c = new LRUCache(2); c.put(1, 1); c.put(2, 2); return c.get(1) })() ==> 1
(() => { const c = new LRUCache(2); c.put(1, 1); c.put(2, 2); c.get(1); c.put(3, 3); return c.get(2) })() ==> -1
(() => { const c = new LRUCache(2); c.put(1, 1); c.put(2, 2); c.get(1); c.put(3, 3); return c.get(1) })() ==> 1
(() => { const c = new LRUCache(2); c.put(1, 1); c.put(1, 10); c.put(2, 2); c.put(3, 3); return [c.get(1), c.get(2), c.get(3)] })() ==> [-1, 2, 3]
(() => { const c = new LRUCache(1); c.put("a", 1); c.put("b", 2); return c.get("a") })() ==> -1`,
      },
      {
        label: "📅 Dates",
        text: "Write a function `daysBetween(a, b)` that takes two dates as \"YYYY-MM-DD\" strings and returns the whole number of days from a to b (negative if b is earlier). It must handle leap years correctly and must not be affected by time zones or daylight saving time.",
        tests: `daysBetween("2024-01-01", "2024-03-01") ==> 60
daysBetween("2023-01-01", "2023-03-01") ==> 59
daysBetween("2024-03-10", "2024-03-11") ==> 1
daysBetween("2024-12-31", "2024-01-01") ==> -365
daysBetween("2000-01-01", "2100-01-01") ==> 36525
daysBetween("2024-05-05", "2024-05-05") ==> 0`,
      },
    ],
  },
];

export function getMode(id: string | null | undefined): Mode {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}
