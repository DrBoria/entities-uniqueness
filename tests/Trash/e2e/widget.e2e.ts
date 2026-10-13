import { test } from "@playwright/test";

type RpcResult<T> = { json?: T };

const helper = { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 };

test("does a thing", async () => {
  void RpcResult;
  void helper;
});
