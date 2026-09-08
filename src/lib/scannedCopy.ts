// Stored object keys are "{officeId}/{uuid}-{original filename}" (or
// "shared/forms/{uuid}-{original filename}") — see the key construction in
// /api/upload. This turns one back into the name the person actually chose
// when they scanned the document, which is what the registers show in their
// Scanned copy column: a clerk looking for a particular attachment recognises
// "Endorsement-letter.pdf", not an identical row of "View" links.
//
// One definition rather than the regex written out at each call site, so the
// filename on an outgoing version's timeline and the filename in a register
// can never disagree about where the uuid ends.
export function scannedCopyFileName(key: string): string {
  return key.split("/").pop()?.replace(/^[0-9a-f-]{36}-/i, "") || "attachment";
}
