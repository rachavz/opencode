export type ParsedTask = { text: string; done: boolean; line: number }

const TASK_RE = /^(\s*)(?:[-*+]|\d+\.)\s+\[( |x|X)\]\s*(\S.*)$/

export function parsePlanTasks(markdown: string): ParsedTask[] {
  const out: ParsedTask[] = []
  const lines = markdown.split(/\r?\n/)
  for (let index = 0; index < lines.length; index++) {
    const match = TASK_RE.exec(lines[index])
    if (!match) continue
    out.push({ text: match[3].trim(), done: match[2].toLowerCase() === "x", line: index })
  }
  return out
}

export function planTaskPrompt(input: { text: string; index: number; total: number; attempt: number }) {
  const retry = input.attempt > 1 ? `\nA previous attempt at this task failed; try a different approach.` : ""
  return [
    `You are working through a plan, one task at a time, inside a single long-running session.`,
    `Task ${input.index + 1} of ${input.total}.`,
    ``,
    input.text,
    ``,
    `Complete ONLY this task. Do not start the next task. When this task is finished, reply with a short summary of what was done.`,
    retry,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
}
