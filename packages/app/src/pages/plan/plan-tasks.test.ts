import { describe, expect, test } from "bun:test"
import { parsePlanTasks, planTaskPrompt } from "./plan-tasks"

describe("parsePlanTasks", () => {
  test("parses checked and unchecked tasks", () => {
    const tasks = parsePlanTasks("# Plan\n\n- [ ] first\n- [x] second\n")
    expect(tasks).toEqual([
      { text: "first", done: false, line: 2 },
      { text: "second", done: true, line: 3 },
    ])
  })

  test("accepts asterisks, numbers, and indentation", () => {
    const tasks = parsePlanTasks("  * [ ] a\n  1. [X] b\n\t- [ ] c\n")
    expect(tasks.map((t) => t.text)).toEqual(["a", "b", "c"])
    expect(tasks.map((t) => t.done)).toEqual([false, true, false])
  })

  test("ignores non-task lines and empty checkboxes", () => {
    const tasks = parsePlanTasks("Some text\n- not a task\n- [ ]\n- [ ] real\n")
    expect(tasks).toEqual([{ text: "real", done: false, line: 3 }])
  })
})

describe("planTaskPrompt", () => {
  test("includes position and single-task instruction", () => {
    const prompt = planTaskPrompt({ text: "Write tests", index: 1, total: 3, attempt: 1 })
    expect(prompt).toContain("Task 2 of 3")
    expect(prompt).toContain("Write tests")
    expect(prompt).toContain("Complete ONLY this task")
  })

  test("mentions retry on later attempts", () => {
    const first = planTaskPrompt({ text: "t", index: 0, total: 1, attempt: 1 })
    const retry = planTaskPrompt({ text: "t", index: 0, total: 1, attempt: 2 })
    expect(first).not.toContain("failed")
    expect(retry).toContain("failed")
  })
})
