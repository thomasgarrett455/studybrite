import fs from "fs/promises";

const CHUNK_SIZE = 2000;
const OVERLAP_SIZE = 300;
const text = await fs.readFile("./docs/bookofmormon.txt", "utf-8")
const chunks = [];
let position = 0;

while (position < text.length) {
    const end = position + CHUNK_SIZE;
    const chunk = text.slice(position, end)
    chunks.push(chunk)
    position = position + (CHUNK_SIZE - OVERLAP_SIZE)
}

console.log(chunks.length);
console.log(chunks[0]);