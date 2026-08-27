import { describe, it, expect } from "vitest";
import { isValidTransition, assertTransition, getValidTransitions } from "../src/schemas/TaskStateMachine";

describe("TaskStateMachine", () => {
  describe("isValidTransition", () => {
    it("allows triage → todo", () => {
      expect(isValidTransition("triage", "todo")).toBe(true);
    });

    it("allows todo → running", () => {
      expect(isValidTransition("todo", "running")).toBe(true);
    });

    it("allows running → done", () => {
      expect(isValidTransition("running", "done")).toBe(true);
    });

    it("allows running → todo (yield back)", () => {
      expect(isValidTransition("running", "todo")).toBe(true);
    });

    it("allows triage → done (reject)", () => {
      expect(isValidTransition("triage", "done")).toBe(true);
    });

    it("allows done → triage (reopen)", () => {
      expect(isValidTransition("done", "triage")).toBe(true);
    });

    it("rejects triage → running (must go through todo)", () => {
      expect(isValidTransition("triage", "running")).toBe(false);
    });

    it("rejects todo → done (must go through running)", () => {
      expect(isValidTransition("todo", "done")).toBe(false);
    });

    it("rejects done → running (must reopen to triage first)", () => {
      expect(isValidTransition("done", "running")).toBe(false);
    });
  });

  describe("assertTransition", () => {
    it("throws on invalid transition", () => {
      expect(() => assertTransition("triage", "running", "task-1")).toThrow();
    });

    it("does not throw on valid transition", () => {
      expect(() => assertTransition("triage", "todo", "task-1")).not.toThrow();
    });
  });

  describe("getValidTransitions", () => {
    it("returns valid transitions for triage", () => {
      expect(getValidTransitions("triage")).toEqual(["todo", "done"]);
    });

    it("returns valid transitions for running", () => {
      expect(getValidTransitions("running")).toEqual(["done", "todo"]);
    });
  });
});
