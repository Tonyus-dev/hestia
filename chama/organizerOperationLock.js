const activeOrganizerOperations = new Set();

export async function withOrganizerOperationLock(key, fn) {
  if (activeOrganizerOperations.has(key)) {
    throw Object.assign(new Error("Execução ocupada"), { code: "ERUNBUSY" });
  }
  activeOrganizerOperations.add(key);
  try {
    return await fn();
  } finally {
    activeOrganizerOperations.delete(key);
  }
}
