import fs from "fs/promises";

const text = await fs.readFile("./docs/bookofmormon.txt", "utf-8")

console.log("length:", text.length)
console.log("head:", text.slice(0, 1000))
console.log("tail:", text.slice(-500))
