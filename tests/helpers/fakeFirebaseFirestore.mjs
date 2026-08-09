// Fake stand-in for firebase/firestore, loaded via fakeFirestoreHook.mjs instead of
// the real CDN module during tests. Records every call so tests can assert on
// collection paths / options, and lets tests seed return data for getDoc/getDocs.

export const mockCalls = { setDoc: [], getDoc: [], getDocs: [] };
export const mockData = { docs: new Map(), collections: new Map() };

export function resetMock() {
  mockCalls.setDoc = [];
  mockCalls.getDoc = [];
  mockCalls.getDocs = [];
  mockData.docs = new Map();
  mockData.collections = new Map();
}

export function getFirestore() {
  return { __fakeDb: true };
}

export function doc(db, ...segments) {
  return { __fakeDocRef: true, path: segments.join('/') };
}

export function collection(db, path) {
  return { __fakeCollectionRef: true, path };
}

export function query(ref, ...constraints) {
  return { __fakeQuery: true, ref, constraints };
}

export function orderBy(field, direction = 'asc') {
  return { __type: 'orderBy', field, direction };
}

export function limit(n) {
  return { __type: 'limit', n };
}

export async function setDoc(docRef, data, options) {
  mockCalls.setDoc.push({ path: docRef.path, data, options });
  mockData.docs.set(docRef.path, data);
}

export async function getDoc(docRef) {
  mockCalls.getDoc.push({ path: docRef.path });
  const data = mockData.docs.get(docRef.path);
  return {
    exists: () => data !== undefined,
    data: () => data,
  };
}

export async function getDocs(q) {
  mockCalls.getDocs.push({ query: q });
  let rows = mockData.collections.get(q.ref.path) || [];

  const orderByConstraint = q.constraints.find((c) => c.__type === 'orderBy');
  if (orderByConstraint) {
    const { field, direction } = orderByConstraint;
    rows = [...rows].sort((a, b) => {
      const diff = (a.data[field] || 0) - (b.data[field] || 0);
      return direction === 'desc' ? -diff : diff;
    });
  }

  const limitConstraint = q.constraints.find((c) => c.__type === 'limit');
  if (limitConstraint) {
    rows = rows.slice(0, limitConstraint.n);
  }

  return {
    empty: rows.length === 0,
    docs: rows.map((row) => ({
      id: row.id,
      ref: { path: `${q.ref.path}/${row.id}` },
      data: () => row.data,
    })),
  };
}
